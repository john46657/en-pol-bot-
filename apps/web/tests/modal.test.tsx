import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../src/components/ui';

function Dialog() {
  const [v, setV] = useState('');
  // onClose absichtlich inline (neue Funktion bei jedem Render) – wie in den echten Formularen
  return <Modal open title="Accept" onClose={() => undefined}><label htmlFor="r">Reason</label><textarea id="r" value={v} onChange={(e) => setV(e.target.value)} /></Modal>;
}

describe('modal', () => {
  it('focuses the first field and keeps the focus while typing (does not jump to the close button)', async () => {
    render(<Dialog />);
    const field = screen.getByLabelText('Reason');
    expect(document.activeElement).toBe(field);
    await userEvent.type(field, 'Guter Bewerber');
    expect(document.activeElement).toBe(field);
    expect((field as HTMLTextAreaElement).value).toBe('Guter Bewerber');
  });
});
