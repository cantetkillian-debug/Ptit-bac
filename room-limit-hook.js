/*
 * P'tit Bac — correctifs serveur du salon.
 * - limite à 6 joueurs
 * - conserve les photos de profil importées
 * - transmet le code ami dans l'état public du salon
 *
 * V15: correction du patch avatar qui provoquait une SyntaxError
 * sur Render à cause d'un échappement invalide dans une regex injectée.
 */
"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");

const originalJsLoader = Module._extensions[".js"];

Module._extensions[".js"] = function ptitBacRoomPatchLoader(module, filename) {
  if (path.basename(filename) !== "server.js") {
    return originalJsLoader(module, filename);
  }

  let source = fs.readFileSync(filename, "utf8");

  source = source
    // Limite de joueurs
    .replace(
      /if\s*\(room\.players\.length\s*>=\s*12\)\s*return cb\(\{\s*ok:\s*false,\s*error:\s*"Cette partie est pleine\."\s*\}\);/g,
      'if (room.players.length >= 6) return cb({ ok: false, error: "Cette partie est pleine (6 joueurs maximum)." });'
    )
    .replace(
      /if\s*\(room\.players\.length\s*>=\s*12\)\s*\{\s*return socket\.emit\("toast",\s*"Le salon est complet \(12 joueurs maximum\)\."\);\s*\}/g,
      'if (room.players.length >= 6) { return socket.emit("toast", "Le salon est complet (6 joueurs maximum)."); }'
    )

    // room:create / room:join reçoivent aussi le code ami.
    .replace(
      /socket\.on\("room:create",\s*\(\{\s*name,\s*rounds = 1,\s*duration = 60,\s*categoryCount = 6,\s*categoryDifficulty = "beginner",\s*avatar,\s*walletToken\s*\}/,
      'socket.on("room:create", ({ name, rounds = 1, duration = 60, categoryCount = 6, categoryDifficulty = "beginner", avatar, friendCode, walletToken }'
    )
    .replace(
      /socket\.on\("room:join",\s*\(\{\s*code,\s*name,\s*avatar,\s*walletToken\s*\}/,
      'socket.on("room:join", ({ code, name, avatar, friendCode, walletToken }'
    )

    // Avatar importé + code ami.
    // Important : aucun littéral RegExp n'est injecté ici, afin d'éviter
    // tout problème d'échappement lorsque server.js est recompilé.
    .replace(
      /avatar:\s*String\(avatar\s*\|\|\s*""\)\.slice\(0,\s*8\),/g,
      'avatar: (typeof avatar === "string" && avatar.startsWith("data:image/") && avatar.includes(";base64,") && avatar.length <= 450000) ? avatar : Array.from(String(avatar || "")).slice(0, 8).join(""),\n      friendCode: (() => { const c = String(friendCode || "").trim(); return c.length === 5 && Array.from(c).every(ch => ch >= "0" && ch <= "9") ? c : ""; })(),'
    )

    // Expose le code ami dans publicPlayer().
    .replace(
      /avatar:\s*p\.avatar\s*\|\|\s*""\s*\n\s*\};/,
      'avatar: p.avatar || "",\n    friendCode: p.friendCode || ""\n  };'
    );


  // ============================================================
  // Intégration admin — compatible avec economy-hook.js.
  // ============================================================
  source = source.replace(
    'function walletBalance(token) {\n  return wallets.get(token)?.coins ?? 0;\n}',
    'function walletBalance(token) {\n  if (global.__ptbInfiniteCoins?.has(token)) return 999999;\n  return wallets.get(token)?.coins ?? 0;\n}\n\nglobal.__ptbAdminSetCoins = (token, value) => {\n  const ensured = ensureWallet(token);\n  const target = Math.max(0, Math.min(999999, Math.floor(Number(value) || 0)));\n  ensured.wallet.coins = target;\n  ensured.wallet.updatedAt = Date.now();\n  persistWallet(ensured.token);\n  return target;\n};'
  );

  source = source.replace(
    '  const safeDelta = Math.trunc(Number(delta) || 0);\n  const before = wallet.coins;',
    '  const safeDelta = Math.trunc(Number(delta) || 0);\n  if (safeDelta < 0 && global.__ptbInfiniteCoins?.has(token)) {\n    return { balance: 999999, transaction: { type: "admin_infinite", delta: 0, before: 999999, after: 999999, at: Date.now() }, duplicate: false };\n  }\n  const before = wallet.coins;'
  );

  // ============================================================
  // Départ volontaire d'un joueur pendant une partie.
  // ============================================================
  source = source.replace(
    '\nio.on("connection", socket => {',
    `
function ptitBacTransferHost(room) {
  const nextHost = room.players.find(p => !p.isBot) || room.players[0] || null;
  room.players.forEach(p => { p.isHost = !!nextHost && p.id === nextHost.id; });
}

function ptitBacDetachSocketFromRoom(socket, room, player) {
  try { socket.leave(room.code); } catch {}
  if (socket.data?.code === room.code) socket.data.code = "";
  if (socket.data?.playerId === player?.id) socket.data.playerId = "";
}

function ptitBacCloseRoomSockets(room, payload = {}) {
  room.players.forEach(player => {
    if (!player.socketId) return;
    const targetSocket = io.sockets.sockets.get(player.socketId);
    if (!targetSocket) return;

    targetSocket.emit("room:closed", payload);

    try { targetSocket.leave(room.code); } catch {}
    if (targetSocket.data?.code === room.code) targetSocket.data.code = "";
    if (targetSocket.data?.playerId === player.id) targetSocket.data.playerId = "";
  });
}

function ptitBacAwardForfeit(room, winner, quitterName) {
  const reward = Math.max(0, Math.floor(Number(room.pot || 0)));
  let balance = winner?.walletToken ? walletBalance(winner.walletToken) : 0;

  if (winner && winner.walletToken && reward > 0 && !room.rewardsDistributed) {
    const key =
      "forfeit:" +
      room.code +
      ":" +
      String(room.gameSessionId || room.createdAt || "") +
      ":" +
      winner.id;

    walletTransaction(
      winner.walletToken,
      reward,
      "GAME_FORFEIT_REWARD",
      {
        roomCode: room.code,
        note: "Victoire par forfait contre " + String(quitterName || "un joueur")
      },
      key
    );

    room.rewardsDistributed = true;
    room.rewardsByPlayerId = Object.fromEntries(
      room.players.map(p => [p.id, p.id === winner.id ? reward : 0])
    );
    room.rewardsDistributedAt = Date.now();

    balance = walletBalance(winner.walletToken);
    emitWallet(winner);
  }

  return { reward, balance };
}

function ptitBacHandleExplicitLeave(socket, payload = {}, cb = () => {}) {
  const { room, player } = requireMember(socket, payload);
  if (!room || !player) {
    return cb({ ok: false, error: "Partie introuvable." });
  }

  const phaseBeforeLeave = room.phase;
  const isActiveGame =
    phaseBeforeLeave !== "lobby" &&
    phaseBeforeLeave !== "finished";

  const humanCountBefore = room.players.filter(p => !p.isBot).length;
  const wasHost = !!player.isHost;
  const quitterName = String(player.name || "Un joueur");

  room.players = room.players.filter(p => p.id !== player.id);
  ptitBacDetachSocketFromRoom(socket, room, player);

  // Départ classique depuis le salon.
  if (!isActiveGame) {
    if (room.players.length === 0) {
      rooms.delete(room.code);
      return cb({ ok: true, outcome: "room_closed" });
    }

    if (wasHost) ptitBacTransferHost(room);
    emitRoom(room);
    return cb({ ok: true, outcome: "left_room" });
  }

  const remainingHumans = room.players.filter(p => !p.isBot);

  // Aucun humain restant : la partie et les bots sont clôturés.
  if (remainingHumans.length === 0) {
    rooms.delete(room.code);

    return cb({
      ok: true,
      outcome: "room_closed_bots_only",
      message: "La partie est terminée."
    });
  }

  // Duel : l'autre humain gagne immédiatement par forfait.
  if (humanCountBefore === 2 && remainingHumans.length === 1) {
    const winner = remainingHumans[0];
    const payout = ptitBacAwardForfeit(room, winner, quitterName);

    ptitBacCloseRoomSockets(room, {
      reason: "forfeit_win",
      message: quitterName + " a quitté la partie.",
      quitterName,
      winnerId: winner.id,
      winnerName: winner.name,
      reward: payout.reward,
      balance: payout.balance
    });

    rooms.delete(room.code);

    return cb({
      ok: true,
      outcome: "forfeit",
      message: "Tu as quitté la partie."
    });
  }

  // 3 humains ou plus : on retire uniquement le joueur.
  if (wasHost) ptitBacTransferHost(room);

  if (room.letterChooserPlayerId === player.id) {
    const chooser = chooseLetterPlayer(room);
    room.letterChooserPlayerId = chooser?.id || null;
    room.pendingLetter = null;
    room.letterSpinVersion = (room.letterSpinVersion || 0) + 1;
  }

  io.to(room.code).emit("toast", quitterName + " a quitté la partie");
  emitRoom(room);

  // Si le joueur parti bloquait la fin d'une manche,
  // terminer immédiatement lorsque tous les restants ont validé.
  if (
    room.phase === "round" &&
    room.players.length > 0 &&
    room.players.every(p => p.submitted)
  ) {
    endRound(room);
  }

  cb({
    ok: true,
    outcome: "left_game",
    message: "Tu as quitté la partie."
  });
}

io.on("connection", socket => {`
  );

  // ============================================================
  // Compte à rebours synchronisé avant lancement de partie.
  // L'hôte demande le countdown, le serveur le diffuse à tout le salon.
  // Le vrai game:start reste déclenché ensuite par le client de l'hôte.
  // ============================================================
  source = source.replace(
    '\nio.on("connection", socket => {',
    `\nio.on("connection", socket => {
  socket.on("lobby:startCountdown", (payload = {}, cb = () => {}) => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player) {
      return cb({ ok: false, error: "Salon introuvable." });
    }

    if (!player.isHost) {
      return cb({ ok: false, error: "Seul l’hôte peut lancer la partie." });
    }

    if (room.phase !== "lobby") {
      return cb({ ok: false, error: "La partie a déjà commencé." });
    }

    if (room.players.length < 2) {
      return cb({ ok: false, error: "Il faut au moins 2 joueurs." });
    }

    const now = Date.now();
    if (room.ptbCountdownUntil && room.ptbCountdownUntil > now) {
      return cb({ ok: false, error: "Le compte à rebours est déjà lancé." });
    }

    const durationMs = 3200;
    room.ptbCountdownUntil = now + durationMs;

    io.to(room.code).emit("lobby:countdown", {
      code: room.code,
      hostPlayerId: player.id,
      startedAt: now,
      durationMs
    });

    setTimeout(() => {
      const current = rooms.get(room.code);
      if (current) current.ptbCountdownUntil = 0;
    }, durationMs + 1200);

    cb({ ok: true, durationMs });
  });`
  );

  source = source.replace(
    `  socket.on("room:leave", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player) return;

    const leavingWasHost = player.isHost;
    room.players = room.players.filter(p => p.id !== player.id);
    socket.leave(room.code);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    if (leavingWasHost) {
      const nextHost = room.players.find(p => !p.isBot) || room.players[0];
      room.players.forEach(p => { p.isHost = p.id === nextHost.id; });
    }
    emitRoom(room);
  });`,
    `  socket.on("room:leave", (payload, cb = () => {}) => {
    ptitBacHandleExplicitLeave(socket, payload, cb);
  });

  socket.on("game:leave", (payload, cb = () => {}) => {
    ptitBacHandleExplicitLeave(socket, payload, cb);
  });`
  );

  /*
   * IMPORTANT :
   * Ne compile pas server.js directement ici.
   * Sinon economy-hook.js et les autres hooks chargés avant celui-ci
   * ne voient jamais server.js et le jeu casse (coût 5 pièces, vies,
   * création de salon, etc.).
   *
   * On expose temporairement notre version modifiée via fs.readFileSync,
   * puis on laisse le loader précédent poursuivre la chaîne normalement.
   */
  const realReadFileSync = fs.readFileSync;
  const targetFile = path.resolve(filename);

  fs.readFileSync = function ptitBacPatchedRead(requestedPath, ...args) {
    try {
      if (path.resolve(String(requestedPath)) === targetFile) {
        const encoding = args[0];
        if (!encoding || encoding === "utf8" || encoding === "utf-8") {
          return encoding ? source : Buffer.from(source, "utf8");
        }
      }
    } catch {}
    return realReadFileSync.call(fs, requestedPath, ...args);
  };

  try {
    return originalJsLoader(module, filename);
  } finally {
    fs.readFileSync = realReadFileSync;
  }
};
