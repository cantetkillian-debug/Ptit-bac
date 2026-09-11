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

  module._compile(source, filename);
};
