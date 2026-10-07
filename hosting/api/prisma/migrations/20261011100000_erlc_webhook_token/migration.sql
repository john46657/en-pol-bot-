ALTER TABLE "ErlcServer" ADD COLUMN "webhookToken" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);
