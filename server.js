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
    isBot: !!p.isBot,
    submitted: p.submitted
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(publicPlayer),
    categories: room.categories,
    rounds: room.rounds,
    duration: room.duration,
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
  room.phase = room.roundIndex + 1 < room.rounds ? "scoreboard" : "finished";
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
  room.roundEndsAt = Date.now() + room.duration * 1000;
  room.validation = null;
  room.lastRoundScores = {};
  room.players.forEach(p => {
    p.submitted = false;
    if (!p.answers[room.roundIndex]) p.answers[room.roundIndex] = {};
  });
  emitRoom(room);
  playBots(room);

  const thisRound = room.roundIndex;
  setTimeout(() => {
    const current = rooms.get(room.code);
    if (current && current.phase === "round" && current.roundIndex === thisRound) {
      endRound(current);
    }
  }, room.duration * 1000 + 300);
}


function makeBotAnswer(category, letter) {
  const examples = {
    "Prénom": { A:"Alice", B:"Bruno", C:"Camille", D:"David", E:"Emma", F:"Félix", G:"Gabriel", H:"Hugo", J:"Jade", L:"Lucas", M:"Manon", N:"Nina", P:"Paul", R:"Rose", S:"Sarah", T:"Tom", V:"Victor" },
    "Animal": { A:"Aigle", B:"Baleine", C:"Chat", D:"Dauphin", E:"Éléphant", F:"Faucon", G:"Girafe", H:"Hérisson", J:"Jaguar", L:"Lion", M:"Mouton", N:"Narval", P:"Panda", R:"Renard", S:"Singe", T:"Tigre", V:"Vache" },
    "Lieu": { A:"Annecy", B:"Bordeaux", C:"Cannes", D:"Dijon", E:"Évry", F:"Florence", G:"Grenoble", H:"Honfleur", J:"Japon", L:"Lyon", M:"Marseille", N:"Nantes", P:"Paris", R:"Rome", S:"Strasbourg", T:"Toulouse", V:"Venise" },
    "Métier": { A:"Architecte", B:"Boulanger", C:"Coiffeur", D:"Dentiste", E:"Électricien", F:"Fleuriste", G:"Garagiste", H:"Horloger", J:"Journaliste", L:"Libraire", M:"Médecin", N:"Notaire", P:"Pompier", R:"Réalisateur", S:"Serveur", T:"Traducteur", V:"Vétérinaire" },
    "Nourriture": { A:"Abricot", B:"Burger", C:"Croissant", D:"Donut", E:"Endive", F:"Fraise", G:"Gaufre", H:"Haricot", J:"Jambon", L:"Lasagnes", M:"Melon", N:"Nouilles", P:"Pizza", R:"Riz", S:"Sushi", T:"Tacos", V:"Vanille" },
    "Marque": { A:"Adidas", B:"Bic", C:"Canon", D:"Dior", E:"Epson", F:"Ford", G:"Google", H:"Honda", J:"Jeep", L:"Lego", M:"Microsoft", N:"Nike", P:"Peugeot", R:"Renault", S:"Samsung", T:"Tesla", V:"Vans" },
    "Film": { A:"Avatar", B:"Barbie", C:"Cars", D:"Dune", E:"Encanto", F:"Frozen", G:"Gladiator", H:"Hercule", J:"Joker", L:"Lucy", M:"Matrix", N:"Nope", P:"Parasite", R:"Rocky", S:"Shrek", T:"Titanic", V:"Venom" },
    "Jeu vidéo": { A:"Among Us", B:"Brawl Stars", C:"Celeste", D:"Doom", E:"Elden Ring", F:"Fortnite", G:"Gran Turismo", H:"Halo", J:"Journey", L:"Limbo", M:"Minecraft", N:"Nintendogs", P:"Pokémon", R:"Roblox", S:"Subnautica", T:"Terraria", V:"Valorant" },
    "Personnage fictif": { A:"Aladdin", B:"Batman", C:"Cendrillon", D:"Dobby", E:"Elsa", F:"Flash", G:"Goku", H:"Hulk", J:"Joker", L:"Luffy", M:"Mario", N:"Naruto", P:"Pikachu", R:"Robin", S:"Shrek", T:"Thor", V:"Vegeta" },
    "Fruit / Légume": { A:"Avocat", B:"Banane", C:"Carotte", D:"Datte", E:"Épinard", F:"Fraise", G:"Goyave", H:"Haricot", J:"Jujube", L:"Litchi", M:"Mangue", N:"Navet", P:"Poire", R:"Radis", S:"Salade", T:"Tomate", V:"Vitelotte" },
    "Objet": { A:"Assiette", B:"Bouteille", C:"Chaise", D:"Dé", E:"Échelle", F:"Fourchette", G:"Gomme", H:"Horloge", J:"Jumelles", L:"Lampe", M:"Marteau", N:"Nappe", P:"Parapluie", R:"Radio", S:"Stylo", T:"Table", V:"Vase" },
    "Boisson": { A:"Aquarius", B:"Badoit", C:"Café", D:"Dr Pepper", E:"Eau", F:"Fanta", G:"Gini", H:"Horchata", J:"Jus", L:"Limonade", M:"Milkshake", N:"Nectar", P:"Perrier", R:"Red Bull", S:"Sprite", T:"Thé", V:"Volvic" },
    "Application / Réseau social": { A:"Airbnb", B:"BeReal", C:"Canva", D:"Discord", E:"Etsy", F:"Facebook", G:"Google Maps", H:"Hinge", J:"Just Eat", L:"LinkedIn", M:"Messenger", N:"Netflix", P:"Pinterest", R:"Reddit", S:"Snapchat", T:"TikTok", V:"Vinted" },
    "Sport": { A:"Athlétisme", B:"Basket", C:"Cyclisme", D:"Darts", E:"Escalade", F:"Football", G:"Golf", H:"Hockey", J:"Judo", L:"Lutte", M:"Moto-cross", N:"Natation", P:"Pétanque", R:"Rugby", S:"Surf", T:"Tennis", V:"Volley" }
  };
  return examples[category]?.[letter] || `${letter}test`;
}

function playBots(room) {
  const bots = room.players.filter(p => p.isBot);
  if (!bots.length) return;

  const roundIndex = room.roundIndex;
  const letter = room.letters[roundIndex];

  bots.forEach((bot, index) => {
    setTimeout(() => {
      const current = rooms.get(room.code);
      if (!current || current.phase !== "round" || current.roundIndex !== roundIndex) return;

      if (!bot.answers[roundIndex]) bot.answers[roundIndex] = {};
      current.categories.forEach(category => {
        bot.answers[roundIndex][category] = makeBotAnswer(category, letter);
      });
      bot.submitted = true;
      emitRoom(current);

      if (current.players.every(p => p.submitted)) endRound(current);
    }, 1800 + index * 500);
  });
}

io.on("connection", socket => {
  socket.on("room:create", ({ name, rounds, duration }, cb = () => {}) => {
    const safeName = cleanName(name);
    const safeRounds = [1, 3, 5].includes(Number(rounds)) ? Number(rounds) : 1;
    const safeDuration = [30, 60].includes(Number(duration)) ? Number(duration) : 60;
    if (!safeName) return cb({ ok: false, error: "Choisis un prénom." });

    const code = roomCode();
    const player = {
      id: id(),
      name: safeName,
      connected: true,
      socketId: socket.id,
      score: 0,
      isHost: true,
      isBot: false,
      submitted: false,
      answers: {}
    };

    const room = {
      code,
      phase: "lobby",
      players: [player],
      categories: sample(CATEGORIES, 6),
      rounds: safeRounds,
      duration: safeDuration,
      letters: sample(LETTERS, safeRounds),
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
      isBot: false,
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


  socket.on("room:leave", payload => {
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
  });

  socket.on("room:kick", ({ code, playerId, targetPlayerId }) => {
    const { room, player } = requireMember(socket, { code, playerId });
    if (!room || !player?.isHost || room.phase !== "lobby") return;

    const target = getPlayer(room, targetPlayerId);
    if (!target || target.isHost || target.id === player.id) return;

    if (target.socketId) {
      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit("room:kicked");
        targetSocket.leave(room.code);
      }
    }

    room.players = room.players.filter(p => p.id !== target.id);
    emitRoom(room);
  });

  socket.on("room:addBot", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player?.isHost || room.phase !== "lobby") return;

    if (room.players.some(p => p.isBot)) {
      return socket.emit("toast", "Le bot test est déjà dans le salon.");
    }

    const bot = {
      id: id(),
      name: "Bot Test",
      connected: true,
      socketId: null,
      score: 0,
      isHost: false,
      isBot: true,
      submitted: false,
      answers: {}
    };

    room.players.push(bot);
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
    if (room.roundIndex + 1 >= room.rounds) return;
    startRound(room);
  });

  socket.on("game:restart", payload => {
    const { room, player } = requireMember(socket, payload);
    if (!room || !player?.isHost) return;

    room.phase = "lobby";
    room.categories = sample(CATEGORIES, 6);
    room.letters = sample(LETTERS, room.rounds);
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
