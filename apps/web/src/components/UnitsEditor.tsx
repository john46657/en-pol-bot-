import type { FormField } from '@enrp/shared';
import { FormQuestionsEditor } from './FormQuestionsEditor';
import { ApplicationSettingsEditor, defaultAppSettings, withDefaults, type AppCommon } from './ApplicationSettings';
import { Button, Card, Field, Input, Textarea } from './ui';

/** Einheit bzw. weitere Bewerbungsart: steht im Qualifikations-Panel (`quali`) oder im Bewerbungs-Panel (`apply`). */
export interface Unit extends Partial<AppCommon> { key: string; name: string; description: string; roleId?: string; questions: FormField[]; panel?: 'quali' | 'apply' }
export type DraftUnit = Unit & AppCommon & { isNew?: boolean };

const newQuestion = (): FormField => ({ key: 'frage1', label: '', type: 'TEXT', required: true, minLength: 0, maxLength: 1000, options: [], multiple: false });
export const newUnit = (panel: 'quali' | 'apply'): DraftUnit => ({ key: '', name: '', description: '', roleId: '', enabled: true, channelId: '', acceptedChannelId: '', deniedChannelId: '', pingRoleIds: [], settings: defaultAppSettings(), questions: [newQuestion()], isNew: true, panel });

/** Gespeicherte Einheit → Entwurf (die frühere einzelne „Rolle bei Annahme“ wird zu den Accepted Roles). */
export function toDraft(u: Unit): DraftUnit {
  const settings = withDefaults(u.settings);
  if (u.roleId && !settings.roles.accepted.includes(u.roleId)) settings.roles.accepted = [u.roleId, ...settings.roles.accepted];
  return { ...u, roleId: '', enabled: u.enabled ?? true, channelId: u.channelId ?? '', acceptedChannelId: u.acceptedChannelId ?? '', deniedChannelId: u.deniedChannelId ?? '', pingRoleIds: u.pingRoleIds ?? [], settings, panel: u.panel ?? 'quali' };
}
export const fromDraft = ({ isNew: _n, ...u }: DraftUnit): Unit => u;
/** Vollständig genug zum automatischen Speichern? */
export const unitsComplete = (units: DraftUnit[]) => units.every((u) => u.name.trim() && u.questions.length);

/** Einheiten/Bewerbungsarten bearbeiten: Schlüssel, Beschreibung, Einstellungen wie Appy und Fragen. */
export function UnitsEditor({ units, onChange, noun, pendingHint, minCount = 0, maxCount = 25 }: {
  units: DraftUnit[]; onChange: (u: DraftUnit[]) => void; noun: string; pendingHint: string; minCount?: number; maxCount?: number;
}) {
  const patch = (i: number, p: Partial<DraftUnit>) => onChange(units.map((u, j) => (j === i ? { ...u, ...p } : u)));
  return (
    <>
      {units.map((u, i) => (
        <Card key={i} title={u.name || `Neue ${noun}`} actions={<Button size="sm" variant="ghost" disabled={units.length <= minCount} onClick={() => onChange(units.filter((_, j) => j !== i))}>{noun} entfernen</Button>}>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Schlüssel (intern, a-z 0-9 - _)">{(id) => <Input id={id} value={u.key} disabled={!u.isNew} maxLength={24} onChange={(e) => patch(i, { key: e.target.value.toLowerCase() })} />}</Field>
            <Field label="Beschreibung (im Panel angezeigt)">{(id) => <Textarea id={id} rows={2} maxLength={600} value={u.description} onChange={(e) => patch(i, { description: e.target.value })} />}</Field>
          </div>
          <ApplicationSettingsEditor value={u} onChange={(p) => patch(i, p)} name={u.name} onName={(v) => patch(i, { name: v })} pendingHint={pendingHint}
            questions={<section className="grid gap-2"><h3 className="text-base font-semibold">Fragen</h3><FormQuestionsEditor value={u.questions} onChange={(q) => patch(i, { questions: q })} /></section>} />
        </Card>
      ))}
      {units.length >= maxCount && <p className="text-xs text-muted">Höchstens {maxCount} je Panel (Grenze des Discord-Auswahlmenüs).</p>}
    </>
  );
}
