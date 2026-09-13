"use strict";

const crypto = require("crypto");
const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL)
        ? false
        : { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

let schemaPromise = null;

function ensureSchema() {
  if (!pool) return Promise.reject(new Error("DATABASE_URL manquant"));
  if (schemaPromise) return schemaPromise;

  schemaPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS ptitbac_player_reports (
      id text PRIMARY KEY,
      reporter_wallet_token text NOT NULL,
      reported_friend_code text NOT NULL,
      reported_name text NOT NULL,
      room_code text,
      reported_player_id text,
      reason text NOT NULL DEFAULT 'lobby_profile',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `).then(() =>
    pool.query(`
      CREATE INDEX IF NOT EXISTS ptitbac_player_reports_target_idx
      ON ptitbac_player_reports(reported_friend_code, created_at DESC)
    `)
  );

  return schemaPromise;
}

function validWalletToken(value) {
  const token = String(value || "").trim();
  return /^[a-f0-9]{48}$/i.test(token) ? token : "";
}

function installPlayerReports(io) {
  if (!pool) {
    console.warn("Signalements joueurs désactivés: DATABASE_URL absent.");
    return;
  }

  ensureSchema().catch(err =>
    console.error("Initialisation signalements joueurs:", err.message)
  );

  io.on("connection", socket => {
    socket.on("players:report", async (payload = {}, callback = () => {}) => {
      try {
        const walletToken = validWalletToken(payload.walletToken);
        const friendCode = String(payload.targetFriendCode || "").trim();
        const targetName = String(payload.targetName || "Joueur").trim().slice(0, 24);
        const roomCode = String(payload.roomCode || "").trim().toUpperCase().slice(0, 8);
        const playerId = String(payload.targetPlayerId || "").trim().slice(0, 80);

        if (!walletToken) return callback({ ok: false, error: "Session invalide." });
        if (!/^\d{5}$/.test(friendCode)) {
          return callback({ ok: false, error: "Ce joueur n’a pas de code ami valide." });
        }

        // Evite les doubles signalements accidentels rapprochés.
        const duplicate = await pool.query(
          `SELECT 1 FROM ptitbac_player_reports
            WHERE reporter_wallet_token=$1
              AND reported_friend_code=$2
              AND created_at > now() - interval '10 minutes'
            LIMIT 1`,
          [walletToken, friendCode]
        );

        if (duplicate.rowCount) {
          return callback({ ok: true, duplicate: true });
        }

        await pool.query(
          `INSERT INTO ptitbac_player_reports(
             id, reporter_wallet_token, reported_friend_code,
             reported_name, room_code, reported_player_id, reason
           ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            crypto.randomBytes(12).toString("hex"),
            walletToken,
            friendCode,
            targetName,
            roomCode,
            playerId,
            "lobby_profile"
          ]
        );

        callback({ ok: true });
      } catch (err) {
        console.error("players:report:", err.message);
        callback({ ok: false, error: "Impossible d’envoyer le signalement." });
      }
    });
  });
}

module.exports = installPlayerReports;

process.on("SIGTERM", () => {
  pool?.end().catch(() => {});
});
