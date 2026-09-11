"use strict";

/**
 * P'tit Bac — Economie V2.1
 * Runtime patch chargé avant server.js.
 *
 * Règles:
 * - nouveau joueur: 50 pièces
 * - 5 vies max
 * - 1 partie multijoueur = 1 vie
 * - +1 vie / 30 min
 * - gains: 1er 60, 2e 40, 3e 25, autres 10, variation ±20 %
 * - pub récompensée prévue: +80 pièces
 */

const fs = require("fs");
const Module = require("module");
const path = require("path");

const originalLoader = Module._extensions[".js"];

function need(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error("[Economy V2.4] Patch introuvable: " + label);
  }
  return source.replace(search, replacement);
}

function needRegex(source, regex, replacement, label) {
  regex.lastIndex = 0;
  if (!regex.test(source)) {
    throw new Error("[Economy V2.4] Patch introuvable: " + label);
  }
  regex.lastIndex = 0;
  return source.replace(regex, replacement);
}

const HELPERS = String.raw`
const ECONOMY_MAX_LIVES = 5;
const ECONOMY_LIFE_MS = 30 * 60 * 1000;
const ECONOMY_AD_REWARD = 80;
const ECONOMY_REWARD_VARIANCE = 0.20;
let economySchemaReady = false;
let economySchemaPromise = null;

async function ensureEconomySchema() {
  if (!pgPool) throw new Error("PostgreSQL indisponible");
  if (economySchemaReady) return;
  if (economySchemaPromise) return economySchemaPromise;

  economySchemaPromise = (async () => {
    await pgPool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await pgPool.query(\`
      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        friend_code text UNIQUE NOT NULL,
        username text NOT NULL,
        avatar text DEFAULT '🐼',
        coins integer NOT NULL DEFAULT 50 CHECK (coins >= 0),
        wallet_token text UNIQUE,
        lives integer NOT NULL DEFAULT 5 CHECK (lives >= 0 AND lives <= 5),
        life_updated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    \`);

    await pgPool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_token text UNIQUE');
    await pgPool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()');
    await pgPool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lives integer NOT NULL DEFAULT 5 CHECK (lives >= 0 AND lives <= 5)');
    await pgPool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS life_updated_at timestamptz NOT NULL DEFAULT now()');
    await pgPool.query('ALTER TABLE public.users ALTER COLUMN coins SET DEFAULT 50');

    await pgPool.query(\`
      CREATE TABLE IF NOT EXISTS public.economy_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        wallet_token text,
        kind text NOT NULL,
        coins_delta integer NOT NULL DEFAULT 0,
        lives_delta integer NOT NULL DEFAULT 0,
        room_code text,
        note text,
        idempotency_key text UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    \`);

    await pgPool.query('CREATE INDEX IF NOT EXISTS users_wallet_token_idx ON public.users(wallet_token)');
    await pgPool.query('CREATE INDEX IF NOT EXISTS economy_transactions_user_idx ON public.economy_transactions(user_id, created_at DESC)');
    await pgPool.query('CREATE INDEX IF NOT EXISTS economy_transactions_wallet_idx ON public.economy_transactions(wallet_token, created_at DESC)');

    economySchemaReady = true;
    console.log("Economie V2.4 active: 50 pieces, 5 vies, recharge 30 min.");
  })().catch(err => {
    economySchemaPromise = null;
    throw err;
  });

  return economySchemaPromise;
}

function economyFriendCode() {
  return "PLAYER#" + crypto.randomInt(0, 10000).toString().padStart(4, "0");
}

async function ensureEconomyUser(walletToken, name = "Joueur", avatar = "🐼") {
  if (!pgPool || !walletToken) return null;
  await ensureEconomySchema();

  let found = await pgPool.query(
    "SELECT id,wallet_token,username,avatar,coins,lives,life_updated_at FROM public.users WHERE wallet_token=$1 LIMIT 1",
    [walletToken]
  );
  if (found.rowCount) return found.rows[0];

  for (let i = 0; i < 30; i++) {
    try {
      const created = await pgPool.query(
        \`INSERT INTO public.users
          (friend_code,username,avatar,coins,wallet_token,lives,life_updated_at,last_seen,updated_at)
         VALUES($1,$2,$3,$4,$5,5,now(),now(),now())
         RETURNING id,wallet_token,username,avatar,coins,lives,life_updated_at\`,
        [
          economyFriendCode(),
          String(name || "Joueur").slice(0,24),
          String(avatar || "🐼").slice(0,16),
          walletBalance(walletToken),
          walletToken
        ]
      );
      return created.rows[0];
    } catch (err) {
      if (err?.code !== "23505") throw err;
      found = await pgPool.query(
        "SELECT id,wallet_token,username,avatar,coins,lives,life_updated_at FROM public.users WHERE wallet_token=$1 LIMIT 1",
        [walletToken]
      );
      if (found.rowCount) return found.rows[0];
    }
  }
  throw new Error("Impossible de creer le profil economie.");
}

function computedLives(row, nowMs = Date.now()) {
  let lives = Math.max(0, Math.min(ECONOMY_MAX_LIVES, Number(row?.lives) || 0));
  let updated = new Date(row?.life_updated_at || nowMs).getTime();
  if (!Number.isFinite(updated)) updated = nowMs;

  if (lives >= ECONOMY_MAX_LIVES) {
    return { lives:ECONOMY_MAX_LIVES, updated:nowMs, nextLifeAt:null, secondsToNext:0 };
  }

  const elapsed = Math.max(0, nowMs - updated);
  const gained = Math.floor(elapsed / ECONOMY_LIFE_MS);

  if (gained > 0) {
    lives = Math.min(ECONOMY_MAX_LIVES, lives + gained);
    updated = lives >= ECONOMY_MAX_LIVES
      ? nowMs
      : updated + gained * ECONOMY_LIFE_MS;
  }

  const nextLifeAt = lives >= ECONOMY_MAX_LIVES ? null : updated + ECONOMY_LIFE_MS;

  return {
    lives,
    updated,
    nextLifeAt,
    secondsToNext: nextLifeAt
      ? Math.max(0, Math.ceil((nextLifeAt - nowMs) / 1000))
      : 0
  };
}

async function economyState(walletToken) {
  const user = await ensureEconomyUser(walletToken);
  if (!user) return null;

  const life = computedLives(user);
  const coins = walletBalance(walletToken);

  await pgPool.query(
    \`UPDATE public.users
        SET lives=$2,
            life_updated_at=to_timestamp($3/1000.0),
            coins=$4,
            last_seen=now(),
            updated_at=now()
      WHERE id=$1\`,
    [user.id, life.lives, life.updated, coins]
  );

  return {
    userId:user.id,
    coins,
    lives:life.lives,
    maxLives:ECONOMY_MAX_LIVES,
    nextLifeAt:life.nextLifeAt,
    secondsToNext:life.secondsToNext,
    rechargeSeconds:ECONOMY_LIFE_MS / 1000,
    rewardedAdCoins:ECONOMY_AD_REWARD
  };
}

async function consumeLivesForRoom(players, roomCode, sessionId) {
  if (!pgPool) return {ok:false,error:"Base de donnees indisponible."};

  const humans = players.filter(p => !p.isBot && p.walletToken);
  for (const p of humans) await ensureEconomyUser(p.walletToken, p.name, p.avatar || "🐼");

  const client = await pgPool.connect();

  try {
    await client.query("BEGIN");
    const prepared = [];

    for (const p of humans) {
      const key = "life-entry:" + roomCode + ":" + sessionId + ":" + p.id;

      const already = await client.query(
        "SELECT 1 FROM public.economy_transactions WHERE idempotency_key=$1 LIMIT 1",
        [key]
      );
      if (already.rowCount) continue;

      const q = await client.query(
        "SELECT id,wallet_token,lives,life_updated_at FROM public.users WHERE wallet_token=$1 FOR UPDATE",
        [p.walletToken]
      );

      if (!q.rowCount) {
        await client.query("ROLLBACK");
        return {ok:false,player:p,error:"Profil joueur introuvable."};
      }

      const row = q.rows[0];
      const life = computedLives(row);

      if (life.lives < 1) {
        await client.query("ROLLBACK");
        return {ok:false,player:p,error:p.name + " n'a plus de vie."};
      }

      prepared.push({p,row,life,key});
    }

    for (const item of prepared) {
      const afterLives = item.life.lives - 1;
      const updated = item.life.lives >= ECONOMY_MAX_LIVES
        ? Date.now()
        : item.life.updated;

      await client.query(
        \`UPDATE public.users
            SET lives=$2,
                life_updated_at=to_timestamp($3/1000.0),
                last_seen=now(),
                updated_at=now()
          WHERE id=$1\`,
        [item.row.id, afterLives, updated]
      );

      await client.query(
        \`INSERT INTO public.economy_transactions
          (user_id,wallet_token,kind,coins_delta,lives_delta,room_code,note,idempotency_key)
         VALUES($1,$2,'GAME_LIFE_ENTRY',0,-1,$3,'Partie multijoueur (-1 vie)',$4)
         ON CONFLICT(idempotency_key) DO NOTHING\`,
        [item.row.id,item.p.walletToken,roomCode,item.key]
      );
    }

    await client.query("COMMIT");
    return {ok:true};
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function refundLivesSnapshot(snapshot) {
  if (!pgPool || !snapshot?.sessionId) return;
  await ensureEconomySchema();

  for (const p of snapshot.players || []) {
    if (!p.walletToken) continue;

    const user = await ensureEconomyUser(p.walletToken, p.name, p.avatar || "🐼");
    if (!user) continue;

    const chargeKey = "life-entry:" + snapshot.roomCode + ":" + snapshot.sessionId + ":" + p.id;
    const refundKey = "life-refund:" + snapshot.roomCode + ":" + snapshot.sessionId + ":" + p.id;

    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");

      const charged = await client.query(
        "SELECT 1 FROM public.economy_transactions WHERE idempotency_key=$1 LIMIT 1",
        [chargeKey]
      );
      if (!charged.rowCount) {
        await client.query("ROLLBACK");
        continue;
      }

      const priorRefund = await client.query(
        "SELECT 1 FROM public.economy_transactions WHERE idempotency_key=$1 LIMIT 1",
        [refundKey]
      );
      if (priorRefund.rowCount) {
        await client.query("ROLLBACK");
        continue;
      }

      const locked = await client.query(
        "SELECT lives,life_updated_at FROM public.users WHERE id=$1 FOR UPDATE",
        [user.id]
      );
      if (!locked.rowCount) {
        await client.query("ROLLBACK");
        continue;
      }

      const life = computedLives(locked.rows[0]);
      const nextLives = Math.min(ECONOMY_MAX_LIVES, life.lives + 1);
      const nextUpdated = nextLives >= ECONOMY_MAX_LIVES ? Date.now() : life.updated;

      await client.query(
        \`UPDATE public.users
            SET lives=$2,
                life_updated_at=to_timestamp($3/1000.0),
                updated_at=now()
          WHERE id=$1\`,
        [user.id,nextLives,nextUpdated]
      );

      await client.query(
        \`INSERT INTO public.economy_transactions
          (user_id,wallet_token,kind,coins_delta,lives_delta,room_code,note,idempotency_key)
         VALUES($1,$2,'GAME_LIFE_REFUND',0,1,$3,'Retour au salon (+1 vie)',$4)\`,
        [user.id,p.walletToken,snapshot.roomCode,refundKey]
      );

      await client.query("COMMIT");
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }
}

function variedReward(base) {
  const min = Math.round(base * (1 - ECONOMY_REWARD_VARIANCE));
  const max = Math.round(base * (1 + ECONOMY_REWARD_VARIANCE));
  return crypto.randomInt(min, max + 1);
}

async function syncEconomyCoins(walletToken, coins, kind, delta, details, idempotencyKey) {
  if (!pgPool || !walletToken) return;

  try {
    const user = await ensureEconomyUser(walletToken);
    if (!user) return;

    await pgPool.query(
      "UPDATE public.users SET coins=$2,updated_at=now() WHERE id=$1",
      [user.id,Math.max(0,Math.floor(Number(coins)||0))]
    );

    if (delta !== 0) {
      await pgPool.query(
        \`INSERT INTO public.economy_transactions
          (user_id,wallet_token,kind,coins_delta,lives_delta,room_code,note,idempotency_key)
         VALUES($1,$2,$3,$4,0,$5,$6,$7)
         ON CONFLICT(idempotency_key) DO NOTHING\`,
        [
          user.id,
          walletToken,
          String(kind || "COIN_CHANGE").slice(0,40),
          Math.trunc(Number(delta)||0),
          details?.roomCode ? String(details.roomCode).slice(0,8) : null,
          details?.note ? String(details.note).slice(0,100) : null,
          idempotencyKey || null
        ]
      );
    }
  } catch (err) {
    console.warn("Economie sync:", err.message);
  }
}
`;

const SOCKETS = String.raw`
    socket.on("economy:get", async (payload = {}, cb = () => {}) => {
      try {
        const token = String(payload.walletToken || socket.data.walletToken || "").trim();
        if (!/^[a-f0-9]{48}$/i.test(token)) {
          return cb({ok:false,error:"Session introuvable."});
        }

        socket.data.walletToken = token;
        const state = await economyState(token);
        cb({ok:true,...state});
      } catch (err) {
        console.error("economy:get:", err.message);
        cb({ok:false,error:"Impossible de charger les vies."});
      }
    });

    socket.on("economy:rewardedAdDev", async (payload = {}, cb = () => {}) => {
      if (String(process.env.REWARDED_AD_DEV_MODE || "false").toLowerCase() !== "true") {
        return cb({
          ok:false,
          error:"La pub recompensee sera activee avec l'application mobile."
        });
      }

      const token = String(payload.walletToken || socket.data.walletToken || "").trim();
      if (!/^[a-f0-9]{48}$/i.test(token) || !wallets.has(token)) {
        return cb({ok:false,error:"Portefeuille introuvable."});
      }

      const eventId = "dev-ad:" + Date.now() + ":" + crypto.randomBytes(4).toString("hex");
      const tx = walletTransaction(
        token,
        ECONOMY_AD_REWARD,
        "REWARDED_AD",
        {note:"Video recompensee (+80)"},
        eventId
      );

      const balance = tx?.balance ?? walletBalance(token);
      socket.emit("wallet:update",{balance});
      cb({ok:true,reward:ECONOMY_AD_REWARD,balance});
    });
`;

const TARGET_SERVER_FILE = path.resolve(__dirname, "server.js");

Module._extensions[".js"] = function patchedLoader(mod, filename) {
  // Ne patcher QUE le server.js du projet.
  // Des dépendances comme engine.io possèdent aussi un fichier nommé server.js.
  if (path.resolve(filename) !== TARGET_SERVER_FILE) {
    return originalLoader(mod, filename);
  }

  console.log("[Economy V2.4] patch de:", filename);
  let source = fs.readFileSync(filename, "utf8");

  source = need(
    source,
    'const GAME_COST = 5;',
    'const GAME_COST = 0; // Economie V2.4: entree payee en vies',
    "GAME_COST"
  );

  source = need(
    source,
    'const DEFAULT_COINS = 25;',
    'const DEFAULT_COINS = 50;',
    "DEFAULT_COINS"
  );

  source = needRegex(
    source,
    /function emitWallet\(player\) \{[\s\S]*?\n\}\n/,
    match => match + HELPERS.replace(/\\`/g, "`") + "\n",
    "helpers"
  );

  source = need(
    source,
    'socket.on("game:start", payload => {',
    'socket.on("game:start", async payload => {',
    "game:start async"
  );

  source = needRegex(
    source,
    /    if \(!room\.entryDebited\) \{[\s\S]*?      humans\.forEach\(emitWallet\);\n    \}\n\n    room\.categories =/,
`    if (!room.entryDebited) {
      if (room.economyStartPending) {
        return socket.emit("toast", "Lancement deja en cours...");
      }

      room.economyStartPending = true;
      const humans = room.players.filter(p => !p.isBot);

      try {
        if (humans.some(p => !p.walletToken)) {
          return socket.emit("toast", "Un joueur n'a pas encore de profil valide.");
        }

        const gameSessionId = room.gameSessionId || id();
        room.gameSessionId = gameSessionId;

        const lifeResult = await consumeLivesForRoom(
          humans,
          room.code,
          gameSessionId
        );

        if (!lifeResult?.ok) {
          room.gameSessionId = null;

          if (lifeResult?.player?.socketId) {
            io.to(lifeResult.player.socketId).emit(
              "toast",
              "Tu n'as plus de vie. +1 vie toutes les 30 min."
            );
          }

          return socket.emit(
            "toast",
            lifeResult?.error || "Un joueur n'a plus de vie."
          );
        }

        room.entryDebited = true;
        room.paidPlayerIds = humans.map(p => p.id);
        room.pot = 0;

        for (const p of humans) {
          const eco = await economyState(p.walletToken);
          if (p.socketId) io.to(p.socketId).emit("economy:update", eco);
        }
      } catch (err) {
        console.error("Prelevement des vies:", err.message);
        room.gameSessionId = null;
        return socket.emit("toast", "Impossible de verifier les vies pour le moment.");
      } finally {
        room.economyStartPending = false;
      }
    }

    room.categories =`,
    "life entry"
  );

  source = needRegex(
    source,
    /function refundPreGameEntry\(room\) \{[\s\S]*?\n\}\n\nfunction rewardSharesForCount/,
`function refundPreGameEntry(room) {
  if (!room.entryDebited || !room.gameSessionId) return;

  const paid = new Set(room.paidPlayerIds || []);
  const snapshot = {
    roomCode: room.code,
    sessionId: room.gameSessionId,
    players: room.players
      .filter(p => !p.isBot && p.walletToken && paid.has(p.id))
      .map(p => ({
        id:p.id,
        name:p.name,
        avatar:p.avatar,
        walletToken:p.walletToken,
        socketId:p.socketId
      }))
  };

  room.entryDebited = false;
  room.paidPlayerIds = [];
  room.pot = 0;
  room.gameSessionId = null;

  refundLivesSnapshot(snapshot)
    .then(async () => {
      for (const p of snapshot.players) {
        const eco = await economyState(p.walletToken).catch(() => null);
        if (eco && p.socketId) io.to(p.socketId).emit("economy:update", eco);
      }
    })
    .catch(err => console.warn("Remboursement vie:", err.message));
}

function rewardSharesForCount`,
    "life refund"
  );

  source = needRegex(
    source,
    /function calculateRewards\(room\) \{[\s\S]*?\n\}\n\nfunction distributeRewards/,
`function calculateRewards(room) {
  const humans = room.players
    .filter(p => !p.isBot && p.walletToken)
    .sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));

  const rewards = Object.fromEntries(room.players.map(p => [p.id,0]));
  if (!humans.length) return rewards;

  let start = 0;
  let rank = 1;

  while (start < humans.length) {
    let end = start + 1;
    while (end < humans.length && humans[end].score === humans[start].score) {
      end += 1;
    }

    const base =
      rank === 1 ? 60 :
      rank === 2 ? 40 :
      rank === 3 ? 25 :
      10;

    const reward = variedReward(base);

    for (let i = start; i < end; i++) {
      rewards[humans[i].id] = reward;
    }

    rank += (end - start);
    start = end;
  }

  return rewards;
}

function distributeRewards`,
    "rewards"
  );

  source = need(
    source,
    '  wallet.history = [...(wallet.history || []), transaction].slice(-100);\n  persistWallet(token);',
    '  wallet.history = [...(wallet.history || []), transaction].slice(-100);\n  persistWallet(token);\n  syncEconomyCoins(token, after, transaction.type, appliedDelta, details, transaction.idempotencyKey);',
    "coin sync"
  );

  // IMPORTANT: vrai retour à la ligne, pas les caractères "\\n".
  source = need(
    source,
    'io.on("connection", socket => {',
    'io.on("connection", socket => {\n' + SOCKETS.replace(/\\`/g, "`"),
    "economy sockets"
  );

  try {
    mod._compile(source, filename);
  } catch (err) {
    const line = Number(String(err?.stack || "").match(/server\.js:(\d+)/)?.[1] || 0);
    if (line) {
      const lines = source.split("\n");
      const from = Math.max(0, line - 4);
      const to = Math.min(lines.length, line + 3);
      console.error("[Economy V2.4] Extrait du server.js transforme:");
      for (let i = from; i < to; i++) {
        console.error(String(i + 1).padStart(5, " ") + " | " + lines[i]);
      }
    }
    throw err;
  }
};

console.log("[Economy V2.4] runtime patch charge.");
