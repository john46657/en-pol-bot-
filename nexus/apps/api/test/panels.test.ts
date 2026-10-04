import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeDiscordApiError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}
const createMsg = vi.fn(async (..._a: unknown[]) => ({ id: 'newmsg' }));
const editMsg = vi.fn(async (..._a: unknown[]) => undefined);
const deleteMsg = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('@nexus/discord', async () => {
  const real = await vi.importActual<
    typeof import('../../../packages/discord/src/panel-render.js')
  >('../../../packages/discord/src/panel-render.js');
  return {
    ...real,
    DiscordApiError: FakeDiscordApiError,
    createChannelMessage: createMsg,
    editChannelMessage: editMsg,
    deleteChannelMessage: deleteMsg,
  };
});

let store: Record<string, any> = {};
const repo = {
  list: vi.fn(async () => Object.values(store)),
  get: vi.fn(async (g: string, id: string) => (store[id]?.guildId === g ? store[id] : null)),
  create: vi.fn(
    async (g: string, d: any) =>
      (store['p1'] = {
        id: 'p1',
        guildId: g,
        channelId: null,
        messageId: null,
        autoUpdate: true,
        ...d,
      }),
  ),
  update: vi.fn(async (g: string, id: string, d: any) =>
    store[id]?.guildId === g ? (store[id] = { ...store[id], ...d }) : null,
  ),
  markSent: vi.fn(async (_g: string, id: string, c: string, m: string) => {
    Object.assign(store[id], { channelId: c, messageId: m });
    return true;
  }),
  delete: vi.fn(async (_g: string, id: string) => {
    delete store[id];
    return true;
  }),
};
const audit = vi.fn(async () => ({}));
vi.mock('@nexus/database', () => ({ panelRepository: repo, auditRepository: { create: audit } }));

const { PanelsService } = await import('../src/modules/panels/panels.service.js');

const role = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: `R${id}`,
  manageable: true,
  dangerous: false,
  ...o,
});
const discord = {
  listRoles: vi.fn(async () => [
    role('111111'),
    role('222222', { manageable: false }),
    role('333333', { dangerous: true }),
  ]),
  listChannels: vi.fn(async () => [{ id: '555555' }, { id: '666666' }]),
};
const service = new PanelsService(discord as never, { get: () => 'token' } as never);
const config = {
  embed: { title: 'Hallo' },
  buttons: [
    { id: 'abc', label: 'Los', style: 'primary', action: { type: 'message', content: 'Hi' } },
  ],
};

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

describe('PanelsService – Konfiguration', () => {
  it('speichert gültige Panels und schreibt Audit', async () => {
    const p = await service.create('G', 'u1', { name: ' Willkommen ', config });
    expect(p.name).toBe('Willkommen');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'panel.create', resourceType: 'Panel', actorId: 'u1' }),
    );
  });
  it('lehnt ungültige Konfiguration und Namen mit verständlichen Fehlern ab', async () => {
    await expect(service.create('G', 'u', { name: '', config })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create('G', 'u', { name: 'x', config: { embed: {}, buttons: [] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('G', 'u', { name: 'x', config: 'kaputt' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });
  const roleCfg = (roleId: string) => ({
    ...config,
    buttons: [
      { id: 'abc', label: 'Rolle', style: 'success', action: { type: 'role-toggle', roleId } },
    ],
  });
  it('prüft Rollen-Aktionen: existiert, verwaltbar, nicht gefährlich', async () => {
    await expect(
      service.create('G', 'u', { name: 'x', config: roleCfg('999999') }),
    ).rejects.toThrow(/gibt/);
    await expect(
      service.create('G', 'u', { name: 'x', config: roleCfg('222222') }),
    ).rejects.toThrow(/nicht vergeben/);
    await expect(
      service.create('G', 'u', { name: 'x', config: roleCfg('333333') }),
    ).rejects.toThrow(/Verwaltungsrechte/);
    await expect(
      service.create('G', 'u', { name: 'x', config: roleCfg('111111') }),
    ).resolves.toBeTruthy();
  });
  it('Panels anderer Server sind unsichtbar', async () => {
    await service.create('G', 'u', { name: 'x', config });
    await expect(service.get('ANDERER', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('ANDERER', 'u', 'p1', { name: 'y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.send('ANDERER', 'u', 'p1', '555555')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('ANDERER', 'u', 'p1', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PanelsService – Senden & Aktualisieren', () => {
  beforeEach(async () => {
    await service.create('G', 'u', { name: 'x', config });
    vi.clearAllMocks();
  });
  it('sendet in einen Textkanal und merkt sich Kanal und Nachricht', async () => {
    expect(await service.send('G', 'u', 'p1', '555555')).toEqual({
      channelId: '555555',
      messageId: 'newmsg',
      mode: 'sent',
    });
    expect(createMsg).toHaveBeenCalledWith(
      'token',
      '555555',
      expect.objectContaining({ embeds: [expect.objectContaining({ title: 'Hallo' })] }),
    );
    expect(store['p1']).toMatchObject({ channelId: '555555', messageId: 'newmsg' });
  });
  it('lehnt unbekannte Kanäle und fehlende Kanalangabe ab', async () => {
    await expect(service.send('G', 'u', 'p1', '999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.send('G', 'u', 'p1', undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(createMsg).not.toHaveBeenCalled();
  });
  it('bearbeitet bei erneutem Senden in denselben Kanal statt neu zu posten', async () => {
    await service.send('G', 'u', 'p1', '555555');
    const r = await service.send('G', 'u', 'p1', '555555');
    expect(r.mode).toBe('edited');
    expect(editMsg).toHaveBeenCalledTimes(1);
    expect(createMsg).toHaveBeenCalledTimes(1);
  });
  it('sendet neu, wenn die Nachricht auf Discord gelöscht wurde (404)', async () => {
    await service.send('G', 'u', 'p1', '555555');
    editMsg.mockRejectedValueOnce(new FakeDiscordApiError(404));
    expect((await service.send('G', 'u', 'p1', '555555')).mode).toBe('sent');
    expect(createMsg).toHaveBeenCalledTimes(2);
  });
  it('entfernt beim Kanalwechsel die alte Nachricht', async () => {
    await service.send('G', 'u', 'p1', '555555');
    await service.send('G', 'u', 'p1', '666666');
    expect(deleteMsg).toHaveBeenCalledWith('token', '555555', 'newmsg');
    expect(store['p1'].channelId).toBe('666666');
  });
  it('übersetzt fehlende Kanalrechte in eine klare Meldung', async () => {
    createMsg.mockRejectedValueOnce(new FakeDiscordApiError(403));
    await expect(service.send('G', 'u', 'p1', '555555')).rejects.toThrow(/nicht schreiben/);
  });
  it('aktualisiert die gesendete Nachricht automatisch bei Änderung der Konfiguration', async () => {
    await service.send('G', 'u', 'p1', '555555');
    const r = await service.update('G', 'u', 'p1', {
      config: { ...config, embed: { title: 'Neu' } },
    });
    expect(r.synced).toBe('updated');
    expect(editMsg).toHaveBeenCalledWith(
      'token',
      '555555',
      'newmsg',
      expect.objectContaining({ embeds: [expect.objectContaining({ title: 'Neu' })] }),
    );
  });
  it('aktualisiert nicht, wenn autoUpdate aus ist oder nur der Name geändert wird', async () => {
    await service.send('G', 'u', 'p1', '555555');
    editMsg.mockClear();
    expect((await service.update('G', 'u', 'p1', { name: 'nur Name' })).synced).toBe('skipped');
    store['p1'].autoUpdate = false;
    expect((await service.update('G', 'u', 'p1', { config })).synced).toBe('skipped');
    expect(editMsg).not.toHaveBeenCalled();
  });
  it('speichert trotzdem, wenn die automatische Aktualisierung scheitert', async () => {
    await service.send('G', 'u', 'p1', '555555');
    editMsg.mockRejectedValueOnce(new FakeDiscordApiError(500));
    const r = await service.update('G', 'u', 'p1', {
      config: { ...config, embed: { title: 'X' } },
    });
    expect(r.synced).toBe('failed');
    expect((r.panel.config as any).embed.title).toBe('X');
  });
  it('löscht das Panel und optional die Nachricht', async () => {
    await service.send('G', 'u', 'p1', '555555');
    await service.remove('G', 'u', 'p1', true);
    expect(deleteMsg).toHaveBeenCalledWith('token', '555555', 'newmsg');
    expect(store['p1']).toBeUndefined();
  });
});
