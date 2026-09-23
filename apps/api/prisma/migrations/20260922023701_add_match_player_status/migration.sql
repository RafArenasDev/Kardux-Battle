-- CreateEnum
CREATE TYPE "MatchPlayerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "status" "MatchPlayerStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_status_idx" ON "MatchPlayer"("matchId", "status");
