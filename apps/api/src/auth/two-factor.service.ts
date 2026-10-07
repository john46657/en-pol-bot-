import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { decryptSecret, encryptSecret } from '../cad/erlc-crypto';
import { newSecret, otpauthUrl, verifyTotp } from './totp';

const TICKET_MS = 5 * 60_000;
const RECOVERY_COUNT = 10;
const sha = (s: string) => createHash('sha256').update(s.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

/**
 * Zwei-Faktor-Anmeldung (TOTP, Authenticator-App) für den Passwort-Login.
 * - Einrichten: Geheimnis erzeugen → in der App hinzufügen → mit einem Code bestätigen → 10 Wiederherstellungscodes (einmalig sichtbar).
 * - Anmelden: Passwort ok → kurzlebiges Ticket → Code oder Wiederherstellungscode → Sitzung.
 * - Geheimnis verschlüsselt (wie die ER:LC-Keys), Wiederherstellungscodes nur als Hash, jeder Code nur einmal gültig.
 * „Mit Discord anmelden“ nutzt die Zwei-Faktor-Sicherung von Discord und fragt hier nicht zusätzlich.
 */
@Injectable()
export class TwoFactorService {
  private readonly secret = loadEnv().SESSION_SECRET;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---- Ticket zwischen Passwort und Code (signiert, 5 Minuten gültig) ----
  ticket(userId: string) {
    const exp = Date.now() + TICKET_MS;
    const body = `${userId}.${exp}.${randomBytes(8).toString('hex')}`;
    return `${body}.${createHmac('sha256', this.secret).update(`2fa:${body}`).digest('base64url')}`;
  }
  readTicket(ticket: string): string {
    const parts = ticket.split('.');
    if (parts.length !== 4) throw new AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
    const [userId, exp, nonce, sig] = parts as [string, string, string, string];
    const expected = createHmac('sha256', this.secret).update(`2fa:${userId}.${exp}.${nonce}`).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b) || Number(exp) < Date.now()) throw new AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
    return userId;
  }

  /** Code (TOTP) oder Wiederherstellungscode prüfen und verbrauchen. */
  async consume(userId: string, code: string): Promise<'totp' | 'recovery' | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpLastStep: true, totpRecovery: true, totpEnabledAt: true } });
    if (!u?.totpEnabledAt || !u.totpSecret) return null;
    const secret = decryptSecret(u.totpSecret);
    if (secret) {
      const step = verifyTotp(secret, code, Date.now(), u.totpLastStep);
      if (step !== null) {
        // nur verbrauchen, wenn niemand denselben Schritt gerade benutzt hat
        const n = await this.prisma.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
        return n.count ? 'totp' : null;
      }
    }
    const h = sha(code);
    if (/^[A-Z0-9-]{8,14}$/i.test(code.trim()) && u.totpRecovery.includes(h)) {
      await this.prisma.user.update({ where: { id: userId }, data: { totpRecovery: u.totpRecovery.filter((x) => x !== h) } });
      return 'recovery';
    }
    return null;
  }

  async status(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, totpRecovery: true } });
    return { enabled: !!u.totpEnabledAt, enabledAt: u.totpEnabledAt, recoveryLeft: u.totpRecovery.length };
  }

  async setup(actor: Actor) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId! }, select: { username: true, totpEnabledAt: true } });
    if (u.totpEnabledAt) throw new AppError('CONFLICT', 'Zwei-Faktor ist bereits aktiv.');
    const secret = newSecret();
    await this.prisma.user.update({ where: { id: actor.userId! }, data: { totpPending: encryptSecret(secret) } });
    const org = (await this.prisma.systemSetting.findUnique({ where: { key: 'org.name' } }))?.value;
    return { secret, otpauthUrl: otpauthUrl(secret, u.username, typeof org === 'string' ? org : 'EN Polizei') };
  }

  private recoveryCodes() {
    const codes = Array.from({ length: RECOVERY_COUNT }, () => { const r = randomBytes(5).toString('hex').toUpperCase(); return `${r.slice(0, 5)}-${r.slice(5)}`; });
    return { codes, hashes: codes.map(sha) };
  }

  async enable(actor: Actor, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId! }, select: { totpPending: true, totpEnabledAt: true } });
    if (u.totpEnabledAt) throw new AppError('CONFLICT', 'Zwei-Faktor ist bereits aktiv.');
    const secret = u.totpPending ? decryptSecret(u.totpPending) : null;
    if (!secret) throw new AppError('CONFLICT', 'Bitte zuerst die Einrichtung starten.');
    const step = verifyTotp(secret, code);
    if (step === null) throw new AppError('VALIDATION_FAILED', 'Der Code stimmt nicht. Uhrzeit des Handys prüfen und den aktuellen Code eingeben.');
    const { codes, hashes } = this.recoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId! }, data: { totpSecret: encryptSecret(secret), totpPending: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: hashes } });
      await this.audit.record(actor, { action: 'auth.2fa.enable', module: 'auth', entityType: 'User', entityId: actor.userId! }, tx);
    });
    return { recoveryCodes: codes };
  }

  /** Abschalten mit aktuellem Code oder Wiederherstellungscode. */
  async disable(actor: Actor, code: string) {
    if (!(await this.consume(actor.userId!, code))) throw new AppError('VALIDATION_FAILED', 'Der Code stimmt nicht.');
    await this.clear(actor, actor.userId!, 'auth.2fa.disable');
  }

  async regenerate(actor: Actor, code: string) {
    if (!(await this.consume(actor.userId!, code))) throw new AppError('VALIDATION_FAILED', 'Der Code stimmt nicht.');
    const { codes, hashes } = this.recoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId! }, data: { totpRecovery: hashes } });
      await this.audit.record(actor, { action: 'auth.2fa.recovery_regenerated', module: 'auth', entityType: 'User', entityId: actor.userId! }, tx);
    });
    return { recoveryCodes: codes };
  }

  /** Verwaltung: Zwei-Faktor eines Kontos zurücksetzen (Handy verloren und keine Wiederherstellungscodes). */
  async adminReset(actor: Actor, userId: string) {
    if (userId === actor.userId) throw new AppError('CONFLICT', 'Die eigene Zwei-Faktor-Sicherung bitte unter „Persönlich“ abschalten.');
    if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
    await this.clear(actor, userId, 'auth.2fa.reset');
  }

  private async clear(actor: Actor, userId: string, action: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: [] } });
      await this.audit.record(actor, { action, module: 'auth', entityType: 'User', entityId: userId }, tx);
    });
  }
}
