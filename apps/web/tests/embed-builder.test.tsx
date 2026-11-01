import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mbDocumentDataSchema, validateMbDocument, type MbDocumentData } from '@enrp/shared';
import { JsonEditor, type JsonState } from '../src/pages/message-builder/JsonEditor';
import { MessageEditor } from '../src/pages/message-builder/MessageEditor';
import { MessagePreview } from '../src/pages/message-builder/Preview';
import { SendPanel } from '../src/pages/message-builder/SendPanel';

afterEach(() => { vi.restoreAllMocks(); });
const base = () => mbDocumentDataSchema.parse({ messages: [{ id: 'm1', content: 'Hallo', rows: [{ id: 'b-row', type: 'buttons', buttons: [{ id: 'btn1', kind: 'action', label: 'Info', action: { type: 'reply', text: 'Geheim' } }] }] }] });

/** JSON-Editor + Vorschau gekoppelt wie im Embed Builder. */
function JsonHarness({ onState }: { onState?: (s: JsonState) => void }) {
  const [data, setData] = useState<MbDocumentData>(base());
  return (<div>
    <JsonEditor data={data} onChange={setData} readOnly={false} onState={onState} />
    <MessagePreview data={data} ctx={{}} author={{ name: 'EN | POLIZEI', app: true }} />
    <span data-testid="action">{(data.messages[0]!.rows[0] as { buttons?: { action: { text?: string } }[] })?.buttons?.[0]?.action.text ?? ''}</span>
  </div>);
}

describe('JSON-Editor', () => {
  it('zeigt das Discord-Format und synchronisiert gültige Änderungen sofort mit Vorschau; Aktionen bleiben erhalten', () => {
    render(<JsonHarness />);
    const area = screen.getByLabelText('Nachrichten-JSON') as HTMLTextAreaElement;
    const json = JSON.parse(area.value);
    expect(json.messages[0]).toMatchObject({ content: 'Hallo', components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'btn1', label: 'Info' }] }] });
    json.messages[0].content = 'Geändert über JSON';
    json.messages[0].embeds = [{ title: 'Neues Embed', color: 255 }];
    fireEvent.change(area, { target: { value: JSON.stringify(json, null, 2) } });
    expect(screen.getByRole('status')).toHaveTextContent('Gültig');
    expect(screen.getByText('Geändert über JSON')).toBeInTheDocument();
    expect(screen.getByText('Neues Embed')).toBeInTheDocument();
    expect(screen.getByTestId('action')).toHaveTextContent('Geheim');
  });
  it('ungültiges JSON: Fehler mit Zeile/Spalte, nichts übernommen, Zustand „ungültig“ gemeldet', () => {
    const states: JsonState[] = [];
    render(<JsonHarness onState={(s) => states.push(s)} />);
    const area = screen.getByLabelText('Nachrichten-JSON');
    fireEvent.change(area, { target: { value: '{\n  "messages": [\n    { "content": "x" ,}\n  ]\n}' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Zeile 3, Spalte/);
    expect(screen.getByText('Hallo')).toBeInTheDocument(); // Vorschau unverändert
    expect(states.at(-1)?.valid).toBe(false);
    expect(screen.getByRole('button', { name: /Zur Fehlerstelle/ })).toBeInTheDocument();
    // Struktur falsch → Pfad statt Zeile
    fireEvent.change(area, { target: { value: '{"embeds":[{"title":5}]}' } });
    expect(screen.getByRole('alert')).toHaveTextContent('embeds[0].title');
  });
  it('Formatieren rückt das JSON ein', async () => {
    render(<JsonHarness />);
    const area = screen.getByLabelText('Nachrichten-JSON') as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: '{"content":"kompakt"}' } });
    await userEvent.setup().click(screen.getByRole('button', { name: /Formatieren/ }));
    expect(area.value).toContain('\n  "messages": [');
    expect(area.value).toContain('"content": "kompakt"');
  });
});

describe('Auswahlmenü im Editor', () => {
  it('Mindest-/Höchstanzahl und Pflichtauswahl', async () => {
    function H() {
      const [d, setD] = useState(mbDocumentDataSchema.parse({ messages: [{ id: 'm', rows: [{ id: 's', type: 'select', options: [{ id: 'a', label: 'A', action: { type: 'reply', text: 'a' } }, { id: 'b', label: 'B', action: { type: 'reply', text: 'b' } }] }] }] }));
      const r = d.messages[0]!.rows[0] as { minValues: number; maxValues: number };
      return <div><MessageEditor m={d.messages[0]!} index={0} issues={validateMbDocument(d)} ctx={{ roles: [], channels: [], canRoles: false, readOnly: false }} onChange={(m) => setD({ ...d, messages: [m] })} /><span data-testid="mm">{r.minValues}/{r.maxValues}</span></div>;
    }
    render(<H />);
    expect(screen.getByTestId('mm')).toHaveTextContent('1/1');
    fireEvent.change(screen.getByLabelText('Reihe 1 Höchstanzahl'), { target: { value: '3' } });
    expect(screen.getByTestId('mm')).toHaveTextContent('1/3');
    expect(screen.getAllByRole('alert').some((a) => /Höchstanzahl \(3\)/.test(a.textContent ?? ''))).toBe(true);
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Pflichtauswahl (mind. 1)' }).closest('button') ?? screen.getByRole('switch', { name: 'Pflichtauswahl (mind. 1)' }));
    expect(screen.getByTestId('mm')).toHaveTextContent('0/3');
  });
});

describe('Versand: Vorschau, Threads und Foren', () => {
  const channels = [
    { id: '481000000000000001', name: 'ankuendigungen', type: 'text' as const, category: null, allowed: true, bot: { view: true, send: true, embed: true } },
    { id: '481000000000000002', name: 'dienst', type: 'forum' as const, category: null, allowed: true, bot: { view: true, send: true, embed: true } },
  ];
  const threads = [{ id: '481000000000000009', name: 'Besprechung', parentId: '481000000000000001' }];
  const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
  function H({ blockedReason }: { blockedReason?: string }) {
    const [ch, setCh] = useState<string | null>(null);
    const data = mbDocumentDataSchema.parse({ messages: [{ id: 'm', content: 'Vorschau-Text' }] });
    return <SendPanel data={data} name="T" documentId={null} channelId={ch} onChannel={setCh} channels={channels} threads={threads} issues={[]} can={() => true} webhooks={[]} mode="bot" onMode={() => undefined} serverName="EN | POLIZEI" blockedReason={blockedReason} />;
  }
  it('Forum verlangt Beitragstitel; Thread wählbar; Bestätigung zeigt die Vorschau', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 's1', status: 'QUEUED', mode: 'BOT', channelId: '481000000000000002', channelName: 'dienst', items: [], documentName: 'T', error: null, createdByName: 'x', createdAt: '', finishedAt: null }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const u = userEvent.setup();
    wrap(<H />);
    expect(screen.getByText('EN | POLIZEI')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Discord-Kanal'), '481000000000000002');
    const sendBtn = screen.getByRole('button', { name: /Nachricht senden/ });
    expect(sendBtn).toBeDisabled();
    await u.type(screen.getByLabelText('Titel des neuen Beitrags'), 'Dienstanweisung');
    expect(sendBtn).toBeEnabled();
    await u.click(sendBtn);
    expect(screen.getByText('Vorschau & Versand bestätigen')).toBeInTheDocument();
    expect(screen.getAllByText('Vorschau-Text').length).toBeGreaterThan(0);
    await u.click(screen.getAllByRole('button', { name: 'Nachricht senden' }).at(-1)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body).toMatchObject({ mode: 'bot', channelId: '481000000000000002', threadId: null, threadName: 'Dienstanweisung', confirm: true });
  });
  it('Textkanal: optionaler Thread aus der Liste', async () => {
    const u = userEvent.setup();
    wrap(<H />);
    await u.selectOptions(screen.getByLabelText('Discord-Kanal'), '481000000000000001');
    expect(screen.getByLabelText('Thread')).toHaveValue('');
    await u.selectOptions(screen.getByLabelText('Thread'), '481000000000000009');
    expect(screen.getByRole('button', { name: /Nachricht senden/ })).toBeEnabled();
  });
  it('ungültiges JSON sperrt den Versand', async () => {
    const u = userEvent.setup();
    wrap(<H blockedReason="Ungültiges JSON – wird nicht gesendet." />);
    await u.selectOptions(screen.getByLabelText('Discord-Kanal'), '481000000000000001');
    expect(screen.getByRole('button', { name: /Nachricht senden/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ungültiges JSON');
  });
});
