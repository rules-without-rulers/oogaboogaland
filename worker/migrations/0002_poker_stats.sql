-- Hands won at the Ember Den's live tables, written only by its dealer (worker/src/poker-den.js) once per hand it
-- settles: every seat that takes a pot other than the refund of its own uncalled bet wins that hand. Practice tables
-- play on the page and are never counted. A row goes with its player (DELETE /api/me); signing out keeps it.

CREATE TABLE poker_stats (
  player_id  INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  login      TEXT    NOT NULL,                -- GitHub login at the last win, for the leaderboard
  hands_won  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL                 -- unix seconds of the last win
);
CREATE INDEX poker_stats_rank ON poker_stats(hands_won DESC, updated_at);
