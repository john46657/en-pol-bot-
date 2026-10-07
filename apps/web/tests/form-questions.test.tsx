import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormField } from '@enrp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormQuestionsEditor } from '../src/components/FormQuestionsEditor';

let latest: FormField[] = [];
function Host({ initial }: { initial: FormField[] }) {
  const [v, setV] = useState(initial);
  latest = v;
  const [qc] = useState(() => new QueryClient());
  return <QueryClientProvider client={qc}><FormQuestionsEditor value={v} onChange={setV} /></QueryClientProvider>;
}
const q = (key: string, label: string): FormField => ({ key, label, required: true, maxLength: 1000 });

describe('application questions editor (like Appy)', () => {
  it('adds, types, duplicates, reorders and deletes questions with validation settings', async () => {
    const u = userEvent.setup();
    render(<Host initial={[q('experience', 'Erfahrung?'), q('frage1', 'Warum?')]} />);
    expect(screen.getByText('2/50')).toBeTruthy();
    // neue Frage als Auswahl mit zwei Optionen, mehrere erlaubt
    await u.click(screen.getByRole('button', { name: 'Frage hinzufügen' }));
    await u.type(screen.getByLabelText('Text von Frage 3'), 'Welche Schicht?');
    await u.selectOptions(screen.getByLabelText('Typ von Frage 3'), 'CHOICE');
    const third = screen.getByRole('region', { name: 'Frage 3' });
    await u.type(within(third).getByLabelText('Option 1'), 'Früh');
    await u.type(within(third).getByLabelText('Option 2'), 'Spät');
    await u.click(within(third).getByLabelText('Mehrfachauswahl erlauben'));
    expect(latest[2]).toMatchObject({ key: 'frage2', label: 'Welche Schicht?', type: 'CHOICE', multiple: true, options: [{ label: 'Früh' }, { label: 'Spät' }] });
    // Rollen-Auswahl (Liste der Discord-Rollen; ohne gemeldete Server: ID/Erwähnung eintippen)
    await u.selectOptions(screen.getByLabelText('Typ von Frage 2'), 'ROLE');
    const second = screen.getByRole('region', { name: 'Frage 2' });
    await u.type(within(second).getByLabelText('Option 1'), 'Hubschrauber');
    await u.type(within(second).getByLabelText('Rolle von Option 1'), '<@&510000000000000001>{Enter}');
    expect(latest[1]!.options![0]).toEqual({ label: 'Hubschrauber', roleId: '510000000000000001' });
    // Text: Mindestlänge + optional
    const first = screen.getByRole('region', { name: 'Frage 1' });
    await u.click(within(first).getByRole('button', { name: /Prüf-Einstellungen/ }));
    await u.clear(within(first).getByLabelText('Min. Länge (Zeichen)'));
    await u.type(within(first).getByLabelText('Min. Länge (Zeichen)'), '20');
    await u.click(within(first).getByLabelText(/Pflichtfrage/));
    expect(latest[0]).toMatchObject({ minLength: 20, required: false });
    // duplizieren (neuer Schlüssel), verschieben, löschen
    await u.click(screen.getByRole('button', { name: 'Frage 1 duplizieren' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage3', 'frage1', 'frage2']);
    await u.click(screen.getByRole('button', { name: 'Frage 4 nach oben' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage3', 'frage2', 'frage1']);
    await u.click(screen.getByRole('button', { name: 'Frage 2 löschen' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage2', 'frage1']);
    expect(screen.getByText('3/50')).toBeTruthy();
  });
});
