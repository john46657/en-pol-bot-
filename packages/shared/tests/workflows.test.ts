import { describe, expect, it } from 'vitest';
import { conditionMatches, renderTemplate, triggerMatches } from '../src/workflows';

describe('workflow rules', () => {
  it('matches triggers exactly or by prefix', () => {
    expect(triggerMatches('report.*', 'report.submitted')).toBe(true);
    expect(triggerMatches('report.*', 'reports.x')).toBe(false);
    expect(triggerMatches('incident.create', 'cad.incident.create')).toBe(false);
  });
  it('evaluates conditions case-insensitively, incl. nested fields', () => {
    const after = { priority: 'CRITICAL', unit: { callsign: 'SEK-01' }, notes: null };
    expect(conditionMatches(after, { field: 'priority', op: 'in', value: 'high, critical' })).toBe(true);
    expect(conditionMatches(after, { field: 'unit.callsign', op: 'contains', value: 'sek' })).toBe(true);
    expect(conditionMatches(after, { field: 'notes', op: 'not_exists' })).toBe(true);
    expect(conditionMatches(after, { field: 'priority', op: 'neq', value: 'critical' })).toBe(false);
  });
  it('renders templates and caps values', () => {
    expect(renderTemplate('{{title}} von {{actor}} ({{after.priority}}) {{missing}}', { action: 'incident.create', actor: 'Max', after: { title: 'Bank', priority: 'HIGH' } })).toBe('Bank von Max (HIGH) —');
    expect(renderTemplate('{{x}}', { action: 'a', after: { x: 'y'.repeat(1000) } })).toHaveLength(300);
  });
});
