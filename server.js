const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));

const CATEGORIES = [
  "Prénom",
  "Animal",
  "Lieu",
  "Métier",
  "Nourriture",
  "Marque",
  "Film",
  "Jeu vidéo",
  "Personnage fictif",
  "Fruit / Légume",
  "Objet",
  "Boisson",
  "Application / Réseau social",
  "Sport"
];

// Lettres volontairement jouables en français pour une soirée.
// Tu peux en ajouter/retirer ici.
const LETTERS = ["A","B","C","D","E","F","G","H","J","L","M","N","P","R","S","T","V"];

const rooms = new Map();

function id() {
  return crypto.randomBytes(10).toString("hex");
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function sample(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
}

function startsWithLetter(answer, letter) {
  const normalized = normalizeAnswer(answer);
  const first = normalized.charAt(0).toUpperCase();
  return first === letter.toUpperCase();
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    connected: p.connected,
    score: p.score,
    isHost: p.isHost,
    submitted: p.submitted
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(publicPlayer),
    categories: room.categories,
    letters: room.letters,
    roundIndex: room.roundIndex,
    currentLetter: room.roundIndex >= 0 ? room.letters[room.roundIndex] : null,
    roundEndsAt: room.roundEndsAt,
    validation: room.validation
      ? {
          items: room.validation.items,
          cursor: room.validation.cursor
        }
      : null,
    lastRoundScores: room.lastRoundScores || {}
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:state", publicRoom(room));
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function getPlayer(room, playerId) {
  return room?.players.find(p => p.id === playerId);
}

function requireMember(socket, payload) {
  const room = getRoom(payload?.code);
  const player = getPlayer(room, payload?.playerId);
  if (!room || !player) return {};
  return { room, player };
}

function setPlayerSocket(room, player, socket) {
  player.socketId = socket.id;
  player.connected = true;
  socket.join(room.code);
  socket.data.code = room.code;
  socket.data.playerId = player.id;
}

function buildValidation(room) {
  const round = room.roundIndex;
  const letter = room.letters[round];
  const items = [];
  const autoResults = {};

  room.players.forEach(player => {
    autoResults[player.id] = {};
    room.categories.forEach(category => {
      const answer = String(player.answers?.[round]?.[category] || "").trim();
      if (!answer) {
        autoResults[player.id][category] = { status: "invalid", reason: "empty" };
      } else if (!startsWithLetter(answer, letter)) {
        autoResults[player.id][category] = { status: "invalid", reason: "letter" };
      }
    });
  });

  room.categories.forEach(category => {
    const groups = new Map();
    room.players.forEach(player => {
      if (autoResults[player.id][category]) return;
      const answer = String(player.answers?.[round]?.[category] || "").trim();
      const key = normalizeAnswer(answer);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ playerId: player.id, playerName: player.name, answer });
    });

    for (const group of groups.values()) {
      if (group.length > 1) {
        group.forEach(entry => {
          autoResults[entry.playerId][category] = { status: "duplicate", reason: "duplicate" };
        });
      } else {
        const entry = group[0];
        items.push({
          id: id(),
          category,
          playerId: entry.playerId,
          playerName: entry.playerName,
          answer: entry.answer,
          status: "pending"
        });
      }
    }
  });

  return {
    items,
    cursor: 0,
    autoResults
  };
}

function currentPending(validation) {
  return validation?.items.findIndex(item => item.status === "pending") ?? -1;
}

function finalizeRound(room) {
  const round = room.roundIndex;
  const scores = {};

  room.players.forEach(player => {
    let gained = 0;
    room.categories.forEach(category => {
      const auto = room.validation.autoResults[player.id]?.[category];
      if (auto) return;

      const item = room.validation.items.find(
        i => i.playerId === player.id && i.category === category
      );
      if (item?.status === "valid") gained += 1;
    });
    player.score += gained;
    scores[player.id] = gained;
    player.submitted = false;
  });

  room.lastRoundScores = scores;
  room.phase = round >= 4 ? "finished" : "scoreboard";
  room.roundEndsAt = null;
  room.validation = null;
  emitRoom(room);
}

function endRound(room) {
  if (room.phase !== "round") return;

  room.players.forEach(player => {
    if (!player.answers[room.roundIndex]) player.answers[room.roundIndex] = {};
    player.submitted = true;
  });

  room.phase = "validation";
  room.roundEndsAt = null;
  room.validation = buildValidation(room);
  room.validation.cursor = currentPending(room.validation);

  // S'il n'y a aucune réponse à juger, on calcule directement.
  if (room.validation.cursor === -1) {
    finalizeRound(room);
  } else {
    emitRoom(room);
  }
}

function startRound(room) {
  room.roundIndex += 1;
  room.phase = "round";
  room.roundEndsAt = Date.now() + 60_000;
  room.validation = null;
  room.lastRoundScores = {};
  room.players.forEach(p => {
    p.submitted = false;
    if (!p.answers[room.roundIndex]) p.answers[room.roundIndex] = {};
  });
  emitRoom(room);

  const thisRound = room.roundIndex;
  setTimeout(() => {
    const current = rooms.get(room.code);
    if (current && current.phase === "round" && current.roundIndex === thisRound) {
      endRound(current);
    }
  }, 60_300);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }, cb = () => {}) => {
    const safeName = cleanName(name);
    if (!safeName) return cb({ ok: false, error: "Choisis un prénom." });

    const code = roomCode();
    const player = {
      id: id(),
      name: safeName,
      connected: true,
      socketId: socket.id,
      score: 0,
      isHost: true,
      submitted: false,
      answers: {}
    };

    const room = {
      code,
      phase: "lobby",
      players: [player],
      categories: sample(CATEGORIES, 6),
      letters: sample(LETTERS, 5),
      roundIndex: -1,
      roundEndsAt: null,
      validation: null,
      lastRoundScores: {},
      createdAt: Date.now()
    };

    rooms.set(code, room);
    setPlayerSocket(room, player, socket);
    cb({ ok: true, code, playerId: player.id, state: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name }, cb = () => {}) => {
    const room = getRoom(code);
    const safeName = cleanName(name);

    if (!room) return cb({ ok: false, error: "Partie introuvable." });
    if (room.phase !== "lobby") return cb({ ok: false, error: "La partie a déjà commencé." });
    if (!safeName) return cb({ ok: false, error: "Choisis un prénom." });
    if (room.players.length >= 12) return cb({ ok: false, error: "Cette partie est pleine." });

    const duplicateName = room.players.some(p => p.name.toLowerCase() === safeName.toLowerCase());
    if (duplicateName) return cb({ ok: false, error: "Ce prénom est déjà utilisé." });

    const player = {
      id: id(),
      name: safeName,
      connected: true,
      socketId: socket.id,
      score: 0,
      isHost: false,
      submitted: false,
      answers: {}
    };

    room.players.push(player);
    setPlayerSocket(room, player, socket);
    cb({ ok: true, code: room.code, playerId: player.id, state: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:reconnect", ({ code, playerId }, cb = () => {}) => {
    const room = getRoom(code);
    const player = getPlayer(room, playerId);
    if (!room || !player) return cb({ ok: false });

    setPlayerSocket(room, player, socket);
    cb({ ok: true, state: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("game:start", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player?.isHost || room.phase !== "lobby") return;
    if (room.players.length < 2) {
      return socket.emit("toast", "Il faut au moins 2 joueurs.");
    }
    startRound(room);
  });

  socket.on("answer:update", ({ code, playerId, category, value }) => {
    const { room, player } = requireMember(socket, { code, playerId });
    if (!room || !player || room.phase !== "round" || player.submitted) return;
    if (!room.categories.includes(category)) return;

    if (!player.answers[room.roundIndex]) player.answers[room.roundIndex] = {};
    player.answers[room.roundIndex][category] = String(value || "").slice(0, 60);
  });

  socket.on("round:submit", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player || room.phase !== "round") return;
    player.submitted = true;
    emitRoom(room);

    // Dès que tous les joueurs ont validé, la manche se termine.
    if (room.players.every(p => p.submitted)) endRound(room);
  });

  socket.on("validation:judge", ({ code, playerId, itemId, status }) => {
    const { room, player } = requireMember(socket, { code, playerId });
    if (!room || !player?.isHost || room.phase !== "validation") return;
    if (!["valid", "invalid"].includes(status)) return;

    const item = room.validation.items.find(i => i.id === itemId);
    if (!item || item.status !== "pending") return;

    item.status = status;
    room.validation.cursor = currentPending(room.validation);

    if (room.validation.cursor === -1) {
      finalizeRound(room);
    } else {
      emitRoom(room);
    }
  });

  socket.on("game:nextRound", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player?.isHost || room.phase !== "scoreboard") return;
    startRound(room);
  });

  socket.on("game:restart", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player?.isHost) return;

    room.phase = "lobby";
    room.categories = sample(CATEGORIES, 6);
    room.letters = sample(LETTERS, 5);
    room.roundIndex = -1;
    room.roundEndsAt = null;
    room.validation = null;
    room.lastRoundScores = {};
    room.players.forEach(p => {
      p.score = 0;
      p.submitted = false;
      p.answers = {};
    });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket.data.code);
    const player = getPlayer(room, socket.data.playerId);
    if (!room || !player) return;

    player.connected = false;
    emitRoom(room);

    // Nettoyage après 3 heures d'inactivité totale.
    setTimeout(() => {
      const current = rooms.get(room.code);
      if (
        current &&
        Date.now() - current.createdAt > 3 * 60 * 60 * 1000 &&
        current.players.every(p => !p.connected)
      ) {
        rooms.delete(current.code);
      }
    }, 3 * 60 * 60 * 1000);
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Petit Bac lancé sur http://localhost:${PORT}`);
});
