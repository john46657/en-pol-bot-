-- Server-Verbund: Roblox-ID je Akten-Bereich (serverId) eindeutig statt systemweit
DROP INDEX "Person_robloxUserId_key";
CREATE UNIQUE INDEX "Person_serverId_robloxUserId_key" ON "Person"("serverId", "robloxUserId");
