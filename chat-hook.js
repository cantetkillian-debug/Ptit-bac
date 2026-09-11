"use strict";

/**
 * P'tit Bac — Chat V1
 * Extension Socket.IO / PostgreSQL chargée avant server.js.
 *
 * Fonctions:
 * - conversations privées entre amis uniquement
 * - historique persistant
 * - non lus / lecture
 * - temps réel
 * - suppression locale d'une conversation
 * - signalement
 */

const { Pool } = require("pg");
const socketIo = require("socket.io");

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
const activeUsers = new Map(); // userId -> Set(socketId)

function validToken(value) {
  const token = String(value || "").trim();
  return /^[a-f0-9]{48}$/i.test(token) ? token : "";
}

function cleanMessage(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 500);
}

function addActive(userId, socketId) {
  if (!activeUsers.has(userId)) activeUsers.set(userId, new Set());
  activeUsers.get(userId).add(socketId);
}

function removeActive(userId, socketId) {
  const set = activeUsers.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) activeUsers.delete(userId);
}

function isOnline(userId) {
  return Boolean(activeUsers.get(userId)?.size);
}

function emitToUser(io, userId, event, payload) {
  const sockets = activeUsers.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) io.to(socketId).emit(event, payload);
}

async function ensureSchema() {
  if (!pool) throw new Error("DATABASE_URL manquant");
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    // Attend que friends-hook ait créé public.users.
    for (let i = 0; i < 60; i++) {
      const q = await pool.query(`SELECT to_regclass('public.users') AS users_table`);
      if (q.rows[0]?.users_table) break;
      if (i === 59) throw new Error("table users introuvable");
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ptitbac_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        receiver_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz,
        CHECK (sender_id <> receiver_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ptitbac_chat_hidden (
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        hidden_before timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, friend_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ptitbac_chat_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        reported_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS ptitbac_messages_pair_created_idx
      ON public.ptitbac_messages(sender_id, receiver_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS ptitbac_messages_receiver_unread_idx
      ON public.ptitbac_messages(receiver_id, read_at, created_at DESC)
    `);

    console.log("Chat V1: schéma PostgreSQL prêt.");
  })().catch(err => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

async function userFromToken(walletToken) {
  await ensureSchema();
  const token = validToken(walletToken);
  if (!token) throw new Error("Session joueur invalide");

  const q = await pool.query(`
    SELECT id, friend_code, username, avatar, wallet_token, last_seen
      FROM public.users
     WHERE wallet_token = $1
     LIMIT 1
  `, [token]);

  if (!q.rowCount) throw new Error("Profil joueur introuvable");
  return q.rows[0];
}

async function identity(socket, payload = {}) {
  const token = validToken(payload.walletToken || socket.data.ptitChatWalletToken);
  const user = await userFromToken(token);

  if (socket.data.ptitChatUserId && socket.data.ptitChatUserId !== user.id) {
    removeActive(socket.data.ptitChatUserId, socket.id);
  }

  socket.data.ptitChatUserId = user.id;
  socket.data.ptitChatWalletToken = user.wallet_token;
  addActive(user.id, socket.id);

  await pool.query(
    `UPDATE public.users SET last_seen = now(), updated_at = now() WHERE id = $1`,
    [user.id]
  ).catch(() => {});

  return user;
}

async function areFriends(userId, friendId) {
  const q = await pool.query(`
    SELECT 1
      FROM public.friendships
     WHERE user_id = $1 AND friend_id = $2
     LIMIT 1
  `, [userId, friendId]);
  return Boolean(q.rowCount);
}

function safeUser(row) {
  return {
    id: row.id,
    friendCode: row.friend_code,
    username: row.username,
    avatar: row.avatar || "🐼",
    lastSeen: row.last_seen || null,
    online: isOnline(row.id)
  };
}

async function friendsFor(userId) {
  const q = await pool.query(`
    SELECT u.id, u.friend_code, u.username, u.avatar, u.last_seen
      FROM public.friendships f
      JOIN public.users u ON u.id = f.friend_id
     WHERE f.user_id = $1
     ORDER BY lower(u.username), u.created_at
  `, [userId]);
  return q.rows.map(safeUser);
}

async function hiddenBefore(userId, friendId) {
  const q = await pool.query(`
    SELECT hidden_before
      FROM public.ptitbac_chat_hidden
     WHERE user_id = $1 AND friend_id = $2
     LIMIT 1
  `, [userId, friendId]);
  return q.rows[0]?.hidden_before || null;
}

async function conversationList(userId) {
  const friends = await friendsFor(userId);
  const result = [];

  for (const friend of friends) {
    const hidden = await hiddenBefore(userId, friend.id);

    const latest = await pool.query(`
      SELECT id, sender_id, receiver_id, content, created_at, read_at
        FROM public.ptitbac_messages
       WHERE (
              (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
       )
       ${hidden ? "AND created_at > $3" : ""}
       ORDER BY created_at DESC
       LIMIT 1
    `, hidden ? [userId, friend.id, hidden] : [userId, friend.id]);

    const unread = await pool.query(`
      SELECT count(*)::int AS count
        FROM public.ptitbac_messages
       WHERE sender_id = $2
         AND receiver_id = $1
         AND read_at IS NULL
         ${hidden ? "AND created_at > $3" : ""}
    `, hidden ? [userId, friend.id, hidden] : [userId, friend.id]);

    if (!latest.rowCount) continue;

    result.push({
      friend,
      lastMessage: latest.rows[0],
      unread: Number(unread.rows[0]?.count || 0)
    });
  }

  result.sort((a, b) =>
    new Date(b.lastMessage.created_at).getTime() -
    new Date(a.lastMessage.created_at).getTime()
  );

  return result;
}

async function history(userId, friendId, limit = 100) {
  if (!(await areFriends(userId, friendId))) {
    throw new Error("Ce joueur n'est plus dans tes amis.");
  }

  const hidden = await hiddenBefore(userId, friendId);
  const params = hidden
    ? [userId, friendId, hidden, Math.max(1, Math.min(100, Number(limit) || 100))]
    : [userId, friendId, Math.max(1, Math.min(100, Number(limit) || 100))];

  const q = await pool.query(`
    SELECT id, sender_id, receiver_id, content, created_at, read_at
      FROM public.ptitbac_messages
     WHERE (
            (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
     )
     ${hidden ? "AND created_at > $3" : ""}
     ORDER BY created_at DESC
     LIMIT $${hidden ? 4 : 3}
  `, params);

  return q.rows.reverse();
}

async function markRead(userId, friendId) {
  const q = await pool.query(`
    UPDATE public.ptitbac_messages
       SET read_at = COALESCE(read_at, now())
     WHERE sender_id = $2
       AND receiver_id = $1
       AND read_at IS NULL
     RETURNING id, read_at
  `, [userId, friendId]);

  return q.rows;
}

function installChat(io) {
  if (!DATABASE_URL) {
    console.warn("Chat V1 désactivé: DATABASE_URL absent.");
    return;
  }

  ensureSchema().catch(err =>
    console.error("Chat V1 initialisation impossible:", err.message)
  );

  io.on("connection", socket => {
    socket.on("chat:bootstrap", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const [friends, conversations] = await Promise.all([
          friendsFor(me.id),
          conversationList(me.id)
        ]);
        cb({ ok: true, me: safeUser(me), friends, conversations });
      } catch (err) {
        cb({ ok: false, error: err.message || "Chat indisponible." });
      }
    });

    socket.on("chat:list", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const [friends, conversations] = await Promise.all([
          friendsFor(me.id),
          conversationList(me.id)
        ]);
        cb({ ok: true, me: safeUser(me), friends, conversations });
      } catch (err) {
        cb({ ok: false, error: err.message || "Impossible de charger les messages." });
      }
    });

    socket.on("chat:history", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const friendId = String(payload.friendId || "").trim();
        const friendQ = await pool.query(`
          SELECT id, friend_code, username, avatar, last_seen
            FROM public.users
           WHERE id = $1
           LIMIT 1
        `, [friendId]);

        if (!friendQ.rowCount || !(await areFriends(me.id, friendId))) {
          return cb({ ok: false, error: "Ami introuvable." });
        }

        const messages = await history(me.id, friendId, payload.limit);
        const readRows = await markRead(me.id, friendId);

        if (readRows.length) {
          emitToUser(io, friendId, "chat:read", {
            byUserId: me.id,
            messageIds: readRows.map(row => row.id),
            readAt: readRows[0].read_at
          });
        }

        cb({
          ok: true,
          me: safeUser(me),
          friend: safeUser(friendQ.rows[0]),
          messages
        });
      } catch (err) {
        cb({ ok: false, error: err.message || "Impossible de charger la conversation." });
      }
    });

    socket.on("chat:send", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const friendId = String(payload.friendId || "").trim();
        const content = cleanMessage(payload.content);

        if (!content) return cb({ ok: false, error: "Écris un message." });
        if (!(await areFriends(me.id, friendId))) {
          return cb({ ok: false, error: "Tu peux écrire uniquement à tes amis." });
        }

        // Une nouvelle activité rend la conversation visible de nouveau.
        await pool.query(`
          DELETE FROM public.ptitbac_chat_hidden
           WHERE (user_id = $1 AND friend_id = $2)
              OR (user_id = $2 AND friend_id = $1)
        `, [me.id, friendId]);

        const inserted = await pool.query(`
          INSERT INTO public.ptitbac_messages(sender_id, receiver_id, content)
          VALUES($1,$2,$3)
          RETURNING id, sender_id, receiver_id, content, created_at, read_at
        `, [me.id, friendId, content]);

        const message = inserted.rows[0];

        emitToUser(io, friendId, "chat:message", {
          message,
          from: safeUser(me)
        });

        emitToUser(io, me.id, "chat:message", {
          message,
          from: safeUser(me)
        });

        cb({ ok: true, message });
      } catch (err) {
        cb({ ok: false, error: err.message || "Message impossible à envoyer." });
      }
    });

    socket.on("chat:read", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const friendId = String(payload.friendId || "").trim();
        if (!(await areFriends(me.id, friendId))) {
          return cb({ ok: false, error: "Ami introuvable." });
        }
        const rows = await markRead(me.id, friendId);
        if (rows.length) {
          emitToUser(io, friendId, "chat:read", {
            byUserId: me.id,
            messageIds: rows.map(row => row.id),
            readAt: rows[0].read_at
          });
        }
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: "Lecture impossible." });
      }
    });

    socket.on("chat:hide", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const friendId = String(payload.friendId || "").trim();
        if (!(await areFriends(me.id, friendId))) {
          return cb({ ok: false, error: "Ami introuvable." });
        }

        await pool.query(`
          INSERT INTO public.ptitbac_chat_hidden(user_id, friend_id, hidden_before)
          VALUES($1,$2,now())
          ON CONFLICT(user_id, friend_id)
          DO UPDATE SET hidden_before = now()
        `, [me.id, friendId]);

        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: "Impossible de supprimer la conversation." });
      }
    });

    socket.on("chat:report", async (payload = {}, cb = () => {}) => {
      try {
        const me = await identity(socket, payload);
        const friendId = String(payload.friendId || "").trim();
        if (!(await areFriends(me.id, friendId))) {
          return cb({ ok: false, error: "Ami introuvable." });
        }

        await pool.query(`
          INSERT INTO public.ptitbac_chat_reports(reporter_id, reported_user_id, note)
          VALUES($1,$2,$3)
        `, [me.id, friendId, cleanMessage(payload.note || "Conversation signalée").slice(0, 500)]);

        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: "Signalement impossible." });
      }
    });

    socket.on("disconnect", () => {
      if (socket.data.ptitChatUserId) {
        removeActive(socket.data.ptitChatUserId, socket.id);
      }
    });
  });
}

const OriginalServer = socketIo.Server;

class ChatPatchedServer extends OriginalServer {
  constructor(...args) {
    super(...args);
    installChat(this);
  }
}

socketIo.Server = ChatPatchedServer;
module.exports = {};
