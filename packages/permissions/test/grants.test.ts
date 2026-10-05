import {
  PERMISSIONS,
  PERMISSION_TEMPLATES,
  permissionAlias,
  permissionFromAlias,
  resolveTemplate,
} from '@nexus/types';
import { describe, expect, it } from 'vitest';
import {
  decide,
  describeMissing,
  effective,
  explain,
  permissionDeniedMessage,
  stateOf,
  type Grant,
} from '../src/grants.js';

const g = (
  key: string,
  effect: 'ALLOW' | 'DENY' = 'ALLOW',
  scope: 'SERVER' | 'TEAM' | 'RECORD' = 'SERVER',
  scopeRef = '',
  source: Grant['source'] = { kind: 'role', roleId: 'r1', roleName: 'Rolle' },
): Grant => ({ key, effect, scope, scopeRef, source });

describe('Erlaubnis und Sperre', () => {
  it('ohne Zuordnung: nein', () => {
    expect(decide([], 'training.view')).toMatchObject({ allowed: false, state: 'none' });
  });

  it('Erlaubnis gilt; <modul>.manage schließt das Modul ein, aber nicht andere', () => {
    expect(decide([g('training.view')], 'training.view').allowed).toBe(true);
    expect(decide([g('training.manage')], 'training.edit').allowed).toBe(true);
    expect(decide([g('training.manage')], 'exam.manage').allowed).toBe(false);
  });

  it('eine Sperre schlägt jede Erlaubnis – auch aus anderer Quelle', () => {
    const grants = [
      g('promotions.approve'),
      g('promotions.approve', 'DENY', 'SERVER', '', { kind: 'profile', profileName: 'Stellv.' }),
    ];
    const d = decide(grants, 'promotions.approve');
    expect(d).toMatchObject({ allowed: false, state: 'denied' });
    expect(d.by[0]?.source.profileName).toBe('Stellv.');
  });

  it('Sperre auf einen Schlüssel sperrt nicht den Rest des Moduls (Stellv.-Polizeileitung-Fall)', () => {
    const grants = [g('promotions.manage'), g('promotions.approve', 'DENY')];
    expect(decide(grants, 'promotions.approve').allowed).toBe(false);
    expect(decide(grants, 'promotions.create').allowed).toBe(true);
    expect(decide(grants, 'promotions.view').allowed).toBe(true);
  });

  it('Sperre auf <modul>.manage sperrt nur manage selbst', () => {
    const grants = [g('training.manage', 'DENY'), g('training.view')];
    expect(decide(grants, 'training.view').allowed).toBe(true);
    expect(decide(grants, 'training.manage').allowed).toBe(false);
  });

  it('mehrere Quellen werden vereinigt', () => {
    const grants = [g('shifts.start'), g('shifts.end', 'ALLOW', 'SERVER', '', { kind: 'user' })];
    expect(decide(grants, 'shifts.start').allowed && decide(grants, 'shifts.end').allowed).toBe(
      true,
    );
  });
});

describe('Ebenen (Team, Datensatz)', () => {
  const teamGrant = g('team.member.manage', 'ALLOW', 'TEAM');

  it('TEAM ohne Referenz: nur Daten der eigenen Teams', () => {
    const subject = { teamIds: ['streife'] };
    expect(decide([teamGrant], 'team.member.manage', { teamId: 'streife' }, subject).allowed).toBe(
      true,
    );
    expect(decide([teamGrant], 'team.member.manage', { teamId: 'sek' }, subject).allowed).toBe(
      false,
    );
    expect(decide([teamGrant], 'team.member.manage', {}, subject).allowed).toBe(false); // ohne Teambezug nicht serverweit
    expect(decide([teamGrant], 'team.member.manage', { teamId: 'streife' }, {}).allowed).toBe(
      false,
    ); // kein Team
  });

  it('TEAM mit Referenz gilt für genau dieses Team', () => {
    const t = g('team.view', 'ALLOW', 'TEAM', 'ermittlung');
    expect(decide([t], 'team.view', { teamId: 'ermittlung' }).allowed).toBe(true);
    expect(decide([t], 'team.view', { teamId: 'streife' }, { teamIds: ['streife'] }).allowed).toBe(
      false,
    );
  });

  it('SERVER-Erlaubnis gilt für alle Teams (Polizeileitung vs. Teamleitung)', () => {
    expect(decide([g('personnel.view')], 'personnel.view', { teamId: 'beliebig' }).allowed).toBe(
      true,
    );
  });

  it('Team-Sperre trifft nur dieses Team', () => {
    const grants = [g('personnel.view'), g('personnel.view', 'DENY', 'TEAM', 'sek')];
    expect(decide(grants, 'personnel.view', { teamId: 'sek' }).allowed).toBe(false);
    expect(decide(grants, 'personnel.view', { teamId: 'streife' }).allowed).toBe(true);
    expect(decide(grants, 'personnel.view', {}).allowed).toBe(true);
  });

  it('RECORD gilt nur für den Datensatz', () => {
    const r = g('personnel.edit', 'ALLOW', 'RECORD', 'akte-1');
    expect(decide([r], 'personnel.edit', { recordId: 'akte-1' }).allowed).toBe(true);
    expect(decide([r], 'personnel.edit', { recordId: 'akte-2' }).allowed).toBe(false);
    expect(decide([r], 'personnel.edit', {}).allowed).toBe(false);
  });
});

describe('Zustände und Erklärung', () => {
  it('stateOf unterscheidet serverweit, eingeschränkt, gesperrt, keine', () => {
    expect(stateOf([g('shifts.view')], 'shifts.view')).toBe('allowed');
    expect(stateOf([g('shifts.view', 'ALLOW', 'TEAM')], 'shifts.view')).toBe('limited');
    expect(stateOf([g('shifts.view'), g('shifts.view', 'DENY')], 'shifts.view')).toBe('denied');
    expect(stateOf([], 'shifts.view')).toBe('none');
  });

  it('effective liefert für jeden Katalog-Schlüssel einen Zustand', () => {
    const e = effective([g('training.manage')]);
    expect(e).toHaveLength(PERMISSIONS.length);
    expect(e.find((x) => x.key === 'training.view')?.state).toBe('allowed');
    expect(e.find((x) => x.key === 'exam.manage')?.state).toBe('none');
  });

  it('explain nennt Quelle (Rolle → Profil → Recht) und markiert manage-Herkunft', () => {
    const grants = [
      g('applications.submissions.accept', 'ALLOW', 'SERVER', '', {
        kind: 'profile',
        roleName: 'Personalabteilung',
        profileName: 'Personalverwaltung',
      }),
      g('applications.manage', 'ALLOW', 'SERVER', '', { kind: 'role', roleName: 'Leitung' }),
    ];
    const x = explain(grants, 'applications.submissions.accept');
    expect(x.state).toBe('allowed');
    expect(x.entries).toHaveLength(2);
    expect(x.entries.find((e) => e.source.kind === 'profile')).toMatchObject({
      viaManage: false,
      source: { roleName: 'Personalabteilung', profileName: 'Personalverwaltung' },
    });
    expect(x.entries.find((e) => e.source.kind === 'role')?.viaManage).toBe(true);
  });
});

describe('Verständliche Fehlermeldungen', () => {
  it('zeigt Beschriftungen statt interner Schlüssel', () => {
    const msg = permissionDeniedMessage(['applications.submissions.accept']);
    expect(msg).toContain('Einreichungen annehmen');
    expect(msg).toContain('Wende dich an einen Administrator');
    expect(msg).not.toMatch(/applications\.|APPLICATION_/);
  });

  it('mehrere Alternativen und unbekannte Schlüssel', () => {
    expect(describeMissing(['shifts.start', 'shifts.end'])).toBe(
      'Shift starten oder Shift beenden',
    );
    expect(describeMissing(['gibt.es.nicht'])).toBe('eine passende Berechtigung');
  });
});

describe('Vorlagen (Daten statt Code)', () => {
  it('enthält die zwölf Beispielrollen und keine Leitstelle', () => {
    expect(PERMISSION_TEMPLATES.map((t) => t.name)).toEqual([
      'Serverleitung',
      'Polizeileitung',
      'Stellv. Polizeileitung',
      'Personalabteilung',
      'Ausbildungsleitung',
      'Ausbilder',
      'Teamleitung',
      'Stellv. Teamleitung',
      'SEK-Leitung',
      'SEK-Mitglied',
      'Beamter',
      'Polizeianwärter',
    ]);
    expect(JSON.stringify(PERMISSION_TEMPLATES).toLowerCase()).not.toContain('dispatch');
    expect(PERMISSIONS.some((p) => p.startsWith('dispatch'))).toBe(false);
  });

  it('alle Schlüssel jeder Vorlage existieren im Katalog', () => {
    for (const t of PERMISSION_TEMPLATES) {
      const r = resolveTemplate(t.key)!;
      for (const a of r.allow) expect(PERMISSIONS, `${t.key}: ${a.key}`).toContain(a.key);
      for (const d of r.deny) expect(PERMISSIONS, `${t.key}: ${d}`).toContain(d);
    }
  });

  it('extends übernimmt Rechte und ergänzt Sperren (Stellv. Polizeileitung)', () => {
    const base = resolveTemplate('polizeileitung')!;
    const stv = resolveTemplate('stv-polizeileitung')!;
    expect(stv.allow.map((a) => a.key).sort()).toEqual(base.allow.map((a) => a.key).sort());
    expect(stv.deny).toEqual(expect.arrayContaining(['config.edit', 'permissions.edit']));
  });

  it('Teamleitung ist auf das eigene Team beschränkt', () => {
    const r = resolveTemplate('teamleitung')!;
    expect(r.allow.every((a) => a.scope === 'TEAM')).toBe(true);
    const grants: Grant[] = r.allow.map((a) => g(a.key, 'ALLOW', a.scope ?? 'SERVER'));
    expect(
      decide(grants, 'team.member.manage', { teamId: 'streife' }, { teamIds: ['streife'] }).allowed,
    ).toBe(true);
    expect(
      decide(grants, 'team.member.manage', { teamId: 'sek' }, { teamIds: ['streife'] }).allowed,
    ).toBe(false);
  });

  it('Stellv. Teamleitung: Beförderungen gesperrt trotz Rolle mit promotions.manage', () => {
    const stv = resolveTemplate('stv-teamleitung')!;
    const grants: Grant[] = [g('promotions.manage'), ...stv.deny.map((k) => g(k, 'DENY'))];
    expect(decide(grants, 'promotions.approve').allowed).toBe(false);
    expect(decide(grants, 'promotions.view').allowed).toBe(true);
  });

  it('Normaler Beamter darf nur Eigenes, keine Verwaltung', () => {
    const r = resolveTemplate('beamter')!;
    const grants = r.allow.map((a) => g(a.key));
    expect(decide(grants, 'own.profile.view').allowed).toBe(true);
    for (const k of [
      'personnel.edit',
      'applications.submissions.accept',
      'roles.edit',
      'team.manage',
      'promotions.approve',
    ]) {
      expect(decide(grants, k).allowed, k).toBe(false);
    }
  });

  it('Aliase der Spezifikation lassen sich auflösen', () => {
    expect(permissionFromAlias('APPLICATION_ACCEPT')).toBe('applications.submissions.accept');
    expect(permissionFromAlias('OWN_PROFILE_VIEW')).toBe('own.profile.view');
    expect(permissionAlias('team.member.manage')).toBe('TEAM_MEMBER_MANAGE');
    expect(permissionFromAlias('NOPE')).toBeUndefined();
  });
});

describe('Vorlagen und Personalakten (Phase 11)', () => {
  it('Teamleitung darf Personalakten nur im eigenen Team sehen, Polizeileitung/Personal serverweit', () => {
    const grants = (key: string) =>
      resolveTemplate(key)!.allow.map((a) => g(a.key, 'ALLOW', a.scope ?? 'SERVER'));
    const lead = grants('teamleitung');
    expect(
      decide(lead, 'personnel.view', { teamId: 'streife' }, { teamIds: ['streife'] }).allowed,
    ).toBe(true);
    expect(
      decide(lead, 'personnel.view', { teamId: 'sek' }, { teamIds: ['streife'] }).allowed,
    ).toBe(false);
    expect(
      decide(lead, 'personnel.discipline.view', { teamId: 'streife' }, { teamIds: ['streife'] })
        .allowed,
    ).toBe(false);
    expect(
      decide(lead, 'personnel.archive', { teamId: 'streife' }, { teamIds: ['streife'] }).allowed,
    ).toBe(false);
    for (const t of ['polizeileitung', 'personalabteilung']) {
      expect(decide(grants(t), 'personnel.view', { teamId: 'beliebig' }).allowed, t).toBe(true);
      expect(decide(grants(t), 'personnel.number.edit', { teamId: 'beliebig' }).allowed, t).toBe(
        true,
      );
    }
    expect(decide(grants('polizeileitung'), 'personnel.discipline.manage').allowed).toBe(true);
    expect(decide(grants('personalabteilung'), 'personnel.discipline.view').allowed).toBe(false);
    expect(decide(grants('beamter'), 'personnel.view').allowed).toBe(false);
  });
});

describe('Sammelrechte in der Auswertung', () => {
  const g = (key: string, effect: 'ALLOW' | 'DENY'): Grant => ({ key, effect, scope: 'SERVER', scopeRef: '', source: { kind: 'role', roleName: 'R' } });
  it('Sammelrecht erlaubt Einzelrecht, eine Sperre auf das Einzelrecht schlägt es', () => {
    expect(decide([g('tickets.handle', 'ALLOW')], 'tickets.close').allowed).toBe(true);
    expect(decide([g('tickets.handle', 'ALLOW'), g('tickets.close', 'DENY')], 'tickets.close').allowed).toBe(false);
    expect(decide([g('tickets.close', 'ALLOW')], 'tickets.claim').allowed).toBe(false);
  });
});

describe('Dashboard-Seitenrechte (nur lesen)', () => {
  const g = (key: string, effect: 'ALLOW' | 'DENY' = 'ALLOW'): Grant => ({ key, effect, scope: 'SERVER', scopeRef: '', source: { kind: 'role', roleName: 'R' } });
  it('dashboard.tickets erlaubt Ansehen und Transkript, aber weder Schließen noch Verwalten', () => {
    const grants = [g('dashboard.tickets')];
    expect(decide(grants, 'tickets.view').allowed).toBe(true);
    expect(decide(grants, 'tickets.transcript.view').allowed).toBe(true);
    for (const k of ['tickets.close', 'tickets.handle', 'tickets.manage', 'tickets.settings.manage', 'tickets.delete']) expect(decide(grants, k).allowed).toBe(false);
  });
  it('jede Seite schaltet nur ihr Lese-Recht frei', () => {
    const pairs: [string, string[], string[]][] = [
      ['dashboard.applications', ['applications.view', 'applications.submissions.view'], ['applications.submissions.accept', 'applications.edit']],
      ['dashboard.logs', ['audit.view'], ['audit.export']],
      ['dashboard.roles', ['permissions.view', 'roles.view'], ['permissions.edit', 'roles.edit']],
      ['dashboard.radio', ['radio.view'], ['radio.channel.manage']],
      ['dashboard.offices', ['office.view'], ['office.manage']],
      ['bot.settings', ['config.view'], ['config.edit']],
    ];
    for (const [page, yes, no] of pairs) {
      for (const k of yes) expect(decide([g(page)], k).allowed, `${page} → ${k}`).toBe(true);
      for (const k of no) expect(decide([g(page)], k).allowed, `${page} ⇏ ${k}`).toBe(false);
    }
  });
  it('dashboard.view allein erlaubt keine Änderung', () => {
    for (const k of ['config.edit', 'tickets.close', 'permissions.edit', 'applications.submissions.accept']) expect(decide([g('dashboard.view')], k).allowed).toBe(false);
  });
  it('eine Sperre auf das Lese-Recht schlägt die Seitenfreigabe', () => {
    expect(decide([g('dashboard.tickets'), g('tickets.view', 'DENY')], 'tickets.view').allowed).toBe(false);
  });
});
