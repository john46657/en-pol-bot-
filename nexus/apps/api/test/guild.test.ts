import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSelection = vi.fn(async (_g: string, _s: string, v: string | null) => ({
  before: null,
  after: v,
}));
const getSelections = vi.fn(async () => ({ 'log-channel': 'c1' }));
const audit = vi.fn(async () => ({}));
vi.mock('@nexus/database', () => ({
  guildRepository: { setSelection, getSelections },
  auditRepository: { create: audit },
}));

const { checkRoleManageable, computeBotAccess, checkBotPermissions, channelKind, PERM } =
  await import('../src/modules/guild/bot-access.js');
const { SelectionsService } = await import('../src/modules/guild/selections.service.js');

const roles = [
  { id: 'G', position: 0, permissions: String(PERM.VIEW_CHANNEL) },
  { id: 'bot', position: 5, permissions: String(PERM.MANAGE_ROLES | PERM.SEND_MESSAGES) },
  { id: 'low', position: 3, permissions: '0' },
  { id: 'high', position: 8, permissions: '0' },
  { id: 'int', position: 1, permissions: '0', managed: true },
];

describe('Bot-Rechte & Rollenhierarchie', () => {
  const access = computeBotAccess('G', roles, ['bot']);
  it('fasst @everyone und Bot-Rollen zusammen', () => {
    expect(
      checkBotPermissions(access)
        .filter((c) => !c.ok)
        .map((c) => c.key),
    ).toEqual(['EmbedLinks']);
  });
  it('Rolle darunter ist verwaltbar, darüber/gleich nicht', () => {
    expect(checkRoleManageable('G', roles[2]!, access).manageable).toBe(true);
    expect(checkRoleManageable('G', roles[3]!, access)).toMatchObject({
      manageable: false,
      blockedReason: 'hierarchy',
    });
    expect(checkRoleManageable('G', roles[1]!, access).blockedReason).toBe('hierarchy');
  });
  it('Integrationsrolle und @everyone sind nicht verwaltbar', () => {
    expect(checkRoleManageable('G', roles[4]!, access).blockedReason).toBe('managed-role');
    expect(checkRoleManageable('G', roles[0]!, access).blockedReason).toBe('everyone');
  });
  it('ohne „Rollen verwalten“ ist nichts verwaltbar; Administrator umgeht das', () => {
    const none = computeBotAccess('G', roles, ['low']);
    expect(checkRoleManageable('G', roles[4]!, none).blockedReason).toBe('missing-manage-roles');
    const admin = computeBotAccess(
      'G',
      [...roles, { id: 'adm', position: 9, permissions: String(PERM.ADMINISTRATOR) }],
      ['adm'],
    );
    expect(checkRoleManageable('G', roles[3]!, admin).manageable).toBe(true);
    expect(checkBotPermissions(admin).every((c) => c.ok)).toBe(true);
  });
  it('Kanalarten', () => {
    expect([0, 5, 2, 13, 4, 15].map(channelKind)).toEqual([
      'text',
      'text',
      'voice',
      'voice',
      'category',
      'other',
    ]);
  });
});

describe('SelectionsService', () => {
  const discord = {
    listRoles: vi.fn(async () => [
      { id: '111111', manageable: true },
      { id: '222222', manageable: false },
    ]),
    listChannels: vi.fn(async (_g: string, kind: string) =>
      kind === 'voice' ? [{ id: '333333' }] : [{ id: '444444' }],
    ),
  };
  const service = new SelectionsService(discord as never);
  beforeEach(() => vi.clearAllMocks());

  it('speichert gültige Kanal-/Rollenauswahl und schreibt Audit-Log', async () => {
    await service.set('G', 'u1', 'office-waiting-voice', '333333');
    expect(setSelection).toHaveBeenCalledWith('G', 'office-waiting-voice', '333333');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        action: 'settings.selection.set',
        after: { value: '333333' },
      }),
    );
    await service.set('G', 'u1', 'application-review-role', '222222'); // darf nicht verwaltbar sein, da nur Anzeige-Rolle
    expect(setSelection).toHaveBeenCalledTimes(2);
  });
  it('lehnt unbekannte Felder, falschen Kanaltyp und unbekannte IDs ab', async () => {
    await expect(service.set('G', 'u', 'gibt-es-nicht', '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.set('G', 'u', 'office-waiting-voice', '444444')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.set('G', 'u', 'application-review-role', '999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(setSelection).not.toHaveBeenCalled();
  });
  it('verlangt verwaltbare Rolle für Felder, die der Bot vergibt', async () => {
    await expect(service.set('G', 'u', 'application-accepted-role', '222222')).rejects.toThrow(
      /nicht vergeben/,
    );
    await service.set('G', 'u', 'application-accepted-role', '111111');
    expect(setSelection).toHaveBeenCalledOnce();
  });
  it('löscht eine Auswahl mit null ohne Discord-Abfrage', async () => {
    await service.set('G', 'u', 'log-channel', null);
    expect(setSelection).toHaveBeenCalledWith('G', 'log-channel', null);
    expect(discord.listChannels).not.toHaveBeenCalled();
  });
  it('listet alle Felder mit aktuellem Wert', async () => {
    const list = await service.list('G');
    expect(list.find((s) => s.key === 'log-channel')?.value).toBe('c1');
    expect(list.find((s) => s.key === 'office-waiting-voice')?.value).toBeNull();
  });
});
