-- Schicht-Arten (Admin → Shifts)
ALTER TABLE "DutySession" ADD COLUMN "shiftType" TEXT;

-- Abmeldungen (Leave of Absences)
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "guildId" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "roleApplied" BOOLEAN NOT NULL DEFAULT false,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeaveRequest_number_key" ON "LeaveRequest"("number");
CREATE INDEX "LeaveRequest_status_startsAt_idx" ON "LeaveRequest"("status", "startsAt");
CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rechte für bestehende Installationen (neue bekommen sie über die Startrollen)
INSERT INTO "Permission" ("key", "module") VALUES ('leave.view', 'leave'), ('leave.request', 'leave'), ('leave.manage', 'leave') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
  SELECT r."id", g."key", 'ALLOW' FROM "Role" r
  JOIN (VALUES ('Police Member', 'leave.request'), ('Supervisor', 'leave.view'), ('Police Administration', 'leave.view'), ('Police Administration', 'leave.request'), ('Police Administration', 'leave.manage')) AS g("role", "key") ON g."role" = r."name"
ON CONFLICT DO NOTHING;
