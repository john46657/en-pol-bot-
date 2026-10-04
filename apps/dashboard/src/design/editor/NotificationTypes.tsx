import { NOTIFICATION_KEYS, NOTIFICATION_TYPES } from '@nexus/design/client';
import { Field } from './controls';
import { useEditor } from './state';

/** Welche Benachrichtigungs-Arten die Glocke zeigen darf. Wer das Recht dazu nicht hat, sieht sie trotzdem nicht. */
export function NotificationTypes() {
  const { draft, set, disabled } = useEditor();
  const on = draft.header.notificationTypes;
  return (
    <Field
      path="header.notificationTypes"
      label="Angezeigte Benachrichtigungen"
      hint="Die Glocke zeigt jedem nur Ereignisse, für die er das passende Recht besitzt."
    >
      <fieldset className="perm-group" disabled={disabled}>
        <legend>Arten</legend>
        {NOTIFICATION_KEYS.map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={on.includes(k)}
              onChange={(e) =>
                set(
                  'header.notificationTypes',
                  e.target.checked ? [...on, k] : on.filter((x) => x !== k),
                )
              }
            />{' '}
            {NOTIFICATION_TYPES[k].icon} {NOTIFICATION_TYPES[k].label}
          </label>
        ))}
      </fieldset>
    </Field>
  );
}
