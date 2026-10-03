import { randomInt } from 'node:crypto';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Kollisionsarme, lesbare Aktenzeichen (z. B. T-2026-K7M2QX). Eindeutigkeit sichert der Unique-Constraint. */
export function makeNumber(prefix: string, now = new Date()): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${now.getUTCFullYear()}-${s}`;
}
