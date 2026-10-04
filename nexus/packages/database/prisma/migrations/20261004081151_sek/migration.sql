-- CreateTable
CREATE TABLE "sek_config" (
    "guildId" TEXT NOT NULL,
    "teamId" TEXT,
    "qualificationId" TEXT,
    "shiftTypeId" TEXT,
    "courseIds" TEXT[],
    "applicationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sek_config_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "sek_squads" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sek_squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sek_squad_members" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Operator',

    CONSTRAINT "sek_squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sek_operations" (
    "operationId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sek_operations_pkey" PRIMARY KEY ("operationId")
);

-- CreateTable
CREATE TABLE "sek_operation_squads" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,

    CONSTRAINT "sek_operation_squads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sek_squads_guildId_name_key" ON "sek_squads"("guildId", "name");

-- CreateIndex
CREATE INDEX "sek_squad_members_guildId_userId_idx" ON "sek_squad_members"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sek_squad_members_squadId_userId_key" ON "sek_squad_members"("squadId", "userId");

-- CreateIndex
CREATE INDEX "sek_operations_guildId_idx" ON "sek_operations"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "sek_operation_squads_operationId_squadId_key" ON "sek_operation_squads"("operationId", "squadId");

-- AddForeignKey
ALTER TABLE "sek_squads" ADD CONSTRAINT "sek_squads_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sek_squad_members" ADD CONSTRAINT "sek_squad_members_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "sek_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sek_operation_squads" ADD CONSTRAINT "sek_operation_squads_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "sek_operations"("operationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sek_operation_squads" ADD CONSTRAINT "sek_operation_squads_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "sek_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
