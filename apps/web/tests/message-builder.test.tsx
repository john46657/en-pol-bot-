import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mbDocumentDataSchema } from '@enrp/shared';
import { Markdown } from '../src/pages/message-builder/markdown';
import { MessagePreview } from '../src/pages/message-builder/Preview';
import { useDocAutosave, type MbDoc } from '../src/pages/message-builder/useDocAutosave';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
const ctx = { roleName: (id: string) => (id === '482000000000000001' ? { name: 'Funk', color: 0x3b82f6 } : undefined), channelName: (id: string) => (id === '481000000000000001' ? 'leitstelle' : undefined) };

describe('Discord-Markdown (Vorschau)', () => {
  it('Formatierungen, Links, Erwähnungen – ohne HTML aus dem Text', () => {
    const { container } = render(<div><Markdown ctx={ctx} text={'**fett** *kursiv* __unter__ ~~weg~~ `code` [Website](https://emden.example) <@&482000000000000001> <#481000000000000001> @everyone <b>kein html</b>\n> Zitat\n# Titel\n-# klein\n- Punkt\n```js\nconst a = 1;\n```'} /></div>);
    expect(container.querySelector('strong')).toHaveTextContent('fett');
    expect(container.querySelector('em')).toHaveTextContent('kursiv');
    expect(container.querySelector('u')).toHaveTextContent('unter');
    expect(container.querySelector('s')).toHaveTextContent('weg');
    expect(container.querySelector('code')).toHaveTextContent('code');
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://emden.example');
    expect(screen.getByText('@Funk')).toBeInTheDocument();
    expect(screen.getByText('#leitstelle')).toBeInTheDocument();
    expect(screen.getByText('@everyone')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>kein html</b>');
    expect(container.querySelector('pre')).toHaveTextContent('const a = 1;');
    expect(screen.getByText('Titel')).toHaveClass('font-bold');
    expect(screen.getByText('Punkt')).toBeInTheDocument();
  });
  it('Spoiler wird erst beim Klick sichtbar', async () => {
    render(<Markdown text="||geheim||" />);
    const s = screen.getByTitle('Spoiler');
    expect(s.className).toContain('text-transparent');
    await userEvent.setup().click(s);
    expect(screen.getByTitle('Spoiler').className).not.toContain('text-transparent');
  });
});

describe('Live-Vorschau', () => {
  const data = mbDocumentDataSchema.parse({ messages: [
    { id: 'm1', content: 'Hallo', embeds: [{ id: 'e', title: 'Dienstantritt', description: 'Text', color: '#ff0000', authorName: 'Leitstelle', footerText: 'EN | Polizei', imageUrl: 'https://emden.example/bild.png', fields: [{ id: 'f1', name: 'A', value: '1', inline: true }, { id: 'f2', name: 'B', value: '2', inline: true }, { id: 'f3', name: 'C', value: '3' }] }] },
    { id: 'm2', content: '', rows: [{ id: 'r', type: 'buttons', buttons: [{ id: 'b1', kind: 'link', label: 'Web', url: 'https://emden.example' }, { id: 'b2', kind: 'action', label: 'Info', action: { type: 'reply', text: 'Nur für dich' } }] }] },
  ] });
  it('zeigt alle Nachrichten in Reihenfolge mit Embed, Farbe, Feldern, Footer und Komponenten; Klick wird simuliert', async () => {
    render(<MessagePreview data={data} ctx={ctx} author={{ name: 'EN | POLIZEI', app: true }} />);
    expect(screen.getAllByLabelText(/Vorschau Nachricht/).map((x) => x.getAttribute('aria-label'))).toEqual(['Vorschau Nachricht 1', 'Vorschau Nachricht 2']);
    expect(screen.getByText('EN | POLIZEI')).toBeInTheDocument();
    expect(screen.getByText('APP')).toBeInTheDocument();
    expect(screen.getByText('Dienstantritt').closest('.border-l-4')).toHaveStyle({ borderLeftColor: '#ff0000' });
    expect(screen.getByText('Leitstelle')).toBeInTheDocument();
    expect(screen.getByText('EN | Polizei')).toBeInTheDocument();
    expect(document.querySelector('img[src="https://emden.example/bild.png"]')).not.toBeNull();
    // zwei Inline-Felder nebeneinander, das dritte in eigener Reihe
    expect(screen.getByText('A').closest('.grid')).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('status')).toHaveTextContent('Nur für dich');
    expect(screen.getByRole('button', { name: /Web/ })).toHaveAttribute('title', 'Öffnet https://emden.example');
  });
  it('Webhook-Versand: Aktions-Buttons als nicht möglich markiert', () => {
    render(<MessagePreview data={data} ctx={ctx} author={{ name: 'Hook', app: false }} webhook />);
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('title', 'Über Webhooks nicht möglich');
  });
});

function Harness({ doc }: { doc: MbDoc }) {
  const a = useDocAutosave(doc, false);
  return <div><span data-testid="status">{a.status}</span><span data-testid="err">{a.error}</span><button onClick={() => a.setDoc((d) => ({ ...d, name: `${d.name}!` }))}>edit</button>{a.restorable && <button onClick={a.restore}>restore</button>}</div>;
}
const doc: MbDoc = { id: 'd1', kind: 'DRAFT', name: 'Entwurf', categoryId: null, channelId: null, version: 1, updatedAt: '', data: mbDocumentDataSchema.parse({ messages: [{ id: 'm', content: 'x' }] }) };
const res = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('Autosave', () => {
  it('speichert nach kurzer Pause mit Versionsnummer; Status „gespeichert“ erst nach Bestätigung', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => res(200, { ...doc, name: 'Entwurf!', version: 2 }));
    render(<Harness doc={doc} />);
    await userEvent.setup().click(screen.getByText('edit'));
    expect(screen.getByTestId('status')).toHaveTextContent('pending');
    expect(localStorage.getItem('enrp.mb.backup.d1')).toContain('Entwurf!');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saved'), { timeout: 3000 });
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body))).toMatchObject({ name: 'Entwurf!', version: 1 });
    expect(localStorage.getItem('enrp.mb.backup.d1')).toBeNull();
  });
  it('Fehler wird angezeigt, nie als gespeichert; lokale Sicherung bleibt und lässt sich wiederherstellen', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => res(403, { code: 'PERMISSION_DENIED', message: 'Dafür fehlt dir die Berechtigung.' }));
    const { unmount } = render(<Harness doc={doc} />);
    await userEvent.setup().click(screen.getByText('edit'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'), { timeout: 3000 });
    expect(screen.getByTestId('err')).toHaveTextContent('Berechtigung');
    expect(localStorage.getItem('enrp.mb.backup.d1')).toContain('Entwurf!');
    unmount();
    render(<Harness doc={doc} />);
    expect(screen.getByText('restore')).toBeInTheDocument();
  });
  it('409: Konflikt statt Überschreiben', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => res(409, { code: 'CONFLICT', message: 'Neuere Fassung', details: { current: { ...doc, version: 5 } } }));
    render(<Harness doc={doc} />);
    await userEvent.setup().click(screen.getByText('edit'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('conflict'), { timeout: 3000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  });
});
