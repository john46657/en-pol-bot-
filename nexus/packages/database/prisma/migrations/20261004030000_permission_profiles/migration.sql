-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');
-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('SERVER', 'TEAM', 'RECORD');
-- DropIndex
DROP INDEX "permissions_guildId_key_roleId_key";
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "automation" TEXT,
ADD COLUMN     "permission" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "result" TEXT;
-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
ADD COLUMN     "scope" "PermissionScope" NOT NULL DEFAULT 'SERVER',
ADD COLUMN     "scopeRef" TEXT NOT NULL DEFAULT '';
-- CreateTable
CREATE TABLE "permission_profiles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entries" JSONB NOT NULL,
    "templateKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "role_profiles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_profiles_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'SERVER',
    "scopeRef" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "permission_profiles_guildId_name_key" ON "permission_profiles"("guildId", "name");
-- CreateIndex
CREATE INDEX "role_profiles_guildId_idx" ON "role_profiles"("guildId");
-- CreateIndex
CREATE UNIQUE INDEX "role_profiles_roleId_profileId_key" ON "role_profiles"("roleId", "profileId");
-- CreateIndex
CREATE INDEX "user_permissions_guildId_userId_idx" ON "user_permissions"("guildId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_guildId_userId_key_effect_scope_scopeRef_key" ON "user_permissions"("guildId", "userId", "key", "effect", "scope", "scopeRef");
-- CreateIndex
CREATE UNIQUE INDEX "permissions_guildId_key_roleId_effect_scope_scopeRef_key" ON "permissions"("guildId", "key", "roleId", "effect", "scope", "scopeRef");
-- AddForeignKey
ALTER TABLE "permission_profiles" ADD CONSTRAINT "permission_profiles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "role_profiles" ADD CONSTRAINT "role_profiles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "discord_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "role_profiles" ADD CONSTRAINT "role_profiles_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "permission_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
