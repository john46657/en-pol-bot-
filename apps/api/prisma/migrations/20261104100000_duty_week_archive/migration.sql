-- CreateTable
CREATE TABLE "DutyWeekArchive" (
    "id" UUID NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "weekKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "activeUsers" INTEGER NOT NULL,
    "shiftCount" INTEGER NOT NULL,
    "ranking" JSONB NOT NULL,
    "sessions" JSONB NOT NULL,
    "discordChannelId" TEXT,
    "catchUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DutyWeekArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DutyWeekArchive_weekStart_key" ON "DutyWeekArchive"("weekStart");

-- CreateIndex
CREATE INDEX "DutyWeekArchive_createdAt_idx" ON "DutyWeekArchive"("createdAt");

-- Wochenarchive sind unveränderlich: UPDATE/DELETE/TRUNCATE werden auf DB-Ebene verweigert.
CREATE OR REPLACE FUNCTION duty_week_archive_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DutyWeekArchive is append-only (% not permitted)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER duty_week_archive_no_update_delete
  BEFORE UPDATE OR DELETE ON "DutyWeekArchive"
  FOR EACH ROW EXECUTE FUNCTION duty_week_archive_immutable();

CREATE TRIGGER duty_week_archive_no_truncate
  BEFORE TRUNCATE ON "DutyWeekArchive"
  FOR EACH STATEMENT EXECUTE FUNCTION duty_week_archive_immutable();
