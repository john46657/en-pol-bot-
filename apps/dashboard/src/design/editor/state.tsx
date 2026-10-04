import { DEFAULT_CONFIG, type DesignConfig } from '@nexus/design/client';
import { createContext, useContext } from 'react';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

export const getIn = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((a, k) => (isRec(a) ? a[k] : undefined), o);

/** Unveränderliches Setzen eines Werts per Pfad (`colors.dark.primary`). `undefined` entfernt den Schlüssel. */
export function setIn<T>(o: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const rec = (node: unknown, i: number): unknown => {
    const copy: Rec = isRec(node) ? { ...node } : {};
    const k = keys[i]!;
    if (i === keys.length - 1) {
      if (value === undefined) delete copy[k];
      else copy[k] = value;
    } else copy[k] = rec(copy[k], i + 1);
    return copy;
  };
  return rec(o, 0) as T;
}

export interface EditorApi {
  draft: DesignConfig;
  /** Nur lesen (Vorlage aktiv) */
  disabled: boolean;
  set: (path: string, value: unknown) => void;
  /** Auf den Standardwert zurücksetzen */
  reset: (path: string) => void;
}
export const EditorCtx = createContext<EditorApi | null>(null);
export function useEditor(): EditorApi {
  const c = useContext(EditorCtx);
  if (!c) throw new Error('EditorCtx fehlt');
  return c;
}
export const defaultAt = (path: string): unknown => getIn(DEFAULT_CONFIG, path);
export const isDefault = (draft: DesignConfig, path: string): boolean =>
  JSON.stringify(getIn(draft, path)) === JSON.stringify(defaultAt(path));
