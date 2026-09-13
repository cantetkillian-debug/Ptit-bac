/** Friends socket handlers, explicitly installed by server.js. */
"use strict";

const crypto = require("crypto");
const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DEFAULT_COINS = 50;

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

let schemaReady = false;
let schemaPromise = null;
const activeUsers = new Map(); // userId -> Set(socketId)

function cleanUsername(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.slice(0, 24) || "Joueur";
}

function cleanAvatar(value) {
  return String(value || "🐼").trim().slice(0, 16) || "🐼";
}

function validWalletToken(value) {
  const token = String(value || "").trim();
  return /^[a-f0-9]{48}$/i.test(token) ? token : "";
}

function codeStem(username) {
  const normalized = cleanUsername(username)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 6);
  return normalized || "JOUEUR";
}

async function ensureSchema() {
  if (!pool) throw new Error("DATABASE_URL manquant");
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        friend_code text UNIQUE NOT NULL,
        username text NOT NULL,
        avatar text DEFAULT '🐼',
        coins integer NOT NULL DEFAULT 50 CHECK (coins >= 0),
        wallet_token text UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_token text UNIQUE`);
    await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
    await pool.query(`ALTER TABLE public.users ALTER COLUMN coins SET DEFAULT 50`);
    await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lives integer NOT NULL DEFAULT 5 CHECK (lives >= 0 AND lives <= 5)`);
    await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS life_updated_at timestamptz NOT NULL DEFAULT now()`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.friend_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        receiver_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','accepted','declined')),
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (sender_id <> receiver_id),
        UNIQUE (sender_id, receiver_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.friendships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (user_id <> friend_id),
        UNIQUE (user_id, friend_id)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS users_wallet_token_idx ON public.users(wallet_token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS users_friend_code_idx ON public.users(friend_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON public.friend_requests(sender_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON public.friend_requests(receiver_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS friendships_user_idx ON public.friendships(user_id)`);

    schemaReady = true;
    console.log("Amis V1: schéma PostgreSQL prêt.");
  })().catch(err => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

async function uniqueFriendCode(username) {
  const stem = codeStem(username);
  for (let i = 0; i < 40; i++) {
    const suffix = crypto.randomInt(0, 10000).toString().padStart(4, "0");
    const code = `${stem}#${suffix}`;
    const exists = await pool.query(
      "SELECT 1 FROM public.users WHERE friend_code = $1 LIMIT 1",
      [code]
    );
    if (!exists.rowCount) return code;
  }
  return `${stem}#${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function walletCoins(walletToken) {
  try {
    const result = await pool.query(
      "SELECT coins FROM ptitbac_wallets WHERE token = $1 LIMIT 1",
      [walletToken]
    );
    if (result.rowCount) return Math.max(0, Number(result.rows[0].coins) || 0);
  } catch {
    // La table portefeuille peut ne pas encore exister lors du tout premier démarrage.
  }
  return DEFAULT_COINS;
}

async function ensureProfile(payload = {}) {
  await ensureSchema();

  const walletToken = validWalletToken(payload.walletToken);
  if (!walletToken) throw new Error("Session joueur invalide");

  const username = cleanUsername(payload.username);
  const avatar = cleanAvatar(payload.avatar);
  const coins = await walletCoins(walletToken);

  let found = await pool.query(
    `SELECT id, friend_code, username, avatar, coins, wallet_token, created_at, last_seen
       FROM public.users
      WHERE wallet_token = $1
      LIMIT 1`,
    [walletToken]
  );

  if (!found.rowCount) {
    const friendCode = await uniqueFriendCode(username);
    found = await pool.query(
      `INSERT INTO public.users(friend_code, username, avatar, coins, wallet_token, last_seen, updated_at)
       VALUES($1,$2,$3,$4,$5,now(),now())
       RETURNING id, friend_code, username, avatar, coins, wallet_token, created_at, last_seen`,
      [friendCode, username, avatar, coins, walletToken]
    );
  } else {
    found = await pool.query(
      `UPDATE public.users
          SET username = $2,
              avatar = $3,
              coins = $4,
              last_seen = now(),
              updated_at = now()
        WHERE wallet_token = $1
        RETURNING id, friend_code, username, avatar, coins, wallet_token, created_at, last_seen`,
      [walletToken, username, avatar, coins]
    );
  }

  return found.rows[0];
}

function safeProfile(row, online = false) {
  return {
    id: row.id,
    friendCode: row.friend_code,
    username: row.username,
    avatar: row.avatar || "🐼",
    coins: Math.max(0, Number(row.coins) || 0),
    online: Boolean(online),
    lastSeen: row.last_seen || null
  };
}

function addActiveUser(userId, socketId) {
  if (!activeUsers.has(userId)) activeUsers.set(userId, new Set());
  activeUsers.get(userId).add(socketId);
}

function removeActiveUser(userId, socketId) {
  const set = activeUsers.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) activeUsers.delete(userId);
}

function isOnline(userId) {
  return Boolean(activeUsers.get(userId)?.size);
}

function emitToUser(io, userId, event, payload = {}) {
  const sockets = activeUsers.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) io.to(socketId).emit(event, payload);
}

async function friendIds(userId) {
  const result = await pool.query(
    "SELECT friend_id FROM public.friendships WHERE user_id = $1",
    [userId]
  );
  return result.rows.map(r => r.friend_id);
}

async function notifyFriendsPresence(io, userId) {
  try {
    const ids = await friendIds(userId);
    for (const id of ids) {
      emitToUser(io, id, "friends:presence", {
        userId,
        online: isOnline(userId)
      });
    }
  } catch (err) {
    console.warn("Amis V1 présence:", err.message);
  }
}

async function getFriendData(userId) {
  const friends = await pool.query(
    `SELECT u.id, u.friend_code, u.username, u.avatar, u.coins, u.last_seen
       FROM public.friendships f
       JOIN public.users u ON u.id = f.friend_id
      WHERE f.user_id = $1
      ORDER BY lower(u.username), u.created_at`,
    [userId]
  );

  const incoming = await pool.query(
    `SELECT fr.id AS request_id, fr.created_at,
            u.id, u.friend_code, u.username, u.avatar, u.coins, u.last_seen
       FROM public.friend_requests fr
       JOIN public.users u ON u.id = fr.sender_id
      WHERE fr.receiver_id = $1 AND fr.status = 'pending'
      ORDER BY fr.created_at DESC`,
    [userId]
  );

  const outgoing = await pool.query(
    `SELECT fr.id AS request_id, fr.created_at,
            u.id, u.friend_code, u.username, u.avatar, u.coins, u.last_seen
       FROM public.friend_requests fr
       JOIN public.users u ON u.id = fr.receiver_id
      WHERE fr.sender_id = $1 AND fr.status = 'pending'
      ORDER BY fr.created_at DESC`,
    [userId]
  );

  return {
    friends: friends.rows.map(r => safeProfile(r, isOnline(r.id))),
    incoming: incoming.rows.map(r => ({
      requestId: r.request_id,
      createdAt: r.created_at,
      user: safeProfile(r, isOnline(r.id))
    })),
    outgoing: outgoing.rows.map(r => ({
      requestId: r.request_id,
      createdAt: r.created_at,
      user: safeProfile(r, isOnline(r.id))
    }))
  };
}

async function identityForSocket(socket, payload = {}) {
  const profile = await ensureProfile(payload);

  if (socket.data.ptitUserId && socket.data.ptitUserId !== profile.id) {
    removeActiveUser(socket.data.ptitUserId, socket.id);
  }

  socket.data.ptitUserId = profile.id;
  socket.data.ptitWalletToken = profile.wallet_token;
  addActiveUser(profile.id, socket.id);
  return profile;
}

function installFriends(io) {
  if (!DATABASE_URL) {
    console.warn("Amis V1 désactivé: DATABASE_URL absent.");
    return;
  }

  ensureSchema().catch(err =>
    console.error("Amis V1 initialisation impossible:", err.message)
  );

  io.on("connection", socket => {
    socket.on("friends:bootstrap", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const data = await getFriendData(profile.id);
        callback({
          ok: true,
          profile: safeProfile(profile, true),
          ...data
        });
        notifyFriendsPresence(io, profile.id);
      } catch (err) {
        console.error("friends:bootstrap:", err.message);
        callback({ ok: false, error: "Impossible de charger ton profil." });
      }
    });

    socket.on("friends:list", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const data = await getFriendData(profile.id);
        callback({ ok: true, profile: safeProfile(profile, true), ...data });
      } catch (err) {
        callback({ ok: false, error: "Impossible de charger tes amis." });
      }
    });

    socket.on("friends:send", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const code = String(payload?.friendCode || "").trim().toUpperCase();

        if (!code || code.length > 24) {
          return callback({ ok: false, error: "Entre un code ami valide." });
        }

        const targetResult = await pool.query(
          `SELECT id, friend_code, username, avatar, coins, last_seen
             FROM public.users
            WHERE upper(friend_code) = $1
            LIMIT 1`,
          [code]
        );

        if (!targetResult.rowCount) {
          return callback({ ok: false, error: "Aucun joueur avec ce code ami." });
        }

        const target = targetResult.rows[0];
        if (target.id === profile.id) {
          return callback({ ok: false, error: "Tu ne peux pas t'ajouter toi-même." });
        }

        const alreadyFriend = await pool.query(
          `SELECT 1 FROM public.friendships
            WHERE user_id = $1 AND friend_id = $2 LIMIT 1`,
          [profile.id, target.id]
        );
        if (alreadyFriend.rowCount) {
          return callback({ ok: false, error: "Ce joueur est déjà dans tes amis." });
        }

        const reverse = await pool.query(
          `SELECT id FROM public.friend_requests
            WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'
            LIMIT 1`,
          [target.id, profile.id]
        );
        if (reverse.rowCount) {
          return callback({
            ok: false,
            error: "Cette personne t'a déjà envoyé une demande. Regarde tes demandes reçues."
          });
        }

        const request = await pool.query(
          `INSERT INTO public.friend_requests(sender_id, receiver_id, status, created_at)
           VALUES($1,$2,'pending',now())
           ON CONFLICT(sender_id, receiver_id)
           DO UPDATE SET status='pending', created_at=now()
           RETURNING id`,
          [profile.id, target.id]
        );

        emitToUser(io, target.id, "friends:changed", { reason: "request" });
        callback({
          ok: true,
          requestId: request.rows[0].id,
          target: safeProfile(target, isOnline(target.id))
        });
      } catch (err) {
        console.error("friends:send:", err.message);
        callback({ ok: false, error: "Impossible d'envoyer la demande." });
      }
    });

    socket.on("friends:accept", async (payload, callback = () => {}) => {
      const client = await pool?.connect().catch(() => null);
      if (!client) return callback({ ok: false, error: "Base de données indisponible." });

      try {
        const profile = await identityForSocket(socket, payload);
        const requestId = String(payload?.requestId || "").trim();

        await client.query("BEGIN");
        const request = await client.query(
          `SELECT id, sender_id, receiver_id
             FROM public.friend_requests
            WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
            FOR UPDATE`,
          [requestId, profile.id]
        );

        if (!request.rowCount) {
          await client.query("ROLLBACK");
          return callback({ ok: false, error: "Cette demande n'est plus disponible." });
        }

        const senderId = request.rows[0].sender_id;

        await client.query(
          `UPDATE public.friend_requests
              SET status='accepted'
            WHERE id=$1`,
          [requestId]
        );

        await client.query(
          `INSERT INTO public.friendships(user_id, friend_id)
           VALUES($1,$2),($2,$1)
           ON CONFLICT(user_id, friend_id) DO NOTHING`,
          [profile.id, senderId]
        );

        await client.query("COMMIT");
        emitToUser(io, senderId, "friends:changed", { reason: "accepted" });
        callback({ ok: true });
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        console.error("friends:accept:", err.message);
        callback({ ok: false, error: "Impossible d'accepter la demande." });
      } finally {
        client.release();
      }
    });

    socket.on("friends:decline", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const requestId = String(payload?.requestId || "").trim();

        const result = await pool.query(
          `UPDATE public.friend_requests
              SET status='declined'
            WHERE id=$1 AND receiver_id=$2 AND status='pending'
            RETURNING sender_id`,
          [requestId, profile.id]
        );

        if (!result.rowCount) {
          return callback({ ok: false, error: "Cette demande n'est plus disponible." });
        }

        emitToUser(io, result.rows[0].sender_id, "friends:changed", { reason: "declined" });
        callback({ ok: true });
      } catch (err) {
        callback({ ok: false, error: "Impossible de refuser la demande." });
      }
    });

    socket.on("friends:remove", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const friendId = String(payload?.friendId || "").trim();

        await pool.query(
          `DELETE FROM public.friendships
            WHERE (user_id=$1 AND friend_id=$2)
               OR (user_id=$2 AND friend_id=$1)`,
          [profile.id, friendId]
        );

        emitToUser(io, friendId, "friends:changed", { reason: "removed" });
        callback({ ok: true });
      } catch (err) {
        callback({ ok: false, error: "Impossible de supprimer cet ami." });
      }
    });

    socket.on("friends:invite", async (payload, callback = () => {}) => {
      try {
        const profile = await identityForSocket(socket, payload);
        const friendId = String(payload?.friendId || "").trim();
        const roomCode = String(payload?.roomCode || "").trim().toUpperCase().slice(0, 8);

        if (!roomCode) return callback({ ok: false, error: "Aucun salon à inviter." });

        const allowed = await pool.query(
          `SELECT 1 FROM public.friendships
            WHERE user_id=$1 AND friend_id=$2 LIMIT 1`,
          [profile.id, friendId]
        );
        if (!allowed.rowCount) {
          return callback({ ok: false, error: "Ce joueur n'est pas dans tes amis." });
        }

        emitToUser(io, friendId, "friends:room-invite", {
          from: safeProfile(profile, true),
          roomCode
        });

        callback({ ok: true, delivered: isOnline(friendId) });
      } catch (err) {
        callback({ ok: false, error: "Impossible d'envoyer l'invitation." });
      }
    });

    socket.on("disconnect", () => {
      const userId = socket.data.ptitUserId;
      if (!userId) return;
      removeActiveUser(userId, socket.id);

      if (!isOnline(userId)) {
        pool.query(
          "UPDATE public.users SET last_seen=now(), updated_at=now() WHERE id=$1",
          [userId]
        ).catch(() => {});
      }

      notifyFriendsPresence(io, userId);
    });
  });
}

module.exports = installFriends;

process.on("SIGTERM", () => {
  pool?.end().catch(() => {});
});
