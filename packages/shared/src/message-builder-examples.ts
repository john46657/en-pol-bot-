import { mbDocumentDataSchema, type MbDocumentData } from './message-builder';

/**
 * Neutrale Beispielvorlagen für EN | POLIZEI. Werden nur ergänzt: Eine Vorlage mit demselben Namen (auch archiviert)
 * wird nie überschrieben oder doppelt angelegt.
 */
export interface MbExampleTemplate { name: string; category: string; data: MbDocumentData }

const BLUE = '#1e3a8a';
const doc = (messages: unknown[]): MbDocumentData => mbDocumentDataSchema.parse({ messages });
const footer = { footerText: 'EN | POLIZEI', timestamp: 'send' };

export const MB_EXAMPLE_TEMPLATES: MbExampleTemplate[] = [
  {
    name: 'Willkommen', category: 'Informationen',
    data: doc([{ id: 'ex-welcome', content: '', embeds: [{
      id: 'ex-welcome-e', color: BLUE, title: '👋 Willkommen bei EN | POLIZEI',
      description: 'Schön, dass du da bist! Bitte lies dir zuerst das **Regelwerk** durch und melde dich bei Fragen im Support.',
      fields: [
        { id: 'ex-w-f1', name: '📜 Regelwerk', value: 'Pflichtlektüre für alle Mitglieder.', inline: true },
        { id: 'ex-w-f2', name: '📝 Bewerbung', value: 'Infos im Bewerbungskanal.', inline: true },
        { id: 'ex-w-f3', name: '🎫 Support', value: 'Ticket über das Ticket-Panel.', inline: true },
      ], ...footer,
    }] }]),
  },
  {
    name: 'Dienstbeginn', category: 'Dienstanweisungen',
    data: doc([{ id: 'ex-duty', content: '', embeds: [{
      id: 'ex-duty-e', color: '#22c55e', title: '🚓 Dienstbeginn',
      description: 'Der Dienst beginnt. Bitte meldet euch im Funk an und übernehmt eure Einheit.',
      fields: [
        { id: 'ex-d-f1', name: 'Treffpunkt', value: 'Polizeirevier', inline: true },
        { id: 'ex-d-f2', name: 'Uhrzeit', value: '20:00 Uhr (anpassen)', inline: true },
        { id: 'ex-d-f3', name: 'Hinweis', value: 'Ausrüstung und Fahrzeug vor Dienstantritt prüfen.', inline: false },
      ], ...footer,
    }] }]),
  },
  {
    name: 'Bewerbungsinformationen', category: 'Bewerbungen',
    data: doc([{ id: 'ex-apply', content: '', embeds: [{
      id: 'ex-apply-e', color: BLUE, title: '📝 Bewerbung bei EN | POLIZEI',
      description: 'Du möchtest Teil des Teams werden? So läuft die Bewerbung ab:',
      fields: [
        { id: 'ex-a-f1', name: '1. Voraussetzungen', value: 'Mindestalter und Regelwerk beachten.', inline: false },
        { id: 'ex-a-f2', name: '2. Bewerbung', value: 'Über das Bewerbungs-Panel einreichen.', inline: false },
        { id: 'ex-a-f3', name: '3. Rückmeldung', value: 'Du erhältst eine Nachricht, sobald entschieden wurde.', inline: false },
      ], ...footer,
    }] }]),
  },
  {
    name: 'Ticket-Eröffnung', category: 'Tickets',
    data: doc([{ id: 'ex-ticket', content: '', embeds: [{
      id: 'ex-ticket-e', color: '#0ea5e9', title: '🎫 Support-Ticket',
      description: 'Du brauchst Hilfe? Öffne über das Ticket-Panel ein Ticket. Ein Teammitglied meldet sich so schnell wie möglich.\n\n-# Bitte keine Ticket-Anfragen per Direktnachricht.',
      ...footer,
    }] }]),
  },
  {
    name: 'Ausbildungsankündigung', category: 'Ausbildung',
    data: doc([{ id: 'ex-training', content: '', embeds: [{
      id: 'ex-training-e', color: '#a855f7', title: '🎓 Ausbildung',
      description: 'Eine neue Ausbildung findet statt. Interessierte melden sich bitte bei der Ausbildungsleitung.',
      fields: [
        { id: 'ex-t-f1', name: 'Thema', value: 'Grundausbildung', inline: true },
        { id: 'ex-t-f2', name: 'Datum', value: 'Datum (anpassen)', inline: true },
        { id: 'ex-t-f3', name: 'Ort', value: 'Polizeiakademie', inline: true },
      ], ...footer,
    }] }]),
  },
  {
    name: 'Regelwerk-Hinweis', category: 'Ankündigungen',
    data: doc([{ id: 'ex-rules', content: '', embeds: [{
      id: 'ex-rules-e', color: '#f59e0b', title: '⚠️ Hinweis zum Regelwerk',
      description: 'Bitte beachtet das aktuelle Regelwerk. Verstöße können zu Verwarnungen führen.\n\n> Respektvoller Umgang ist für alle Pflicht.',
      ...footer,
    }] }]),
  },
];
