/*
  Warnings:

  - You are about to drop the `AIProposal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ERLCEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ERLCServer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ERLCSyncState` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ERLCEvent" DROP CONSTRAINT "ERLCEvent_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ERLCSyncState" DROP CONSTRAINT "ERLCSyncState_serverId_fkey";

-- DropTable
DROP TABLE "AIProposal";

-- DropTable
DROP TABLE "ERLCEvent";

-- DropTable
DROP TABLE "ERLCServer";

-- DropTable
DROP TABLE "ERLCSyncState";
