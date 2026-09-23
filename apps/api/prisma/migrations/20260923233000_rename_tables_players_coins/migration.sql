-- Professional snake_case table names; the account table becomes "players".
-- Pure renames: every row, index and foreign key is preserved.

ALTER TABLE "User" RENAME TO "players";
ALTER TABLE "players" RENAME CONSTRAINT "User_pkey" TO "players_pkey";
ALTER INDEX "User_nickname_idx" RENAME TO "players_nickname_idx";
ALTER INDEX "User_username_key" RENAME TO "players_username_key";

ALTER TABLE "Match" RENAME TO "matches";
ALTER TABLE "matches" RENAME CONSTRAINT "Match_pkey" TO "matches_pkey";
ALTER INDEX "Match_code_idx" RENAME TO "matches_code_idx";
ALTER INDEX "Match_status_idx" RENAME TO "matches_status_idx";
ALTER TABLE "matches" RENAME CONSTRAINT "Match_hostId_fkey" TO "matches_hostId_fkey";

ALTER TABLE "MatchPlayer" RENAME TO "match_players";
ALTER TABLE "match_players" RENAME CONSTRAINT "MatchPlayer_pkey" TO "match_players_pkey";
ALTER INDEX "MatchPlayer_matchId_idx" RENAME TO "match_players_matchId_idx";
ALTER INDEX "MatchPlayer_matchId_userId_key" RENAME TO "match_players_matchId_userId_key";
ALTER INDEX "MatchPlayer_matchId_status_idx" RENAME TO "match_players_matchId_status_idx";
ALTER TABLE "match_players" RENAME CONSTRAINT "MatchPlayer_matchId_fkey" TO "match_players_matchId_fkey";
ALTER TABLE "match_players" RENAME CONSTRAINT "MatchPlayer_userId_fkey" TO "match_players_userId_fkey";

ALTER TABLE "Round" RENAME TO "rounds";
ALTER TABLE "rounds" RENAME CONSTRAINT "Round_pkey" TO "rounds_pkey";
ALTER INDEX "Round_matchId_index_key" RENAME TO "rounds_matchId_index_key";
ALTER TABLE "rounds" RENAME CONSTRAINT "Round_matchId_fkey" TO "rounds_matchId_fkey";

ALTER TABLE "DeckSnapshot" RENAME TO "deck_snapshots";
ALTER TABLE "deck_snapshots" RENAME CONSTRAINT "DeckSnapshot_pkey" TO "deck_snapshots_pkey";
ALTER INDEX "DeckSnapshot_matchId_key" RENAME TO "deck_snapshots_matchId_key";
ALTER TABLE "deck_snapshots" RENAME CONSTRAINT "DeckSnapshot_matchId_fkey" TO "deck_snapshots_matchId_fkey";

ALTER TABLE "LeaderboardStat" RENAME TO "leaderboard_stats";
ALTER TABLE "leaderboard_stats" RENAME CONSTRAINT "LeaderboardStat_pkey" TO "leaderboard_stats_pkey";
ALTER INDEX "LeaderboardStat_userId_key" RENAME TO "leaderboard_stats_userId_key";
ALTER INDEX "LeaderboardStat_elo_idx" RENAME TO "leaderboard_stats_elo_idx";
ALTER TABLE "leaderboard_stats" RENAME CONSTRAINT "LeaderboardStat_userId_fkey" TO "leaderboard_stats_userId_fkey";

ALTER TABLE "MatchEvent" RENAME TO "match_events";
ALTER TABLE "match_events" RENAME CONSTRAINT "MatchEvent_pkey" TO "match_events_pkey";
ALTER INDEX "MatchEvent_matchId_createdAt_idx" RENAME TO "match_events_matchId_createdAt_idx";
ALTER TABLE "match_events" RENAME CONSTRAINT "MatchEvent_matchId_fkey" TO "match_events_matchId_fkey";

ALTER TABLE "CardPoolEntry" RENAME TO "card_pool_entries";
ALTER TABLE "card_pool_entries" RENAME CONSTRAINT "CardPoolEntry_pkey" TO "card_pool_entries_pkey";
ALTER INDEX "CardPoolEntry_source_quartetKey_idx" RENAME TO "card_pool_entries_source_quartetKey_idx";
ALTER INDEX "CardPoolEntry_source_externalId_key" RENAME TO "card_pool_entries_source_externalId_key";

-- Virtual casino chips (no real-money value).
ALTER TABLE "players" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 5000;
