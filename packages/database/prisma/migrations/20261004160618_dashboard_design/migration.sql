-- CreateTable
CREATE TABLE "dashboard_settings" (
    "guildId" TEXT NOT NULL,
    "activeThemeId" TEXT,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "lastGood" JSONB,
    "autosave" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_settings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "dashboard_themes" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_theme_versions" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_theme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_themes_guildId_idx" ON "dashboard_themes"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_themes_guildId_name_key" ON "dashboard_themes"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_theme_versions_themeId_version_key" ON "dashboard_theme_versions"("themeId", "version");

-- AddForeignKey
ALTER TABLE "dashboard_settings" ADD CONSTRAINT "dashboard_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_themes" ADD CONSTRAINT "dashboard_themes_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_theme_versions" ADD CONSTRAINT "dashboard_theme_versions_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "dashboard_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
