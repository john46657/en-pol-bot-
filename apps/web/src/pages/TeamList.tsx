import { useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
import { Card, PageHeader } from '../components/ui';
import { TeamRoster } from '../components/TeamRoster';
import { VoiceWidget } from '../components/VoiceWidget';

/** 👥 Teamliste (eigene Seite). Das Voice-Widget steht daneben, technisch und optisch getrennt. */
export function TeamList() {
  const { can } = useAuth();
  const voice = can('dashboard.voice.view');
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader title="👥 Teamliste" subtitle="Aus Discord-Teamrollen und Personalakten – aktualisiert sich alle 5 Sekunden." />
      <div className={`grid gap-4 ${voice ? 'xl:grid-cols-[1fr_340px]' : ''}`}>
        <Card><TeamRoster key={params.get('m') ?? ''} initialOpen={params.get('m') ?? undefined} /></Card>
        {voice && <Card title="🎙️ Aktive Voice-Channels"><VoiceWidget /></Card>}
      </div>
    </>
  );
}
