-- CreateTable
CREATE TABLE "nexus_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "discordRoleId" TEXT,
    "entries" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nexus_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus_role_members" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nexus_role_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nexus_roles_guildId_priority_idx" ON "nexus_roles"("guildId", "priority");

-- CreateIndex
CREATE INDEX "nexus_roles_guildId_discordRoleId_idx" ON "nexus_roles"("guildId", "discordRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "nexus_roles_guildId_name_key" ON "nexus_roles"("guildId", "name");

-- CreateIndex
CREATE INDEX "nexus_role_members_guildId_userId_idx" ON "nexus_role_members"("guildId", "userId");

-- CreateIndex
CREATE INDEX "nexus_role_members_expiresAt_idx" ON "nexus_role_members"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "nexus_role_members_roleId_userId_key" ON "nexus_role_members"("roleId", "userId");

-- AddForeignKey
ALTER TABLE "nexus_roles" ADD CONSTRAINT "nexus_roles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus_role_members" ADD CONSTRAINT "nexus_role_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "nexus_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

