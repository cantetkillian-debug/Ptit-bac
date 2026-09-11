/*
 * P'tit Bac — correctifs serveur légers du salon.
 * - limite des salons à 6 joueurs
 * - conserve les photos de profil importées au lieu de tronquer "data:image..."
 */
"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");

const originalJsLoader = Module._extensions[".js"];

Module._extensions[".js"] = function ptitBacRoomLimitLoader(module, filename) {
  if (path.basename(filename) !== "server.js") {
    return originalJsLoader(module, filename);
  }

  let source = fs.readFileSync(filename, "utf8");

  source = source
    .replace(
      /if\s*\(room\.players\.length\s*>=\s*12\)\s*return cb\(\{\s*ok:\s*false,\s*error:\s*"Cette partie est pleine\."\s*\}\);/g,
      'if (room.players.length >= 6) return cb({ ok: false, error: "Cette partie est pleine (6 joueurs maximum)." });'
    )
    .replace(
      /if\s*\(room\.players\.length\s*>=\s*12\)\s*\{\s*return socket\.emit\("toast",\s*"Le salon est complet \(12 joueurs maximum\)\."\);\s*\}/g,
      'if (room.players.length >= 6) { return socket.emit("toast", "Le salon est complet (6 joueurs maximum)."); }'
    )
    .replace(
      /avatar:\s*String\(avatar\s*\|\|\s*""\)\.slice\(0,\s*8\),/g,
      'avatar: (typeof avatar === "string" && /^data:image\\/(?:png|jpeg|webp);base64,/i.test(avatar) && avatar.length <= 450000) ? avatar : Array.from(String(avatar || "")).slice(0, 8).join(""),'
    );

  module._compile(source, filename);
};
