import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Öffentliche Seite ohne Anmeldung (z. B. für die Roblox-OAuth-App: Datenschutz-URL, Nutzungsbedingungen). */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10 text-fg">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-xs text-muted">EN Polizei – Roleplay-Community (Discord und Roblox ER:LC). Stand: Oktober 2026</p>
        {children}
        <p className="pt-6 text-xs text-muted"><Link className="underline" to="/datenschutz">Datenschutz</Link> · <Link className="underline" to="/nutzungsbedingungen">Nutzungsbedingungen</Link> · <Link className="underline" to="/login">Zum Dashboard</Link></p>
      </article>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Datenschutz">
      <p>Diese Seite erklärt, welche Daten das EN-Polizei-System (Dashboard und Discord-Bot) verarbeitet, wenn du es nutzt – insbesondere bei der Roblox-Verifizierung.</p>
      <h2>Welche Daten?</h2>
      <ul>
        <li><b>Discord:</b> deine Discord-ID, dein Benutzername und deine Rollen auf unseren Servern.</li>
        <li><b>Roblox (bei der Verifizierung):</b> deine Roblox-ID, dein Benutzername und dein Anzeigename. Wir bekommen über „Mit Roblox anmelden“ nur diese Profilangaben (Berechtigungen <i>openid</i> und <i>profile</i>) – niemals dein Passwort.</li>
        <li><b>Dashboard:</b> wenn du ein Konto hast, deine Angaben im Konto sowie deine Aktivitäten im System (z. B. Dienstzeiten, Berichte, Einsätze).</li>
      </ul>
      <h2>Wofür?</h2>
      <ul>
        <li>Um dein Discord-Konto mit deinem Roblox-Konto zu verknüpfen und dir passende Discord-Rollen und deinen Roblox-Namen als Nickname zu geben.</li>
        <li>Für den Betrieb der Roleplay-Community (Dienstplanung, Leitstelle, Bewerbungen, Moderation).</li>
      </ul>
      <h2>Weitergabe</h2>
      <p>Wir verkaufen keine Daten und geben sie nicht an Dritte weiter. Verarbeitet werden sie nur von unserem System sowie von Discord und Roblox selbst, deren eigene Datenschutzbestimmungen gelten.</p>
      <h2>Speicherdauer und Löschung</h2>
      <p>Die Verknüpfung bleibt gespeichert, bis du oder das Team sie entfernt. Möchtest du deine Verknüpfung oder deine Daten löschen lassen, wende dich an das Team auf unserem Discord-Server. Du kannst den Zugriff der App außerdem jederzeit in deinen Roblox-Einstellungen widerrufen.</p>
      <h2>Kontakt</h2>
      <p>Bei Fragen zum Datenschutz erreichst du das Team über unseren Discord-Server.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Nutzungsbedingungen">
      <p>Mit der Nutzung des EN-Polizei-Systems (Dashboard, Discord-Bot, Roblox-Verifizierung) erklärst du dich mit diesen Bedingungen einverstanden.</p>
      <h2>Zweck</h2>
      <p>Das System dient ausschließlich der EN-Polizei-Roleplay-Community auf Discord und in Roblox (ER:LC). Es ist ein Community-Projekt und steht in keiner Verbindung zu Roblox Corporation oder Discord Inc.</p>
      <h2>Verifizierung</h2>
      <ul>
        <li>Verifiziere nur dein eigenes Roblox-Konto.</li>
        <li>Das Team kann Verknüpfungen bei Missbrauch entfernen und Rollen anpassen.</li>
      </ul>
      <h2>Verhalten</h2>
      <ul>
        <li>Es gelten die Regeln unseres Discord-Servers sowie die Nutzungsbedingungen von Discord und Roblox.</li>
        <li>Versuche nicht, das System zu stören, zu umgehen oder fremde Konten zu nutzen.</li>
      </ul>
      <h2>Haftung und Änderungen</h2>
      <p>Das System wird ohne Gewähr bereitgestellt. Wir können Funktionen und diese Bedingungen jederzeit ändern; die aktuelle Fassung steht auf dieser Seite.</p>
      <h2>Kontakt</h2>
      <p>Fragen beantwortet das Team auf unserem Discord-Server.</p>
    </LegalPage>
  );
}
