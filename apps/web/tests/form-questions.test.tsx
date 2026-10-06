import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormField } from '@enrp/shared';
import { FormQuestionsEditor } from '../src/components/FormQuestionsEditor';

let latest: FormField[] = [];
function Host({ initial }: { initial: FormField[] }) {
  const [v, setV] = useState(initial);
  latest = v;
  return <FormQuestionsEditor value={v} onChange={setV} />;
}
const q = (key: string, label: string): FormField => ({ key, label, required: true, maxLength: 1000 });

describe('application questions editor (like Appy)', () => {
  it('adds, types, duplicates, reorders and deletes questions with validation settings', async () => {
    const u = userEvent.setup();
    render(<Host initial={[q('experience', 'Erfahrung?'), q('frage1', 'Warum?')]} />);
    expect(screen.getByText('2/50')).toBeTruthy();
    // neue Frage als Auswahl mit zwei Optionen, mehrere erlaubt
    await u.click(screen.getByRole('button', { name: 'Add question' }));
    await u.type(screen.getByLabelText('Text of question 3'), 'Welche Schicht?');
    await u.selectOptions(screen.getByLabelText('Type of question 3'), 'CHOICE');
    const third = screen.getByRole('region', { name: 'Question 3' });
    await u.type(within(third).getByLabelText('Option 1'), 'Früh');
    await u.type(within(third).getByLabelText('Option 2'), 'Spät');
    await u.click(within(third).getByLabelText('Allow multiple selections'));
    expect(latest[2]).toMatchObject({ key: 'frage2', label: 'Welche Schicht?', type: 'CHOICE', multiple: true, options: [{ label: 'Früh' }, { label: 'Spät' }] });
    // Rollen-Auswahl: Rollen-ID auch als Erwähnung einfügbar
    await u.selectOptions(screen.getByLabelText('Type of question 2'), 'ROLE');
    const second = screen.getByRole('region', { name: 'Question 2' });
    await u.type(within(second).getByLabelText('Option 1'), 'Hubschrauber');
    await u.type(within(second).getByLabelText('Role ID of option 1'), '<@&510000000000000001>');
    expect(latest[1]!.options![0]).toEqual({ label: 'Hubschrauber', roleId: '510000000000000001' });
    // Text: Mindestlänge + optional
    const first = screen.getByRole('region', { name: 'Question 1' });
    await u.click(within(first).getByRole('button', { name: /Validation settings/ }));
    await u.clear(within(first).getByLabelText('Min. length (characters)'));
    await u.type(within(first).getByLabelText('Min. length (characters)'), '20');
    await u.click(within(first).getByLabelText(/Required/));
    expect(latest[0]).toMatchObject({ minLength: 20, required: false });
    // duplizieren (neuer Schlüssel), verschieben, löschen
    await u.click(screen.getByRole('button', { name: 'Duplicate question 1' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage3', 'frage1', 'frage2']);
    await u.click(screen.getByRole('button', { name: 'Move question 4 up' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage3', 'frage2', 'frage1']);
    await u.click(screen.getByRole('button', { name: 'Delete question 2' }));
    expect(latest.map((x) => x.key)).toEqual(['experience', 'frage2', 'frage1']);
    expect(screen.getByText('3/50')).toBeTruthy();
  });
});
