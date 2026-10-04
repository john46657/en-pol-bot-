import type { Client, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRegistry,
  dispatchComponent,
  dispatchModal,
  registerButton,
  registerModal,
  registerSelect,
} from '../src/core/interaction-registry.js';
import { buildCustomId, type CustomIdAction } from '../src/discord/custom-ids.js';

const client = {} as Client;
const id = (a: string, ...args: string[]) => buildCustomId(a as CustomIdAction, ...args);
const comp = (customId: string, kind: 'button' | 'select') =>
  ({
    customId,
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
  }) as unknown as MessageComponentInteraction;

beforeEach(clearRegistry);

describe('Interaction-Registry', () => {
  it('verarbeitet Buttons mit Argumenten', async () => {
    const h = vi.fn(async () => undefined);
    registerButton('t:btn', h);
    expect(await dispatchComponent(client, comp(id('t:btn', 'abc'), 'button'))).toBe(true);
    expect(h.mock.calls[0]?.[1]).toMatchObject({ args: ['abc'] });
  });
  it('verarbeitet Select-Menüs und trennt sie von Buttons', async () => {
    const h = vi.fn(async () => undefined);
    registerSelect('t:sel', h);
    expect(await dispatchComponent(client, comp(id('t:sel'), 'select'))).toBe(true);
    expect(await dispatchComponent(client, comp(id('t:sel'), 'button'))).toBe(false);
    expect(h).toHaveBeenCalledTimes(1);
  });
  it('verarbeitet Modals', async () => {
    const h = vi.fn(async () => undefined);
    registerModal('t:mod', h);
    expect(
      await dispatchModal(client, { customId: id('t:mod', 'x') } as ModalSubmitInteraction),
    ).toBe(true);
    expect(h).toHaveBeenCalledOnce();
  });
  it('ignoriert unbekannte und fremde Custom-IDs', async () => {
    expect(await dispatchComponent(client, comp('fremd:x', 'button'))).toBe(false);
    expect(await dispatchComponent(client, comp(id('unbekannt'), 'button'))).toBe(false);
  });
  it('verhindert doppelte Registrierung', () => {
    registerButton('t:dup', async () => undefined);
    expect(() => registerButton('t:dup', async () => undefined)).toThrow();
  });
});

describe('parseCustomId (Regression: Aktionen mit Doppelpunkt)', () => {
  it('erkennt eingebaute Aktionen samt Argumenten', async () => {
    const { parseCustomId, CustomIdAction } = await import('../src/discord/custom-ids.js');
    expect(parseCustomId(buildCustomId(CustomIdAction.PANEL_START, 'app1'))).toEqual({
      action: 'panel:start',
      args: ['app1'],
    });
    expect(parseCustomId(buildCustomId(CustomIdAction.DM_EDIT_ANSWER, 's', 'q'))).toEqual({
      action: 'dm:edit',
      args: ['s', 'q'],
    });
    expect(parseCustomId(buildCustomId(CustomIdAction.REVIEW_ACCEPT_REASON, 's'))?.action).toBe(
      'review:accept_r',
    );
    expect(parseCustomId('fremd:x')).toBeNull();
  });
});
