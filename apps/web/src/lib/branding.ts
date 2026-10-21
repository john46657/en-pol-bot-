import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readableTextOn, type BrandingArea, type ServerConfigData } from '@enrp/shared';
import { api } from './api';
import { useServer } from './guilds';

/** Branding des gewählten Servers (nur für Mitglieder dieses Servers – das System prüft es bei jedem Abruf). */
export interface Branding {
  serverId: string; guildId: string; configured: boolean; setupCompleted: boolean;
  displayName: string; shortName: string; dashboardTitle: string; welcomeText: string; design: ServerConfigData['design'];
  images: { logo: string | null; avatar: string | null; banner: string | null; background: string | null; areas: Record<BrandingArea, string | null> };
}

export function useBranding() {
  const [server] = useServer();
  return useQuery({
    queryKey: ['branding', server], enabled: !!server, retry: false, staleTime: 60_000,
    queryFn: () => api<Branding>(`/servers/branding/${server}`),
  });
}

/**
 * Farben/Design des Servers anwenden. Persönliche Einstellungen haben Vorrang: der Hell/Dunkel-Standard des Servers gilt nur,
 * wenn der Benutzer „System“ gewählt hat; das Hintergrundbild nur ohne eigenen Hintergrund.
 */
export function useApplyBranding(b: Branding | undefined, personal: { theme: string; background: { type: string } }) {
  useEffect(() => {
    const root = document.documentElement;
    const system = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (!b?.configured) {
      // vorheriger Server hatte ggf. eigenes Design → auf die persönliche Einstellung zurück
      root.style.removeProperty('--brand-primary'); root.style.removeProperty('--brand-primary-fg');
      if (personal.theme === 'system') root.dataset.theme = system();
      if (personal.background.type === 'none') root.style.setProperty('--app-bg', 'var(--color-bg)');
      return;
    }
    root.style.setProperty('--brand-primary', b.design.primary);
    root.style.setProperty('--brand-primary-fg', readableTextOn(b.design.primary));
    if (personal.theme === 'system') root.dataset.theme = b.design.mode === 'user' ? system() : b.design.mode;
    if (personal.background.type === 'none') root.style.setProperty('--app-bg', b.design.useBackground && b.images.background ? `center / cover no-repeat fixed url("${b.images.background}")` : 'var(--color-bg)');
  }, [b, personal.theme, personal.background]);
}
