"use strict";
// Reward eligibility is decided by the server-created room, never a client flag.
function calculateRewards(room) {
  const rewards = Object.fromEntries(room.players.map(p => [p.id, 0]));
  if (room.mode !== "quick" || !room.entryDebited || room.phase !== "finished" ||
      room.roundIndex + 1 !== room.rounds || room.players.some(p => p.isBot)) return rewards;
  const players = room.players.filter(p => p.walletToken).sort((a,b) => b.score - a.score);
  if (players.length < 2) return rewards;
  const paid = new Set(room.paidPlayerIds || []);
  let rank = 1;
  players.forEach((player, index) => {
    if (index && player.score !== players[index - 1].score) rank = index + 1;
    if (paid.has(player.id)) rewards[player.id] = [60,40,25][rank-1] ?? 10;
  });
  return rewards;
}
module.exports = { calculateRewards };
