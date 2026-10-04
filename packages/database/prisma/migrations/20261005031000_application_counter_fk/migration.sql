-- AddForeignKey
ALTER TABLE "application_number_counters" ADD CONSTRAINT "application_number_counters_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
