"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeNumber = makeNumber;
const node_crypto_1 = require("node:crypto");
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Kollisionsarme, lesbare Aktenzeichen (z. B. T-2026-K7M2QX). Eindeutigkeit sichert der Unique-Constraint. */
function makeNumber(prefix, now = new Date()) {
    let s = '';
    for (let i = 0; i < 6; i++)
        s += ALPHABET[(0, node_crypto_1.randomInt)(ALPHABET.length)];
    return `${prefix}-${now.getUTCFullYear()}-${s}`;
}
//# sourceMappingURL=numbering.js.map