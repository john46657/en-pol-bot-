import { z } from 'zod';
import type { PanelConfig } from '@nexus/types';

const httpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine((u) => u.startsWith('https://'), 'Nur https-Adressen sind erlaubt.');

/** Unicode-Emoji, Keycap oder benutzerdefiniert (`<:name:id>` / `<a:name:id>`). */
// Zeichenklasse enthält absichtlich zusammengesetzte Emoji-Bausteine (ZWJ, Variation Selector, Hauttöne).
/* eslint-disable no-misleading-character-class */
const EMOJI = new RegExp(
  '^(<a?:\\w{2,32}:\\d{17,20}>|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}[\\p{Extended_Pictographic}\\u200D\\uFE0F\\u{1F3FB}-\\u{1F3FF}]*)$',
  'u',
);
/* eslint-enable no-misleading-character-class */
const emoji = z.string().regex(EMOJI, 'Ungültiges Emoji.');

const componentId = z.string().regex(/^[a-z0-9]{3,12}$/, 'Ungültige Komponenten-ID.');

export const panelActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), content: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('role-toggle'), roleId: z.string().regex(/^\d{5,25}$/) }),
]);

const buttonSchema = z
  .object({
    id: componentId,
    label: z.string().trim().min(1).max(80),
    emoji: emoji.optional(),
    style: z.enum(['primary', 'secondary', 'success', 'danger', 'link']),
    url: httpsUrl.optional(),
    action: panelActionSchema.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.style === 'link') {
      if (!b.url)
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: 'Link-Buttons brauchen eine Adresse.',
        });
      if (b.action)
        ctx.addIssue({
          code: 'custom',
          path: ['action'],
          message: 'Link-Buttons haben keine Aktion.',
        });
    } else {
      if (!b.action)
        ctx.addIssue({
          code: 'custom',
          path: ['action'],
          message: 'Dieser Button braucht eine Aktion.',
        });
      if (b.url)
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: 'Nur Link-Buttons haben eine Adresse.',
        });
    }
  });

const optionSchema = z.object({
  id: componentId,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(100).optional(),
  emoji: emoji.optional(),
  action: panelActionSchema,
});

const embedSchema = z.object({
  title: z.string().trim().max(256).optional(),
  description: z.string().trim().max(4096).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb')
    .optional(),
  thumbnailUrl: httpsUrl.optional(),
  imageUrl: httpsUrl.optional(),
  footer: z.string().trim().max(2048).optional(),
  fields: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(256),
        value: z.string().trim().min(1).max(1024),
        inline: z.boolean().optional(),
      }),
    )
    .max(25)
    .optional(),
});

export const panelConfigSchema = z
  .object({
    content: z.string().trim().max(2000).optional(),
    embed: embedSchema,
    buttons: z.array(buttonSchema).max(20),
    select: z
      .object({
        placeholder: z.string().trim().max(150).optional(),
        options: z.array(optionSchema).min(1).max(25),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    const e = c.embed;
    const hasEmbed = !!(
      e.title ||
      e.description ||
      e.imageUrl ||
      e.thumbnailUrl ||
      e.fields?.length
    );
    if (!hasEmbed && !c.content) {
      ctx.addIssue({
        code: 'custom',
        path: ['embed'],
        message: 'Das Panel braucht Text oder ein Embed mit Inhalt.',
      });
    }
    const chars =
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.footer?.length ?? 0) +
      (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
    if (chars > 6000) {
      ctx.addIssue({
        code: 'custom',
        path: ['embed'],
        message: 'Das Embed ist insgesamt länger als 6000 Zeichen.',
      });
    }
    const ids = [...c.buttons.map((b) => b.id), ...(c.select?.options.map((o) => o.id) ?? [])];
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'Komponenten-IDs müssen eindeutig sein.',
      });
    }
  }) satisfies z.ZodType<PanelConfig, z.ZodTypeDef, unknown>;

export const panelNameSchema = z.string().trim().min(1).max(80);
