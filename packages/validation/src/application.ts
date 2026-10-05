import { z } from 'zod';
import {
  ApplicationStatus,
  ConditionCombinator,
  ConditionOperator,
  QuestionType,
  ResubmissionMode,
  ReviewerAssignmentType,
  RoleMatchMode,
  RoleRuleType,
  UserLeaveAction,
} from '@nexus/types';

/** 13 Operatoren (§13). */
export const conditionOperatorSchema = z.nativeEnum(ConditionOperator);
export const conditionCombinatorSchema = z.nativeEnum(ConditionCombinator);

/**
 * Rekursive Bedingung (§13): Blatt oder Gruppe mit AND/OR/NOT.
 * Gruppen sind beliebig verschachtelbar. (Pattern: zod-Docs zu Rekursion.)
 */
export const conditionLeafSchema = z.object({
  type: z.literal('leaf'),
  questionId: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]).optional(),
});
export type ConditionLeaf = z.infer<typeof conditionLeafSchema>;

export interface ConditionGroup {
  type: 'group';
  combinator: ConditionCombinator;
  children: ConditionNode[];
}

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal('group'),
    combinator: conditionCombinatorSchema,
    children: z.array(conditionNodeSchema),
  }),
);

export const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([conditionLeafSchema, conditionGroupSchema]),
);
export type ConditionNode = ConditionLeaf | ConditionGroup;

/** Ab catalpa: Option (§12) */
export const questionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(200),
  description: z.string().max(200).optional(),
  emoji: z.string().max(32).optional(),
  enabled: z.boolean().default(true),
});

export const questionValidationSchema = z.object({
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(1).max(20000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(500).optional(),
  errorMessage: z.string().max(300).optional(),
  allowedCharacters: z.string().max(500).optional(),
  caseSensitive: z.boolean().optional(),
  trim: z.boolean().optional(),
  autoCase: z.enum(['upper', 'lower', 'capitalize']).optional(),
  minSelections: z.number().int().min(0).max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
  allowedValues: z.array(z.string()).max(100).optional(),
});

export const questionTypeSchema = z.nativeEnum(QuestionType);

/** Frage (§9). */
export const questionSchema = z.object({
  id: z.string().min(1),
  type: questionTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true),
  placeholder: z.string().max(200).optional(),
  defaultValue: z.string().max(10000).optional(),
  validation: questionValidationSchema.optional(),
  options: z.array(questionOptionSchema).max(100).optional(),
  visibleIf: conditionNodeSchema.optional(),
  order: z.number().int().min(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Dauer (§20/§51). */
export const durationSchema = z
  .object({
    days: z.number().int().min(0).max(365).optional(),
    hours: z.number().int().min(0).max(23).optional(),
    minutes: z.number().int().min(0).max(59).optional(),
  })
  .refine((d) => (d.days ?? 0) + (d.hours ?? 0) + (d.minutes ?? 0) > 0, {
    message: 'Dauer muss größer als 0 sein.',
  });

export const roleRuleSchema = z.object({
  id: z.string().min(1),
  type: z.nativeEnum(RoleRuleType),
  roleId: z.string().min(1),
  matchMode: z.nativeEnum(RoleMatchMode),
  additionalRoleIds: z.array(z.string()).max(20).optional(),
});

export const dmFlowMessagesSchema = z.object({
  intro: z.string().max(4000).optional(),
  confirmation: z.string().max(4000).optional(),
  question: z.string().max(4000).optional(),
  invalidAnswer: z.string().max(2000).optional(),
  timeout: z.string().max(2000).optional(),
  completion: z.string().max(4000).optional(),
  cancel: z.string().max(2000).optional(),
  resume: z.string().max(2000).optional(),
  submitted: z.string().max(4000).optional(),
  accepted: z.string().max(4000).optional(),
  denied: z.string().max(4000).optional(),
});

export const embedConfigSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4000).optional(),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional(),
  authorName: z.string().max(256).optional(),
  authorIconUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  footer: z.string().max(256).optional(),
  showTimestamp: z.boolean().optional(),
  answerDisplay: z.enum(['field', 'paragraph']).optional(),
  answerTruncate: z.number().int().min(1).max(2000).optional(),
  anonymizeAnswers: z.boolean().optional(),
});

export const submissionStatsConfigSchema = z.object({
  userId: z.boolean().optional(),
  username: z.boolean().optional(),
  mention: z.boolean().optional(),
  accountCreated: z.boolean().optional(),
  guildJoinDate: z.boolean().optional(),
  duration: z.boolean().optional(),
  submittedAt: z.boolean().optional(),
  applicationVersion: z.boolean().optional(),
  questionCount: z.boolean().optional(),
  answerCount: z.boolean().optional(),
});

export const reviewConfigSchema = z.object({
  submissionChannelId: z.string().optional(),
  reviewRoleIds: z.array(z.string()).max(20).optional(),
  allowAcceptWithReason: z.boolean().optional(),
  allowDenyWithReason: z.boolean().optional(),
  allowNotes: z.boolean().optional(),
  createThread: z.boolean().optional(),
  threadArchiveHours: z.number().int().min(1).max(336).optional(),
  createTicket: z.boolean().optional(),
  notifyApplicant: z.boolean().optional(),
  notifyStaffRoleIds: z.array(z.string()).max(20).optional(),
  reviewerAssignment: z
    .nativeEnum(ReviewerAssignmentType)
    .or(z.enum(['manual']))
    .optional(),
  reviewerRoleIds: z.array(z.string()).max(20).optional(),
  /** Einstellungen für neue Mitarbeiter (Personalakte). */
  onboarding: z
    .object({
      rankId: z.string().max(40).optional(),
      teamId: z.string().max(40).optional(),
      probationDays: z.number().int().min(0).max(365).optional(),
      rpNameQuestionId: z.string().max(40).optional(),
    })
    .optional(),
  /** Annahme-Schritte einzeln schaltbar (Schlüssel → aktiv); fehlend = aktiv. */
  acceptPipeline: z.record(z.string().max(40), z.boolean()).optional(),
  /** Auswählbare Ablehnungsgründe (leer = Standardgründe). */
  denyReasons: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]{1,30}$/, 'Ungültige Grund-ID.'),
        label: z.string().trim().min(1).max(100),
        text: z.string().trim().max(1000).optional(),
      }),
    )
    .max(25)
    .optional(),
});

export const requirementsSchema = z.object({
  enabled: z.boolean().default(false),
  cooldown: durationSchema.optional(),
  timeLimit: durationSchema.optional(),
  requiredRoleIds: z.array(z.string()).max(50).optional(),
  restrictedRoleIds: z.array(z.string()).max(50).optional(),
  minAccountAgeDays: z.number().int().min(0).max(36500).optional(),
  minGuildMembershipDays: z.number().int().min(0).max(36500).optional(),
  requirePreviousApproval: z.array(z.string()).max(20).optional(),
});

export const advancedSettingsSchema = z.object({
  showSubmissionStats: z.boolean().optional(),
  hideSubmissionAnswers: z.boolean().optional(),
  allowResubmission: z.nativeEnum(ResubmissionMode).optional(),
  allowPause: z.boolean().optional(),
  allowEdit: z.boolean().optional(),
  createThread: z.boolean().optional(),
  createTicket: z.boolean().optional(),
  notifyApplicant: z.boolean().optional(),
  notifyStaff: z.boolean().optional(),
  saveAuditEvents: z.boolean().optional(),
  enableAnalytics: z.boolean().optional(),
  enableAttachments: z.boolean().optional(),
  enableAiReviewAssistance: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  userLeaveAction: z.nativeEnum(UserLeaveAction).optional(),
  multipleActiveSubmissions: z.enum(['none', 'per_application', 'unlimited']).optional(),
});

/** Interne Bewertung: frei definierbare Felder mit Höchstwert (z. B. Kommunikation 1–5). Ohne Felder ist die Bewertung aus. */
export const ratingConfigSchema = z.object({
  fields: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]{1,30}$/, 'Ungültige Feld-ID.'),
        label: z.string().trim().min(1, 'Bezeichnung fehlt.').max(60),
        max: z.number().int().min(2).max(10).default(5),
      }),
    )
    .max(20)
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      for (const f of fields) {
        if (seen.has(f.id)) ctx.addIssue({ code: 'custom', message: `Doppelte Feld-ID: ${f.id}.` });
        seen.add(f.id);
      }
    }),
});

/** Komplettes Application-Config-Objekt (versioniert, §65). */
export const applicationConfigSchema = z.object({
  requirements: requirementsSchema,
  messages: dmFlowMessagesSchema,
  embed: embedConfigSchema,
  stats: submissionStatsConfigSchema,
  review: reviewConfigSchema,
  advanced: advancedSettingsSchema,
  roleRules: z.array(roleRuleSchema).max(100).default([]),
  rating: ratingConfigSchema.optional(),
  questions: z.array(questionSchema).max(500).default([]),
});

/**
 * Validierung vor dem Publish (§97): Verhindert unveröffentlichtbares Formular.
 */
export function validateApplicationPublish(config: {
  name: string;
  questions: Array<{
    id: string;
    type: string;
    title: string;
    required: boolean;
    visibleIf?: unknown;
  }>;
  review?: { submissionChannelId?: string };
}) {
  const errors: string[] = [];

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Application-Name fehlt.');
  }
  if (!config.questions || config.questions.length === 0) {
    errors.push('Mindestens eine Frage wird benötigt.');
  }

  const ids = new Set<string>();
  for (const q of config.questions ?? []) {
    if (!q.id) errors.push(`Frage ohne ID: "${q.title}".`);
    if (ids.has(q.id)) errors.push(`Doppelte Frage-ID: ${q.id}.`);
    ids.add(q.id);
    if (!q.title?.trim()) errors.push(`Frage ${q.id} hat keinen Titel.`);
  }

  if (errors.length > 0) return { ok: false as const, errors };
  return { ok: true as const, errors: [] as string[] };
}

export const applicationStatusSchema = z.nativeEnum(ApplicationStatus);

/** API DTOs */
export const createApplicationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug erlaubt nur Kleinbuchstaben, Zahlen und Bindestriche.')
    .optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(64).optional(),
  image: z.string().url().optional(),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional(),
  templateId: z.string().optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial();
export const applicationListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: applicationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['name', 'createdAt', 'updatedAt', 'submissions', 'lastSubmission'])
    .default('updatedAt'),
});

export const createPanelSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(1).max(256),
  description: z.string().max(4000).optional(),
  applicationIds: z.array(z.string().min(1)).min(1).max(25),
  layout: z.enum(['button', 'select', 'button_and_select']).default('button'),
  buttonLabel: z.string().max(80).optional(),
  buttonEmoji: z.string().max(32).optional(),
  embed: embedConfigSchema.optional(),
});

export const submissionListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z
    .nativeEnum({
      STARTED: 'STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      PAUSED: 'PAUSED',
      SUBMITTED: 'SUBMITTED',
      UNDER_REVIEW: 'UNDER_REVIEW',
      ACCEPTED: 'ACCEPTED',
      DENIED: 'DENIED',
      EXPIRED: 'EXPIRED',
      CANCELLED: 'CANCELLED',
      ARCHIVED: 'ARCHIVED',
    })
    .optional(),
  applicationId: z.string().optional(),
  reviewerId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const acceptSubmissionSchema = z.object({
  publicReason: z.string().max(2000).optional(),
  internalReason: z.string().max(2000).optional(),
});

export const denySubmissionSchema = z.object({
  publicReason: z.string().max(2000).optional(),
  internalReason: z.string().max(2000).optional(),
});

export const createNoteSchema = z.object({
  content: z.string().min(1).max(4000),
  mentions: z.array(z.string()).max(20).optional(),
});

export const assignReviewerSchema = z.object({
  assigneeType: z.nativeEnum(ReviewerAssignmentType),
  assigneeId: z.string().min(1),
});
