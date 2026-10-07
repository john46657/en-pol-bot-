/** Sprach-Support wie bei GalaxyBot: Warteraum (Sprachkanal) → Support-Fall → Team übernimmt in einem eigenen Sprachkanal. */
export interface SupportTime { days: number[]; from: string; to: string }
export interface VoiceSupportRoom {
  id: string; guildId: string; name: string; enabled: boolean;
  /** Sprachkanal, den man betritt, um einen Fall zu eröffnen. */
  waitingChannelId: string;
  /** Textkanal für „Ein neuer Support-Fall“. */
  notifyChannelId: string;
  /** Wird erwähnt und darf Fälle übernehmen. */
  teamRoleId: string;
  /** Zeichen vor dem Namen neuer Support-Kanäle (z. B. „🎧 “). */
  channelPrefix: string;
  /** Thread am Fall für Team-Notizen. */
  notes: boolean;
  /** Vorhandene Sprachkanäle nutzen statt neue anzulegen. */
  ownChannels: boolean;
  ownChannelIds: string[];
  /** Supportzeiten (Europe/Berlin); leer = immer geöffnet. */
  times: SupportTime[];
  rating: boolean;
  /** Wartemusik – Einstellung vorbereitet, spielt noch nicht. */
  music: { enabled: boolean; openTrack: string; closedTrack: string };
  primary: boolean;
}

export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
export const MUSIC_TRACKS = { '': 'Track wählen', lofi: 'Lo-Fi', piano: 'Klavier', elevator: 'Fahrstuhlmusik', custom: 'Eigenes Audio' } as const;
export const VOICE_CASE_STATUS = { WAITING: 'Wartet', CLAIMED: 'Übernommen', DECLINED: 'Abgelehnt', ABANDONED: 'Warteraum verlassen', CLOSED: 'Geschlossen' } as const;

export const newVoiceRoom = (id: string, guildId = ''): VoiceSupportRoom => ({
  id, guildId, name: 'Support', enabled: true, waitingChannelId: '', notifyChannelId: '', teamRoleId: '', channelPrefix: '🎧 ', notes: true,
  ownChannels: false, ownChannelIds: [], times: [], rating: false, music: { enabled: false, openTrack: '', closedTrack: '' }, primary: false,
});

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
/** Wochentag (0 = Sonntag) und Minute des Tages in einer Zeitzone. */
export function localTime(d: Date, timeZone = 'Europe/Berlin') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
/** Ist der Support gerade geöffnet? Ohne Zeiten immer; „bis“ vor „von“ = über Mitternacht. */
export function isSupportOpen(times: SupportTime[], d = new Date(), timeZone = 'Europe/Berlin'): boolean {
  if (!times.length) return true;
  const { day, minute } = localTime(d, timeZone);
  return times.some((t) => {
    const from = minutes(t.from), to = minutes(t.to);
    if (from <= to) return t.days.includes(day) && minute >= from && minute < to;
    return (t.days.includes(day) && minute >= from) || (t.days.includes((day + 6) % 7) && minute < to);
  });
}
