-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DENIED', 'EXPIRED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DECIMAL', 'DATE', 'TIME', 'DATETIME', 'YES_NO', 'SINGLE_SELECT', 'MULTI_SELECT', 'RATING', 'SLIDER', 'DISCORD_USER', 'DISCORD_ROLE', 'DISCORD_CHANNEL', 'URL', 'EMAIL', 'PHONE', 'USERNAME', 'CONFIRMATION', 'CHECKBOX', 'MULTI_CHECKBOX', 'FILE', 'IMAGE', 'ATTACHMENT', 'PARAGRAPH', 'INFO', 'SEPARATOR');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'is_empty', 'is_not_empty', 'in', 'not_in');

-- CreateEnum
CREATE TYPE "ConditionCombinator" AS ENUM ('AND', 'OR', 'NOT');

-- CreateEnum
CREATE TYPE "RoleMatchMode" AS ENUM ('HAS_ALL', 'HAS_ANY', 'HAS_NONE');

-- CreateEnum
CREATE TYPE "RoleRuleType" AS ENUM ('REQUIRED', 'RESTRICTED', 'ACCEPTED', 'DENIED', 'PENDING', 'PING', 'ACCEPTED_REMOVAL', 'DENIED_REMOVAL', 'SUBMIT_REMOVAL');

-- CreateEnum
CREATE TYPE "ResubmissionMode" AS ENUM ('NEVER', 'AFTER_DENIAL', 'AFTER_COOLDOWN', 'AFTER_STAFF_APPROVAL', 'ALWAYS');

-- CreateEnum
CREATE TYPE "UserLeaveAction" AS ENUM ('NOTHING', 'CANCEL', 'ARCHIVE', 'DELETE', 'MARK_AS_LEFT', 'DENY');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'JSON', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewerAssignmentType" AS ENUM ('USER', 'ROLE');

-- CreateEnum
CREATE TYPE "DMPhase" AS ENUM ('INTRO', 'QUESTION', 'SUMMARY', 'EDITING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'MIRRORED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('WEBHOOK', 'DISCORD_WEBHOOK', 'NOTION', 'GOOGLE_SHEETS', 'REST_API', 'ZAPIER', 'MAKE');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'BOT', 'AUTOMATION');

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "ownerId" TEXT,
    "features" JSONB,
    "rolePermissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "image" TEXT,
    "color" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_versions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "questions" JSONB NOT NULL,
    "changelog" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,

    CONSTRAINT "application_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_questions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "defaultValue" TEXT,
    "validation" JSONB,
    "order" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "application_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "application_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_conditions" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "node" JSONB NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "application_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_panels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "embed" JSONB NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'button',
    "buttonLabel" TEXT,
    "buttonEmoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_panel_applications" (
    "panelId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "application_panel_applications_pkey" PRIMARY KEY ("panelId","applicationId")
);

-- CreateTable
CREATE TABLE "application_submissions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "submissionNumber" TEXT,
    "userId" TEXT NOT NULL,
    "usernameSnapshot" TEXT NOT NULL,
    "displayNameSnapshot" TEXT NOT NULL,
    "avatarSnapshot" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'STARTED',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "reviewerUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "publicReason" TEXT,
    "internalReason" TEXT,
    "submissionMessageId" TEXT,
    "submissionChannelId" TEXT,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "normalizedValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_dm_states" (
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "phase" "DMPhase" NOT NULL DEFAULT 'INTRO',
    "currentQuestionId" TEXT,
    "currentDMMessageId" TEXT,
    "introMessageId" TEXT,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "application_dm_states_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "application_reviewers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assigneeType" "ReviewerAssignmentType" NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[],
    "edits" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_audit_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "submissionId" TEXT,
    "applicationId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_cooldowns" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_cooldowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "url" TEXT NOT NULL,
    "s3Key" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_role_rules" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "RoleRuleType" NOT NULL,
    "roleId" TEXT NOT NULL,
    "matchMode" "RoleMatchMode" NOT NULL DEFAULT 'HAS_ALL',
    "additionalRoleIds" TEXT[],

    CONSTRAINT "application_role_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_automations" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "applicationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "condition" JSONB,
    "actions" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_integrations" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "name" TEXT NOT NULL,
    "secret" BYTEA,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_templates" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "category" TEXT,
    "structure" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_templates" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "title" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "description" TEXT,
    "validation" JSONB,
    "options" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_exports" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB NOT NULL,
    "rowCount" INTEGER,
    "fileUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "application_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_analytics_daily" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "started" INTEGER NOT NULL DEFAULT 0,
    "submitted" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "denied" INTEGER NOT NULL DEFAULT 0,
    "expired" INTEGER NOT NULL DEFAULT 0,
    "cancelled" INTEGER NOT NULL DEFAULT 0,
    "avgDurationSeconds" INTEGER,

    CONSTRAINT "application_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_settings" (
    "guildId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "logChannelId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_settings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "globalName" TEXT,
    "avatarUrl" TEXT,
    "bot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" TEXT NOT NULL DEFAULT '0',
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_channels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_guildId_status_idx" ON "applications"("guildId", "status");

-- CreateIndex
CREATE INDEX "applications_guildId_updatedAt_idx" ON "applications"("guildId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "applications_guildId_slug_key" ON "applications"("guildId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "application_versions_applicationId_version_key" ON "application_versions"("applicationId", "version");

-- CreateIndex
CREATE INDEX "application_questions_applicationId_order_idx" ON "application_questions"("applicationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "application_questions_applicationId_questionId_key" ON "application_questions"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "application_question_options_questionId_idx" ON "application_question_options"("questionId");

-- CreateIndex
CREATE INDEX "application_panels_guildId_channelId_idx" ON "application_panels"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "application_submissions_guildId_status_idx" ON "application_submissions"("guildId", "status");

-- CreateIndex
CREATE INDEX "application_submissions_guildId_userId_status_idx" ON "application_submissions"("guildId", "userId", "status");

-- CreateIndex
CREATE INDEX "application_submissions_guildId_applicationId_status_idx" ON "application_submissions"("guildId", "applicationId", "status");

-- CreateIndex
CREATE INDEX "application_submissions_guildId_reviewerUserId_idx" ON "application_submissions"("guildId", "reviewerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "application_submissions_guildId_submissionNumber_key" ON "application_submissions"("guildId", "submissionNumber");

-- CreateIndex
CREATE INDEX "application_answers_submissionId_idx" ON "application_answers"("submissionId");

-- CreateIndex
CREATE INDEX "application_answers_normalizedValue_idx" ON "application_answers"("normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "application_answers_submissionId_questionId_key" ON "application_answers"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "application_dm_states_userId_idx" ON "application_dm_states"("userId");

-- CreateIndex
CREATE INDEX "application_reviewers_submissionId_idx" ON "application_reviewers"("submissionId");

-- CreateIndex
CREATE INDEX "application_reviewers_assigneeId_idx" ON "application_reviewers"("assigneeId");

-- CreateIndex
CREATE INDEX "application_notes_submissionId_idx" ON "application_notes"("submissionId");

-- CreateIndex
CREATE INDEX "application_audit_events_guildId_createdAt_idx" ON "application_audit_events"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_events_submissionId_createdAt_idx" ON "application_audit_events"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_events_action_idx" ON "application_audit_events"("action");

-- CreateIndex
CREATE INDEX "application_cooldowns_userId_idx" ON "application_cooldowns"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "application_cooldowns_guildId_applicationId_userId_reason_key" ON "application_cooldowns"("guildId", "applicationId", "userId", "reason");

-- CreateIndex
CREATE INDEX "application_attachments_submissionId_idx" ON "application_attachments"("submissionId");

-- CreateIndex
CREATE INDEX "application_role_rules_applicationId_type_idx" ON "application_role_rules"("applicationId", "type");

-- CreateIndex
CREATE INDEX "application_automations_guildId_trigger_idx" ON "application_automations"("guildId", "trigger");

-- CreateIndex
CREATE INDEX "application_templates_guildId_isPublic_idx" ON "application_templates"("guildId", "isPublic");

-- CreateIndex
CREATE INDEX "question_templates_guildId_idx" ON "question_templates"("guildId");

-- CreateIndex
CREATE INDEX "application_exports_guildId_createdAt_idx" ON "application_exports"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "application_analytics_daily_applicationId_day_key" ON "application_analytics_daily"("applicationId", "day");

-- CreateIndex
CREATE INDEX "discord_roles_guildId_position_idx" ON "discord_roles"("guildId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "discord_roles_guildId_discordId_key" ON "discord_roles"("guildId", "discordId");

-- CreateIndex
CREATE INDEX "discord_channels_guildId_type_idx" ON "discord_channels"("guildId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "discord_channels_guildId_discordId_key" ON "discord_channels"("guildId", "discordId");

-- CreateIndex
CREATE INDEX "permissions_guildId_key_idx" ON "permissions"("guildId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_guildId_key_roleId_key" ON "permissions"("guildId", "key", "roleId");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_createdAt_idx" ON "audit_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_action_idx" ON "audit_logs"("guildId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_resourceType_resourceId_idx" ON "audit_logs"("guildId", "resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_question_options" ADD CONSTRAINT "application_question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "application_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_conditions" ADD CONSTRAINT "application_conditions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "application_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_panels" ADD CONSTRAINT "application_panels_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_panel_applications" ADD CONSTRAINT "application_panel_applications_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "application_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_panel_applications" ADD CONSTRAINT "application_panel_applications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "application_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_dm_states" ADD CONSTRAINT "application_dm_states_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviewers" ADD CONSTRAINT "application_reviewers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_audit_events" ADD CONSTRAINT "application_audit_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_cooldowns" ADD CONSTRAINT "application_cooldowns_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_cooldowns" ADD CONSTRAINT "application_cooldowns_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_attachments" ADD CONSTRAINT "application_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_role_rules" ADD CONSTRAINT "application_role_rules_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_automations" ADD CONSTRAINT "application_automations_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_automations" ADD CONSTRAINT "application_automations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_integrations" ADD CONSTRAINT "application_integrations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_templates" ADD CONSTRAINT "application_templates_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_exports" ADD CONSTRAINT "application_exports_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_analytics_daily" ADD CONSTRAINT "application_analytics_daily_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_roles" ADD CONSTRAINT "discord_roles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "discord_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

