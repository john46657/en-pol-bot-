import { PermissionFlagsBits } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let panel: any = null;
const getPanel = vi.fn(async (_g: string, _id: string) => panel);
vi.mock('@nexus/database', () => ({ panelRepository: { get: getPanel } }));
const { clearRegistry, dispatchComponent } = await import('../src/core/interaction-registry.js');
// Handler registrieren sich beim Import
const mod = await import('../src/panels/panel-handlers.js');
const { panelButtonId, panelSelectId } = await import('@nexus/discord');

const cfg = {
  embed: { title: 'T' },
  buttons: [
    {
      id: 'msg',
      label: 'Info',
      style: 'primary',
      action: { type: 'message', content: 'Hallo Welt' },
    },
    { id: 'role', label: 'Rolle', style: 'success', action: { type: 'role-toggle', roleId: 'R1' } },
    { id: 'adm', label: 'Admin', style: 'danger', action: { type: 'role-toggle', roleId: 'ADM' } },
    { id: 'high', label: 'Hoch', style: 'danger', action: { type: 'role-toggle', roleId: 'HIGH' } },
  ],
  select: {
    options: [{ id: 'o1x', label: 'Eins', action: { type: 'message', content: 'aus Select' } }],
  },
};

function setup(opts: { memberHas?: boolean } = {}) {
  const add = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const roles: Record<string, any> = {
    R1: { id: 'R1', name: 'Fan', managed: false, position: 2, permissions: { any: () => false } },
    ADM: {
      id: 'ADM',
      name: 'Admin',
      managed: false,
      position: 2,
      permissions: { any: (p: bigint[]) => p.includes(PermissionFlagsBits.Administrator) },
    },
    HIGH: {
      id: 'HIGH',
      name: 'Hoch',
      managed: false,
      position: 9,
      permissions: { any: () => false },
    },
  };
  const reply = vi.fn(async (..._a: unknown[]) => undefined);
  const guild = {
    id: 'G',
    roles: { fetch: async (id: string) => roles[id] ?? null },
    members: {
      me: {
        permissions: { has: (p: bigint) => p === PermissionFlagsBits.ManageRoles },
        roles: { highest: { position: 5 } },
      },
    },
  };
  const base = {
    guild,
    guildId: 'G',
    reply,
    member: { roles: { cache: { has: () => !!opts.memberHas }, add, remove } },
  };
  const button = (customId: string) => ({
    ...base,
    customId,
    isButton: () => true,
    isStringSelectMenu: () => false,
  });
  const select = (customId: string, values: string[]) => ({
    ...base,
    customId,
    values,
    isButton: () => false,
    isStringSelectMenu: () => true,
  });
  return { add, remove, reply, button, select };
}
const text = (reply: ReturnType<typeof vi.fn>) =>
  String((reply.mock.calls[0]?.[0] as { content: string }).content);

beforeEach(() => {
  panel = { id: 'p1', guildId: 'G', config: cfg };
  getPanel.mockClear();
});

describe('Panel-Klicks im Bot', () => {
  it('Button mit Nachricht antwortet ephemeral', async () => {
    const s = setup();
    expect(
      await dispatchComponent({} as never, s.button(panelButtonId('p1', 'msg')) as never),
    ).toBe(true);
    expect(text(s.reply)).toBe('Hallo Welt');
    expect(s.reply.mock.calls[0]?.[0]).toMatchObject({
      flags: expect.anything(),
      allowedMentions: { parse: [] },
    });
    expect(getPanel).toHaveBeenCalledWith('G', 'p1'); // guild-scoped
  });
  it('Select-Eintrag führt seine Aktion aus', async () => {
    const s = setup();
    await dispatchComponent({} as never, s.select(panelSelectId('p1'), ['o1x']) as never);
    expect(text(s.reply)).toBe('aus Select');
  });
  it('Rollen-Button vergibt die Rolle bzw. entfernt sie beim zweiten Klick', async () => {
    const a = setup();
    await dispatchComponent({} as never, a.button(panelButtonId('p1', 'role')) as never);
    expect(a.add).toHaveBeenCalledOnce();
    expect(text(a.reply)).toContain('erhalten');
    const b = setup({ memberHas: true });
    await dispatchComponent({} as never, b.button(panelButtonId('p1', 'role')) as never);
    expect(b.remove).toHaveBeenCalledOnce();
    expect(text(b.reply)).toContain('entfernt');
  });
  it('verweigert Rollen mit Verwaltungsrechten und Rollen über dem Bot – auch wenn sie im Panel stehen', async () => {
    const a = setup();
    await dispatchComponent({} as never, a.button(panelButtonId('p1', 'adm')) as never);
    expect(a.add).not.toHaveBeenCalled();
    expect(text(a.reply)).toContain('nicht per Panel');
    const b = setup();
    await dispatchComponent({} as never, b.button(panelButtonId('p1', 'high')) as never);
    expect(b.add).not.toHaveBeenCalled();
    expect(text(b.reply)).toContain('Hierarchie');
  });
  it('unbekanntes/gelöschtes Panel oder Komponente → „nicht mehr aktuell“', async () => {
    const a = setup();
    await dispatchComponent({} as never, a.button(panelButtonId('p1', 'weg')) as never);
    expect(text(a.reply)).toContain('nicht mehr aktuell');
    panel = null;
    const b = setup();
    await dispatchComponent({} as never, b.button(panelButtonId('p1', 'msg')) as never);
    expect(text(b.reply)).toContain('nicht mehr aktuell');
    expect(b.add).not.toHaveBeenCalled();
  });
  it('Panel eines anderen Servers wird über die guild-scoped Abfrage nicht gefunden', async () => {
    getPanel.mockImplementationOnce(async (g: string) => (g === 'G' ? panel : null));
    const s = setup();
    (s.button(panelButtonId('p1', 'msg')) as any).guildId = 'ANDERER';
    const i = { ...s.button(panelButtonId('p1', 'msg')), guildId: 'ANDERER' };
    await dispatchComponent({} as never, i as never);
    expect(text(s.reply)).toContain('nicht mehr aktuell');
  });
});
void mod;
void clearRegistry;
