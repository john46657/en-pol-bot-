import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerReview, QuestionInput, type Answer, type AttemptQuestion } from '../src/pages/hr/exams/common';

let latest: Answer | undefined;
function Host({ q }: { q: AttemptQuestion }) {
  const [v, setV] = useState<Answer | undefined>();
  latest = v;
  return <QuestionInput q={q} value={v} onChange={setV} />;
}
const base = { image: null, points: 2, partial: false, matches: [] as AttemptQuestion['matches'] };

describe('Prüfungen: Fragen beantworten', () => {
  it('Reihenfolge per Pfeilen, Antwort = ursprüngliche Indizes in gewählter Reihenfolge', async () => {
    const u = userEvent.setup();
    render(<Host q={{ ...base, id: 'o', type: 'ORDER', text: 'Ablauf', options: [{ i: 2, text: 'C' }, { i: 0, text: 'A' }, { i: 1, text: 'B' }] }} />);
    await u.click(screen.getByRole('button', { name: 'A nach oben' }));
    expect(latest).toEqual(['0', '2', '1']);
    await u.click(screen.getByRole('button', { name: 'C nach unten' }));
    expect(latest).toEqual(['0', '1', '2']);
  });

  it('Zuordnung und Lückentext', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<Host q={{ ...base, id: 'm', type: 'MATCH', text: 'Zuordnen', options: [{ i: 0, text: 'Status 1' }, { i: 1, text: 'Status 3' }], matches: [{ i: 1, text: 'Einsatz übernommen' }, { i: 0, text: 'einsatzbereit über Funk' }] }} />);
    await u.selectOptions(screen.getByLabelText('Zuordnung für Status 3'), 'Einsatz übernommen');
    expect(latest).toEqual(['', '1']);
    unmount();
    render(<Host q={{ ...base, id: 'g', type: 'GAP', text: 'Innerorts {{}} km/h, außerorts {{}} km/h.', options: [] }} />);
    await u.type(screen.getByLabelText('Lücke 2'), '100');
    expect(latest).toEqual(['', '100']);
  });

  it('Einsicht markiert richtige und falsche Lücken und zeigt die Lösung', () => {
    render(<AnswerReview q={{ ...base, id: 'g', type: 'GAP', text: 'A {{}} B {{}}', options: [], correct: [], gaps: [['50', 'fünfzig'], ['100']] }} answer={['Fünfzig', '80']} />);
    expect(screen.getByText('Fünfzig')).toHaveClass('text-success');
    expect(screen.getByText('80')).toHaveClass('text-danger');
    expect(screen.getByText(/Lösung: \(1\) 50 \/ fünfzig · \(2\) 100/)).toBeInTheDocument();
  });
});
