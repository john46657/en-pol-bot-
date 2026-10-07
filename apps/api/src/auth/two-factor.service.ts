import { Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { decryptSecret, encryptSecret } from '../cad/erlc-crypto';
import { newRecoveryCodes, newSecret, normalizeRecovery, otpauthUrl, verifyTotp } from './totp';

const TICKET_MS = 5 * 60_000;
const ISSUER = 'EN Polizei';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Zwei-Faktor-Anmeldung (TOTP) für den Passwort-Login. Das Geheimnis liegt verschlüsselt in der Datenbank
 * (gleicher Schlüssel wie die ER:LC-Server-Keys: `ERLC_SECRET_KEY` bzw. `SESSION_SECRET`). Zwischen Passwort und Code
 * bekommt der Browser nur ein kurzlebiges, signiertes Ticket – erst nach dem Code entsteht eine Session.
 */
@Injectable()
export class TwoFactorService {
  private readonly env = loadEnv();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ───────────── Ticket zwischen Passwort und Code ─────────────

  private sign(payload: string) { return createHmac('sha256', `2fa:${this.env.SESSION_SECRET}`).update(payload).digest('base64url'); }

  issueTicket(userId: string, now = Date.now()) {
    const payload = `${userId}.${now + TICKET_MS}`;
    return `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
  }

  /** Benutzer-ID aus einem gültigen, nicht abgelaufenen Ticket – sonst `null`. */
  readTicket(ticket: string, now = Date.now()): string | null {
    const [p, sig] = ticket.split('.');
    if (!p || !sig) return null;
    const payload = Buffer.from(p, 'base64url').toString('utf8');
    const expected = Buffer.from(this.sign(payload)), got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    const [userId, exp] = payload.split('.');
    return userId && Number(exp) > now ? userId : null;
  }

  // ───────────── Prüfung ─────────────

  /**
   * Prüft einen Authenticator- oder Wiederherstellungscode und „verbraucht“ ihn (TOTP-Zeitschritt bzw. Code wird
   * entfernt). Atomar: zwei gleichzeitige Anmeldungen mit demselben Code gelingen nicht beide.
   */
  async consume(userId: string, code: string): Promise<'totp' | 'recovery' | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpRecovery: true } });
    if (!u?.totpEnabledAt || !u.totpSecret) return null;
    const secret = decryptSecret(u.totpSecret);
    const step = secret ? verifyTotp(secret, code, Date.now(), u.totpLastStep) : null;
    if (step !== null) {
      const r = await this.prisma.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
      return r.count ? 'totp' : null;
    }
    const norm = normalizeRecovery(code);
    if (norm.length !== 10) return null;
    const hash = sha256(norm);
    if (!u.totpRecovery.includes(hash)) return null;
    const r = await this.prisma.user.updateMany({ where: { id: userId, totpRecovery: { has: hash } }, data: { totpRecovery: u.totpRecovery.filter((h) => h !== hash) } });
    return r.count ? 'recovery' : null;
  }

  // ───────────── Selbstverwaltung ─────────────

  async status(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, totpRecovery: true } });
    return { enabled: !!u.totpEnabledAt, enabledAt: u.totpEnabledAt, recoveryCodesLeft: u.totpEnabledAt ? u.totpRecovery.length : 0 };
  }

  /** Schritt 1: neues Geheimnis erzeugen (noch nicht aktiv, bis ein Code bestätigt wurde). */
  async setup(actor: Actor & { userId: string }) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { username: true, totpEnabledAt: true } });
    if (u.totpEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already enabled.');
    const secret = newSecret();
    await this.prisma.user.update({ where: { id: actor.userId }, data: { totpPending: encryptSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, u.username, ISSUER) };
  }

  /** Schritt 2: Code aus der App bestätigen → aktiv; liefert die Wiederherstellungscodes (nur dieses eine Mal). */
  async enable(actor: Actor & { userId: string }, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { totpPending: true, totpEnabledAt: true } });
    if (u.totpEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already enabled.');
    const secret = u.totpPending ? decryptSecret(u.totpPending) : null;
    if (!secret) throw new AppError('CONFLICT', 'Start the setup first.');
    const step = verifyTotp(secret, code);
    if (step === null) throw new AppError('VALIDATION_FAILED', 'The code is not correct. Check the time on your phone and try again.');
    const codes = newRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { totpSecret: u.totpPending, totpPending: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: codes.map((c) => sha256(normalizeRecovery(c))) } });
      await this.audit.record(actor, { action: 'auth.2fa.enable', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
    });
    return { recoveryCodes: codes };
  }

  async disable(actor: Actor & { userId: string }, code: string) {
    if (!(await this.consume(actor.userId, code))) throw new AppError('VALIDATION_FAILED', 'The code is not correct.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: TwoFactorService.cleared });
      await this.audit.record(actor, { action: 'auth.2fa.disable', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
    });
  }

  async regenerateRecovery(actor: Actor & { userId: string }, code: string) {
    if (!(await this.consume(actor.userId, code))) throw new AppError('VALIDATION_FAILED', 'The code is not correct.');
    const codes = newRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { totpRecovery: codes.map((c) => sha256(normalizeRecovery(c))) } });
      await this.audit.record(actor, { action: 'auth.2fa.recovery_regenerate', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
    });
    return { recoveryCodes: codes };
  }

  static readonly cleared = { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: [] as string[] };
}
