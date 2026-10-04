/** Schriften werden nur geladen, wenn sie gewählt sind (Leistung) und kommen vom eigenen Server, nicht von Dritten. */
const LOADERS: Record<string, () => Promise<unknown>[]> = {
  Inter: () => [import('@fontsource/inter/400.css'), import('@fontsource/inter/600.css'), import('@fontsource/inter/700.css')],
  Roboto: () => [import('@fontsource/roboto/400.css'), import('@fontsource/roboto/500.css'), import('@fontsource/roboto/700.css')],
  Poppins: () => [import('@fontsource/poppins/400.css'), import('@fontsource/poppins/600.css'), import('@fontsource/poppins/700.css')],
  'Open Sans': () => [import('@fontsource/open-sans/400.css'), import('@fontsource/open-sans/600.css'), import('@fontsource/open-sans/700.css')],
};
const done = new Set<string>();
export async function loadFont(name: string): Promise<void> {
  const l = LOADERS[name];
  if (!l || done.has(name)) return;
  done.add(name);
  try {
    await Promise.all(l());
  } catch {
    done.delete(name); // ohne die Schrift gilt der Systemzeichensatz
  }
}
