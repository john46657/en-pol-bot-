import { customFontCss, type DesignConfig } from '@nexus/design/client';

/** Legt die `@font-face`-Regel der eigenen Schrift an (ein <style>-Element je Zweck); gibt die Aufräum-Funktion zurück. */
export function applyCustomFont(config: DesignConfig, id: string): () => void {
  const css = customFontCss(config); // leer, wenn keine/ungültige eigene Schrift – dann wird nichts geladen
  if (!css) return () => undefined;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
}
