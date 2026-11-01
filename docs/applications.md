# Applications

Public `POST /applications` (rate-limited 5/hour/IP) validates answers against the configurable form (`application.form` setting, edit in Studio). Workflow SUBMITTED → SCREENING → INTERVIEW → PENDING_DECISION → ACCEPTED | REJECTED | WITHDRAWN. Review steps need `applications.review`; accept/reject need `applications.decide` and a reason. Accepting does **not** create an account automatically. The public form is served at `/apply` (no login).

## KI-Bewerbungsprüfung (Google Gemini, Groq, OpenRouter, Mistral, Ollama)

Eine echte KI wertet eine **vorhandene** Bewerbung aus (Polizei-Bewerbung und Bewerbungen für Einheiten, egal ob über das Dashboard `/apply` oder Discord eingegangen) und liefert Prüfern eine **Entscheidungshilfe**. Sie nimmt nie an, lehnt nie ab, löscht nichts, sperrt niemanden, vergibt keine Rollen und ändert keinen Status – entscheiden tut immer ein Mensch über die bestehenden Buttons.

Nicht zu verwechseln mit dem lokalen **KI-Checker** (`packages/shared/src/ai-check.ts`, Abzeichen „KI-Verdacht“), der ohne externen Dienst schätzt, ob Antworten mit ChatGPT & Co. geschrieben wurden. Beide bleiben unabhängig voneinander erhalten.

### Automatischer Ablauf (neu)
1. Bewerbung wird regulär gespeichert (Dashboard/Web `/apply` **und** Discord nutzen dieselben Datensätze).
2. Die API meldet die neue Bewerbung intern (`applicationEvents`), die KI-Prüfung nimmt sie in eine Warteschlange.
3. Nach ca. 3 Sekunden startet die Analyse **im Hintergrund** – das Einreichen wartet nie darauf.
4. Ergebnis wird dauerhaft gespeichert (`ApplicationAiReview`, `via = AUTO`).
5. Das Dashboard zeigt es sofort an (gleiche Zeile wie bei manuellem Start); Prüfer erhalten eine Benachrichtigung **„🤖 KI-Analyse … abgeschlossen“** bzw. **„⚠️ … fehlgeschlagen“** (Art `AI_REVIEW`, in *Persönlich* abschaltbar).
6. Im Discord-Kanal der Bewerbung erscheint eine **kurze Meldung** nur mit Empfehlung und Richtwert (keine Antworten, keine Begründungen) und dem Button **„Details (privat)“**.

Grenzen: Tageslimit und gleichzeitige Analysen gelten auch für die Automatik; wartende Analysen laufen nacheinander (max. 200 in der Warteschlange). Ist das Tageslimit erreicht, wird **nicht** analysiert und die Prüfer erhalten den Hinweis „KI-Analyse nicht gestartet“ – manuell geht es später jederzeit. Ohne eingerichteten Anbieter passiert nichts. Je Server abschaltbar (*Einrichtung → „Neue Bewerbungen automatisch analysieren“*).

### Bedienung
- **Dashboard:** *Bewerbungen* → Bewerbung aufklappen → **„KI-Bewerbung prüfen“**. Ladeanzeige, danach Empfehlung, Gesamtbewertung (Richtwert 0–10, ausdrücklich keine objektive Bewertung/Erfolgswahrscheinlichkeit), zehn Einzelkriterien, Stärken, Schwächen, fehlende Angaben, Widersprüche, Rückfragen, Unsicherheiten, Zeitpunkt, Modell und wer sie gestartet hat. „Erneut analysieren“ startet bewusst eine neue Analyse.
- **Discord:** Unter jeder neu eingehenden Bewerbung im Team-Kanal gibt es (nur wenn ein Schlüssel hinterlegt ist) den Button **🤖 KI-Prüfung**. Die Zusammenfassung sieht **nur der klickende Prüfer** (private Antwort); ausführlich mit Link ins Dashboard (`/applications?q=<Nummer>`). Bewerbungen, die vor dem Update gepostet wurden, haben den Button nicht – dort im Dashboard prüfen.
- **Einrichtung** (*Bewerbungen → Einrichtung → KI-Bewerbungsprüfung*, Recht `qualifications.manage`, je Server): an/aus, automatisch an/aus, **geltende RP-Regeln** und **Auswahlkriterien**. Ohne Regeln bzw. Kriterien bewertet die KI diese Punkte ausdrücklich als „nicht beurteilbar“ – sie erfindet keine Anforderungen.

### Rechte
| Aktion | Polizei-Bewerbung | Einheiten-Bewerbung |
|---|---|---|
| Ergebnis ansehen / Analyse starten | `applications.review` | `qualifications.decide` |
| Discord-Button | dazu reicht auch eine eingestellte Manager-Rolle der Bewerbung | ebenso |
| Einstellungen | `qualifications.manage` | `qualifications.manage` |

### Kriterien und Ergebnis
Die zehn Kriterien: Vollständigkeit · Verständnis der RP-Regeln · Qualität/Nachvollziehbarkeit · Verhalten in Situationen · Verständnis von Aufgaben/Verantwortung im Polizeidienst · Widersprüche · fehlende/unklare Angaben · Verständlichkeit · sinnvolle Rückfragen · Übereinstimmung mit den konfigurierten Auswahlkriterien. Jede Bewertung ist `gut`, `ausreichend`, `mangelhaft` oder `nicht_beurteilbar`. Empfehlung: `geeignet`, `rueckfragen_noetig` oder `manuelle_pruefung`.

Die KI antwortet als JSON nach festem Schema (`generationConfig.responseSchema`); die API prüft es zusätzlich selbst (`parseAiReview`). Ungültige oder unvollständige Antworten werden **nicht** gespeichert, sondern als fehlgeschlagene Analyse mit verständlicher Meldung angezeigt; das letzte gültige Ergebnis bleibt sichtbar.

### Speicherung, erneute Analyse, veraltete Ergebnisse
- Tabelle `ApplicationAiReview` (eine Zeile je Analyse, zugeordnet über Art + Bewerbungs-ID). Dashboard und Discord lesen dieselben Zeilen.
- Öffnen einer Bewerbung startet **nie** eine Analyse (automatisch nur einmal beim Eingang, sofern eingeschaltet). Ein vorhandenes, aktuelles Ergebnis wird wiederverwendet; eine laufende Analyse wird nie doppelt gestartet (auch nicht bei Doppelklick).
- Ändern sich Antworten oder die hinterlegten Regeln/Kriterien (Fingerabdruck/Hash), wird das Ergebnis als **„möglicherweise veraltet“** markiert.
- Fehlgeschlagene Analysen beschädigen die Bewerbung nicht. Nach einem Neustart werden unterbrochene Analysen als fehlgeschlagen markiert und **nicht** automatisch erneut gesendet.
- Wird eine Bewerbung gelöscht, werden ihre KI-Ergebnisse mitgelöscht. Die Daten-Backups (*Einstellungen → Backups* und die täglichen Datenbank-Dumps) enthalten die Tabelle automatisch.

### Datenschutz
- Übermittelt werden nur Fragen und Antworten. **Nicht** übermittelt: Discord-/Roblox-Namen, IDs, Antworten auf Identitätsfragen (Roblox-/Discord-Name, Alter, Wohnort …). E-Mail-Adressen, Telefonnummern, Links, Discord-IDs/Erwähnungen und IP-Adressen werden vor dem Versand entfernt (`redactPersonalData`). Namen im Freitext lassen sich nicht zuverlässig erkennen.
- Bewerbungstexte werden nicht geloggt. Das Audit-Log (`application.ai_review.start|done|failed`) hält fest, wer wann eine Analyse gestartet hat und ob sie erfolgreich war – ohne Bewerbungstext.
- **Wichtig:** In der kostenlosen Gemini-Stufe können übermittelte Inhalte laut Google zur Verbesserung der Produkte verwendet werden (Stand der Preisseite bei Einführung). Vor dem Livebetrieb die aktuellen [Gemini-API-Nutzungsbedingungen](https://ai.google.dev/gemini-api/terms) und die [Preisseite](https://ai.google.dev/gemini-api/docs/pricing) prüfen, Bewerber ggf. informieren und zunächst nur fiktive/anonymisierte Testbewerbungen verwenden.

### Einrichtung (Server)
Umgebungsvariablen der API (nur serverseitig, nie im Frontend, nie in Discord, nie im Repository – `.env` ist per `.gitignore` ausgeschlossen):

| Variable | Standard | Bedeutung |
|---|---|---|
| `AI_PROVIDER` | automatisch | `gemini` · `groq` · `openrouter` · `mistral` · `ollama`. Leer = der erste Anbieter (in dieser Reihenfolge), für den ein Schlüssel hinterlegt ist – bestehende Installationen mit nur `GEMINI_API_KEY` bleiben unverändert. |
| `GEMINI_API_KEY` | – | Schlüssel aus [Google AI Studio](https://aistudio.google.com). |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `MISTRAL_API_KEY` | – | Schlüssel der jeweiligen Anbieter (OpenAI-kompatible Chat-Completions-API). |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Selbst betriebenes Ollama (kein Schlüssel) – nur mit `AI_PROVIDER=ollama`. Nur http(s)-Adressen. |
| `AI_MODEL` | je Anbieter | Modell überschreiben. Standard: `gemini-3.8-flash` · `llama-3.3-70b-versatile` (Groq) · `meta-llama/llama-3.3-70b-instruct:free` (OpenRouter) · `mistral-small-latest` · `llama3.1` (Ollama). `GEMINI_MODEL` gilt weiter für Gemini. Verfügbarkeit und kostenlose Kontingente prüfen – sie ändern sich. |
| `AI_REVIEW_DAILY_LIMIT` | `50` | höchstens so viele Analysen in 24 Stunden (alle Server zusammen) |
| `AI_REVIEW_MAX_CONCURRENT` | `2` | gleichzeitige Analysen |
| `AI_REVIEW_TIMEOUT_MS` | `45000` | Zeitlimit je Anfrage (5 000–120 000) |
| `AI_REVIEW_MAX_RETRIES` | `1` | Wiederholungen nur bei vorübergehenden Fehlern (Netzwerk, 5xx, ungültige Antwort), nie bei Limit (429) oder ungültigem Schlüssel |
| `AI_REVIEW_MAX_INPUT_CHARS` | `12000` | max. Zeichen je Bewerbung (längere Antworten werden gekürzt, das Ergebnis vermerkt es) |

Ungültige Werte fallen auf den Standard zurück; die API startet trotzdem. Ein fehlender oder ungültiger Schlüssel, ein nicht verfügbares Modell, erreichte Limits (HTTP 429), Zeitüberschreitung und Ausfälle werden verständlich gemeldet; die Rohmeldung des Anbieters und der Schlüssel erscheinen nie in Antworten oder Logs.

Ohne Schlüssel/Anbieter ist die KI-Prüfung aus (Button/Bereich zeigt den Grund mit der passenden Variable).

### Kosten
Jeder Anbieter hat eigene Bedingungen; Gemini, Groq, OpenRouter (`:free`-Modelle) und Mistral bieten zeitweise kostenlose Stufen, garantiert ist das nicht. Für Groq/OpenRouter/Mistral gelten deren Datenschutz- und Nutzungsbedingungen – vor dem Livebetrieb prüfen. Ollama läuft vollständig auf eigener Hardware (keine Daten an Dritte). Für Gemini: Die Anbindung nutzt nur die Gemini-API ohne Zusatzdienste. Ohne verknüpftes Abrechnungskonto bleibt es bei der kostenlosen Stufe; dann lehnt Google Anfragen über dem Kontingent mit 429 ab (die Prüfung meldet „Nutzungslimit erreicht“), es entstehen keine Kosten. Kostenlose Kontingente, Modelle und Bedingungen kann Google jederzeit ändern – sie sind nicht garantiert. Eine Analyse ist ein einzelner Aufruf (ca. 2 000–5 000 Eingabe-Token je nach Bewerbung).

### Technik
`packages/shared/src/ai-review.ts` (Kriterien, Prompt, Schema, Prüfung, Datenminimierung) · `apps/api/src/applications/ai-review/` (Anbieter-Schnittstelle `AiProvider`; `GeminiProvider` über `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` mit Header `x-goog-api-key`; `OpenAiCompatibleProvider` über `POST {base}/chat/completions` mit `response_format: json_object` – das Schema steht im Prompt und wird serverseitig geprüft) · `apps/api/src/common/application-events.ts` (Ereignis „neue Bewerbung“) · `apps/bot/src/commands/ai-review.ts` · `apps/web/src/components/AiReviewPanel.tsx`.

API: `GET|POST /applications/:id/ai-review`, `GET|POST /qualifications/applications/:id/ai-review` (`{ force: true }` = bewusst neu), `GET /application-ai-review/status`, `GET|PUT /application-ai-review/settings`, Bot: `GET /bot/ai-review/status`.
