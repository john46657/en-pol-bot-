/** Farbumrechnung für den Color Picker (HEX ⇄ RGB ⇄ HSL, Alpha). Alle Funktionen sind total: ungültige Eingaben ergeben `null`. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const h2 = (n: number) =>
  Math.round(clamp(n, 0, 255))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export function parseHex(hex: string): Rgba | null {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) / 100 : 1,
  };
}
export function toHex({ r, g, b, a }: Rgba): string {
  return `#${h2(r)}${h2(g)}${h2(b)}${a >= 1 ? '' : h2(a * 255)}`;
}
/** h 0–360, s/l 0–100 */
export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B),
    min = Math.min(R, G, B),
    d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
  const S = clamp(s, 0, 100) / 100,
    L = clamp(l, 0, 100) / 100,
    H = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * L - 1)) * S,
    x = c * (1 - Math.abs(((H / 60) % 2) - 1)),
    m = L - c / 2;
  const [r, g, b] =
    H < 60
      ? [c, x, 0]
      : H < 120
        ? [x, c, 0]
        : H < 180
          ? [0, c, x]
          : H < 240
            ? [0, x, c]
            : H < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}
/** Eingabe wie `88 101 242`, `88,101,242` oder `88 / 101 / 242`. */
export function parseRgbText(text: string, alpha = 1): Rgba | null {
  const p = text
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)
    ? { r: p[0]!, g: p[1]!, b: p[2]!, a: alpha }
    : null;
}
export function parseHslText(text: string, alpha = 1): Rgba | null {
  const p = text
    .split(/[\s,/%]+/)
    .filter(Boolean)
    .map(Number);
  return p.length === 3 &&
    p.every(Number.isFinite) &&
    p[0]! >= 0 &&
    p[0]! <= 360 &&
    p[1]! >= 0 &&
    p[1]! <= 100 &&
    p[2]! >= 0 &&
    p[2]! <= 100
    ? hslToRgb(p[0]!, p[1]!, p[2]!, alpha)
    : null;
}
/** Lesbarkeit: Kontrastverhältnis nach WCAG (1–21). */
export function contrast(a: string, b: string): number {
  const lum = (c: Rgba) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const A = parseHex(a),
    B = parseHex(b);
  if (!A || !B) return 1;
  const [hi, lo] = [Math.max(lum(A), lum(B)), Math.min(lum(A), lum(B))];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
