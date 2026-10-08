import { describe, expect, it } from 'vitest';
import { href, isActive, NAV, navFor, sectionFor, visible, visibleTabs } from '../src/nav';

const canOnly = (...perms: string[]) => (p: string) => perms.includes(p);
const leit = NAV.find((n) => n.label === 'Leitstelle')!;

describe('Menü mit zusammengefassten Punkten', () => {
  it('CAD, klassische Leitstelle und Einsätze sind ein Menüpunkt', () => {
    expect(leit.tabs!.map((t) => t.path)).toEqual(['/cad', '/dispatch', '/incidents']);
    expect(NAV.some((n) => n.path === '/dispatch' || n.path === '/incidents')).toBe(false);
  });
  it('sichtbar mit einem erlaubten Reiter, Link führt zum ersten erlaubten', () => {
    const can = canOnly('dispatch.view');
    expect(visible(leit, can)).toBe(true);
    expect(visibleTabs(leit, can).map((t) => t.path)).toEqual(['/dispatch']);
    expect(href(leit, can)).toBe('/dispatch');
    expect(visible(leit, canOnly())).toBe(false);
  });
  it('aktiv auf Reitern und Unterseiten, aber nicht auf ähnlichen Pfaden', () => {
    expect(isActive(leit, '/cad/incidents')).toBe(true);
    expect(isActive(leit, '/incidents')).toBe(true);
    const team = NAV.find((n) => n.label === 'Team')!;
    expect(isActive(team, '/teamchance')).toBe(false);
    expect(sectionFor('/teamlist')).toBe(team);
  });
  it('alte Favoriten zeigen auf den neuen Menüpunkt', () => {
    expect(navFor(NAV, '/teamlist')?.label).toBe('Team');
    expect(navFor(NAV, '/admin/audit')?.label).toBe('Protokolle & Backups');
  });
});
