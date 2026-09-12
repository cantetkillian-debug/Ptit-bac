"use strict";

const crypto = require("crypto");
const { Pool } = require("pg");
const socketIo = require("socket.io");

const ADMIN_CODE = String(process.env.PTITBAC_ADMIN_CODE || "").trim();
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized:false },
  max:2, idleTimeoutMillis:30000, connectionTimeoutMillis:10000
}) : null;

const infiniteCoins = global.__ptbInfiniteCoins || (global.__ptbInfiniteCoins = new Set());
const infiniteLives = global.__ptbInfiniteLives || (global.__ptbInfiniteLives = new Set());
let schemaPromise = null;

function walletToken(v) {
  v = String(v || "").trim();
  return /^[a-f0-9]{48}$/i.test(v) ? v : "";
}
function friendCode(v) {
  v = String(v || "").replace(/^#/,"").trim();
  return /^\d{5}$/.test(v) ? v : "";
}
function id() { return crypto.randomBytes(12).toString("hex"); }

async function schema() {
  if (!pool) throw new Error("DATABASE_URL manquant");
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS ptitbac_admin_owner(
      singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
      wallet_token text UNIQUE NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ptitbac_admin_settings(
      wallet_token text PRIMARY KEY,
      infinite_coins boolean NOT NULL DEFAULT false,
      infinite_lives boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ptitbac_feedback_reports(
      id text PRIMARY KEY,
      report_type text NOT NULL CHECK(report_type IN ('report-avis','report-bug')),
      wallet_token text,
      friend_code text,
      player_name text,
      message text NOT NULL,
      room_code text,
      category text,
      answer text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  })();
  return schemaPromise;
}

async function ownerToken() {
  await schema();
  const q = await pool.query("SELECT wallet_token FROM ptitbac_admin_owner WHERE singleton=true LIMIT 1");
  return q.rows[0]?.wallet_token || "";
}
async function isAdmin(token) {
  token = walletToken(token);
  return !!token && token === await ownerToken();
}
async function settings(token) {
  await schema();
  const q = await pool.query("SELECT infinite_coins,infinite_lives FROM ptitbac_admin_settings WHERE wallet_token=$1", [token]);
  return q.rows[0] || { infinite_coins:false, infinite_lives:false };
}
async function applyFlags(token) {
  const s = await settings(token);
  s.infinite_coins ? infiniteCoins.add(token) : infiniteCoins.delete(token);
  s.infinite_lives ? infiniteLives.add(token) : infiniteLives.delete(token);
  if (s.infinite_coins) global.__ptbAdminSetCoins?.(token, 999999);
  if (s.infinite_lives && pool) {
    await pool.query("UPDATE public.users SET lives=5,life_updated_at=now(),updated_at=now() WHERE wallet_token=$1", [token]).catch(()=>{});
  }
  return s;
}

// Les adaptations de wallet sont appliquées par room-limit-hook.js,
// afin de préserver la chaîne complète economy -> salon -> admin.

const OriginalServer = socketIo.Server;
class PtitBacAdminServer extends OriginalServer {
  constructor(...args) {
    super(...args);

    // Maintient les vies à 5 pour l'admin si le mode infini est actif.
    const timer = setInterval(async () => {
      if (!pool || !infiniteLives.size) return;
      for (const token of infiniteLives) {
        await pool.query("UPDATE public.users SET lives=5,life_updated_at=now(),updated_at=now() WHERE wallet_token=$1",[token]).catch(()=>{});
      }
    }, 1200);
    timer.unref?.();

    this.on("connection", socket => {
      socket.on("admin:status", async (payload={}, cb=()=>{}) => {
        try {
          const token = walletToken(payload.walletToken);
          const admin = await isAdmin(token);
          if (!admin) return cb({ok:true,admin:false});
          const s = await applyFlags(token);
          cb({ok:true,admin:true,infiniteCoins:!!s.infinite_coins,infiniteLives:!!s.infinite_lives});
        } catch { cb({ok:false,admin:false}); }
      });

      // Installation unique : le code Render PTITBAC_ADMIN_CODE lie définitivement
      // le premier portefeuille admin. Après cela, le code ne permet pas de changer de propriétaire.
      socket.on("admin:claim", async (payload={}, cb=()=>{}) => {
        try {
          await schema();
          const token = walletToken(payload.walletToken);
          if (!token || !ADMIN_CODE || String(payload.code||"").trim() !== ADMIN_CODE)
            return cb({ok:false,error:"Code admin incorrect."});
          const current = await ownerToken();
          if (current && current !== token)
            return cb({ok:false,error:"Un administrateur est déjà enregistré."});
          await pool.query(`INSERT INTO ptitbac_admin_owner(singleton,wallet_token)
            VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING`, [token]);
          await pool.query(`INSERT INTO ptitbac_admin_settings(wallet_token)
            VALUES($1) ON CONFLICT(wallet_token) DO NOTHING`, [token]);
          cb({ok:true,admin:true});
        } catch (e) { cb({ok:false,error:"Activation admin impossible."}); }
      });

      socket.on("admin:selfSettings", async (payload={}, cb=()=>{}) => {
        try {
          const token = walletToken(payload.walletToken);
          if (!await isAdmin(token)) return cb({ok:false,error:"Accès refusé."});
          const coins = !!payload.infiniteCoins, lives = !!payload.infiniteLives;
          await pool.query(`INSERT INTO ptitbac_admin_settings(wallet_token,infinite_coins,infinite_lives,updated_at)
            VALUES($1,$2,$3,now()) ON CONFLICT(wallet_token) DO UPDATE
            SET infinite_coins=$2,infinite_lives=$3,updated_at=now()`, [token,coins,lives]);
          await applyFlags(token);

          let balance = null;
          if (coins) {
            balance = global.__ptbAdminSetCoins?.(token, 999999) ?? 999999;
          } else if (pool) {
            const q = await pool.query(
              "SELECT coins FROM ptitbac_wallets WHERE token=$1 LIMIT 1",
              [token]
            ).catch(() => ({ rows: [] }));
            balance = Number(q.rows[0]?.coins ?? 0);
          }

          if (Number.isFinite(Number(balance))) {
            socket.emit("wallet:update", { balance: Number(balance) });
          }

          cb({ok:true,infiniteCoins:coins,infiniteLives:lives,balance});
        } catch { cb({ok:false,error:"Modification impossible."}); }
      });

      socket.on("admin:addCoins", async (payload={}, cb=()=>{}) => {
        try {
          const token = walletToken(payload.walletToken);
          if (!await isAdmin(token)) return cb({ok:false,error:"Accès refusé."});
          const code = friendCode(payload.friendCode);
          const amount = Math.max(1,Math.min(999999,Math.floor(Number(payload.amount)||0)));
          if (!code || !amount) return cb({ok:false,error:"ID ou montant invalide."});
          const u = await pool.query("SELECT wallet_token,username FROM public.users WHERE friend_code=$1 OR friend_code=$2 LIMIT 1",[code,"PLAYER#"+code.slice(-4)]);
          if (!u.rowCount || !u.rows[0].wallet_token) return cb({ok:false,error:"Joueur introuvable."});
          const target = u.rows[0].wallet_token;
          const current = await pool.query("SELECT coins FROM ptitbac_wallets WHERE token=$1 LIMIT 1",[target]);
          const next = Math.min(999999, Number(current.rows[0]?.coins||0)+amount);
          await pool.query(`INSERT INTO ptitbac_wallets(token,coins,created_at,updated_at,history)
            VALUES($1,$2,$3,$3,'[]'::jsonb)
            ON CONFLICT(token) DO UPDATE SET coins=$2,updated_at=$3`,[target,next,Date.now()]);
          global.__ptbAdminSetCoins?.(target, next);

          // Si le joueur est connecté au même serveur, son prochain wallet:update
          // et les transactions utilisent immédiatement la nouvelle valeur mémoire.
          cb({ok:true,name:u.rows[0].username||"Joueur",balance:next});
        } catch { cb({ok:false,error:"Ajout de pièces impossible."}); }
      });

      socket.on("feedback:submit", async (payload={}, cb=()=>{}) => {
        try {
          await schema();
          const type = payload.type === "report-bug" ? "report-bug" : "report-avis";
          const message = String(payload.message||"").trim().slice(0,1000);
          if (!message) return cb({ok:false,error:"Écris un message."});
          await pool.query(`INSERT INTO ptitbac_feedback_reports
            (id,report_type,wallet_token,friend_code,player_name,message,room_code,category,answer)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
              id(),type,walletToken(payload.walletToken)||null,friendCode(payload.friendCode)||null,
              String(payload.playerName||"Joueur").slice(0,24),message,
              String(payload.roomCode||"").slice(0,8)||null,
              String(payload.category||"").slice(0,80)||null,
              String(payload.answer||"").slice(0,100)||null
            ]);
          cb({ok:true});
        } catch { cb({ok:false,error:"Envoi impossible."}); }
      });

      socket.on("admin:reports", async (payload={}, cb=()=>{}) => {
        try {
          const token = walletToken(payload.walletToken);
          if (!await isAdmin(token)) return cb({ok:false,error:"Accès refusé."});
          await schema();
          const feedback = await pool.query(`SELECT id,report_type AS type,friend_code,player_name,message,room_code,category,answer,created_at
            FROM ptitbac_feedback_reports ORDER BY created_at DESC LIMIT 250`);
          const players = await pool.query(`SELECT id,'report-joueur' AS type,reported_friend_code AS friend_code,
            reported_name AS player_name,reason AS message,room_code,NULL::text AS category,NULL::text AS answer,created_at
            FROM ptitbac_player_reports ORDER BY created_at DESC LIMIT 250`).catch(()=>({rows:[]}));
          const answers = await pool.query(`SELECT id,'report-bug' AS type,NULL::text AS friend_code,
            'Réponse signalée' AS player_name,COALESCE(original_reason,'Réponse contestée') AS message,
            room_code,category,answer,to_timestamp(created_at/1000.0) AS created_at
            FROM ptitbac_answer_reports ORDER BY created_at DESC LIMIT 250`).catch(()=>({rows:[]}));
          const reports = [...feedback.rows,...players.rows,...answers.rows]
            .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,400);
          cb({ok:true,reports});
        } catch { cb({ok:false,error:"Impossible de charger les reports."}); }
      });
    });
  }
}
socketIo.Server = PtitBacAdminServer;

schema().then(async()=>{
  const owner = await ownerToken();
  if (owner) await applyFlags(owner);
}).catch(e=>console.warn("Admin V1:",e.message));

process.on("SIGTERM",()=>pool?.end().catch(()=>{}));
