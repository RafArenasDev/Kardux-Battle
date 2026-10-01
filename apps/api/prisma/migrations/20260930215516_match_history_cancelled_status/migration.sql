-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "match_players" ADD COLUMN     "hasLeft" BOOLEAN NOT NULL DEFAULT false;
