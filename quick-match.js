"use strict";
module.exports = function installQuickMatch({io, eligible, match, admit = () => {}, leave = () => {}, delayMs = 8000}) {
  const entries = new Map(), tokenOwners = new Map(), groups = new Set();
  function remove(entry) {
    entries.delete(entry.socket.id);
    if (tokenOwners.get(entry.token) === entry.socket.id) tokenOwners.delete(entry.token);
    entry.group?.entries.delete(entry);
  }
  function update(group) {
    const count = group.entries.size;
    if (count < 2) { clearTimeout(group.timer); group.timer = null; group.deadline = null; }
    if (!count) { groups.delete(group); return; }
    if (count >= 2 && !group.timer && !group.matching) {
      group.deadline = Date.now() + delayMs;
      group.timer = setTimeout(() => flush(group), delayMs); group.timer.unref?.();
    }
    for (const entry of group.entries) entry.socket.emit("quick:queued", {count, deadline:group.deadline});
  }
  async function flush(group) {
    group.timer = null; group.deadline = null; group.matching = true;
    const selected = [...group.entries];
    try { await match(selected); }
    catch (err) { for (const e of selected) e.socket.emit("quick:error", {error:err.message || "Recherche interrompue."}); }
    finally { for (const e of selected) remove(e); groups.delete(group); }
  }
  function cancel(socket) {
    const entry = entries.get(socket.id);
    if (!entry) return true;
    if (entry.group?.matching) return false;
    const group = entry.group;
    remove(entry);
    if (group) { leave(entry); update(group); }
    return true;
  }
  io.on("connection", socket => {
    socket.on("quick:join", async (profile = {}, cb = () => {}) => {
      if (entries.has(socket.id)) return cb({ok:true, queued:true});
      const token = String(profile.walletToken || socket.data.walletToken || "");
      if (!/^[a-f0-9]{48}$/i.test(token)) return cb({ok:false,error:"Attends le chargement du profil puis réessaie."});
      if (tokenOwners.has(token)) return cb({ok:false,error:"Ce profil recherche déjà une partie sur une autre connexion."});
      const entry = {socket, profile, token}; entries.set(socket.id, entry); tokenOwners.set(token, socket.id);
      try {
        entry.profile = await eligible(socket, profile);
        if (entries.get(socket.id) !== entry || !socket.connected) return cb({ok:false,cancelled:true});
        const group = [...groups].find(g => !g.matching && g.entries.size < 6) || {entries:new Set(),timer:null,deadline:null};
        const result = admit(entry, [...group.entries]);
        entry.group = group; group.entries.add(entry); groups.add(group);
        cb({ok:true,queued:true});
        if (result) socket.emit("quick:matched", result);
        update(group);
      } catch (err) { remove(entry); cb({ok:false,error:err.message || "Recherche indisponible."}); }
    });
    socket.on("quick:cancel", (_payload, cb = () => {}) => cb({ok:cancel(socket)}));
    socket.on("disconnect", () => cancel(socket));
  });
  return {cancel, close() { for (const g of groups) clearTimeout(g.timer); groups.clear(); entries.clear(); tokenOwners.clear(); }};
};
