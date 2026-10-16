import type { ExamInput } from '@enrp/shared';

const base = { partial: false, tolerance: 0, explanation: null, image: null, matches: [] as string[], options: [] as string[], correct: [] as string[] };

/** Beispiel-Prüfung mit allen Fragetypen – Startpunkt für neue Prüfungen. */
export const EXAM_TEMPLATE: ExamInput = {
  title: 'Grundlagen Streifendienst', category: 'Grundausbildung',
  description: 'Grundwissen für den Streifendienst: Status, Verkehrsrecht und Einsatzablauf.',
  instructions: 'Lies jede Frage genau. Du kannst Fragen markieren und später zu ihnen zurückkehren. Deine Antworten werden automatisch gespeichert.',
  questions: [
    { ...base, id: 'funk1', type: 'SINGLE', text: 'Welcher Status bedeutet „Einsatz übernommen“?', options: ['Status 3', 'Status 1', 'Status 4', 'Status 6'], correct: ['0'], points: 1, explanation: 'Status 3 = Einsatz übernommen / auf Anfahrt.' },
    { ...base, id: 'sonder', type: 'MULTI', text: 'Welche Signale gehören zu einer Einsatzfahrt mit Sonderrechten?', options: ['Blaulicht', 'Martinshorn', 'Warnblinker', 'Lichthupe'], correct: ['0', '1'], points: 2, partial: true },
    { ...base, id: 'yesno', type: 'YESNO', text: 'Darf eine Festnahme ohne Belehrung erfolgen?', correct: ['nein'], points: 1 },
    { ...base, id: 'speed', type: 'NUMBER', text: 'Wie viele km/h gelten innerorts (ohne Beschilderung)?', correct: ['50'], points: 1 },
    { ...base, id: 'ablauf', type: 'ORDER', text: 'Bringe den Ablauf einer Verkehrskontrolle in die richtige Reihenfolge.', options: ['Fahrzeug absichern', 'Fahrer ansprechen', 'Papiere prüfen', 'Ergebnis mitteilen'], points: 2, partial: true },
    { ...base, id: 'status', type: 'MATCH', text: 'Ordne die Status ihrer Bedeutung zu.', options: ['Status 1', 'Status 2', 'Status 4', 'Status 6'], matches: ['einsatzbereit über Funk', 'einsatzbereit auf der Wache', 'am Einsatzort', 'nicht einsatzbereit'], points: 4, partial: true },
    { ...base, id: 'gap', type: 'GAP', text: 'Der Notruf der Polizei lautet {{110}}, der von Feuerwehr und Rettungsdienst {{112}}.', points: 2, partial: true },
    { ...base, id: 'text', type: 'TEXT', text: 'Beschreibe kurz, wie du dich bei einem Funkausfall verhältst.', points: 3 },
  ],
  questionCount: 0, passPercent: 70, timeLimitMin: 20, maxAttempts: 3, retryHours: 24, autoGrade: true, showResult: true, reviewMode: 'SOLUTIONS', layout: 'PAGED',
  shuffleQuestions: false, shuffleOptions: true, examinerIds: [], audienceRoleIds: [], trainingId: null, requiredExamId: null, availableFrom: null, availableUntil: null, notifyExaminers: true, active: false,
};
