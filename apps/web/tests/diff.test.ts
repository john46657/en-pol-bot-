import { describe, expect, it } from 'vitest';
import { diffLines } from '../src/lib/diff';

describe('diffLines', () => {
  it('marks added, removed and unchanged lines in order', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'add', text: 'x' }, { kind: 'same', text: 'c' }, { kind: 'add', text: 'd' },
    ]);
  });
  it('identical texts have no changes', () => {
    expect(diffLines('eins\nzwei', 'eins\nzwei').every((l) => l.kind === 'same')).toBe(true);
  });
});
