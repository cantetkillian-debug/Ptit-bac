(() => {
  "use strict";

  function isImageAvatar(value) {
    return typeof value === "string" &&
      /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
  }

  // Le serveur est déjà à 0 pièce via economy-hook.js.
  // On retire ici le dernier blocage client basé sur GAME_COST = 5.
  const freeGameCheck = () => true;
  window.canAffordGame = freeGameCheck;
  try { canAffordGame = freeGameCheck; } catch {}

  // Remplace le rendu historique des avatars :
  // une image importée est maintenant une vraie balise <img>,
  // donc elle est visible par tous les joueurs dans toutes les phases.
  const sharedAvatarMarkup = (player, index = 0, extra = "") => {
    const raw = String(player?.avatar || "");
    const safeExtra = String(extra || "").replace(/[^a-zA-Z0-9 _-]/g, "");

    if (isImageAvatar(raw)) {
      return `
        <div class="avatar avatar-${index % 6} ptb-avatar-photo ${safeExtra}">
          <img src="${raw}" alt="" draggable="false">
        </div>`;
    }

    const fallback = raw || String(player?.name || "?").charAt(0).toUpperCase();
    return `
      <div class="avatar avatar-${index % 6} ${raw ? "avatar-emoji" : ""} ${safeExtra}">
        ${typeof escapeHtml === "function" ? escapeHtml(fallback) : fallback}
      </div>`;
  };

  window.avatarMarkup = sharedAvatarMarkup;
  try { avatarMarkup = sharedAvatarMarkup; } catch {}

  // Aide aussi les composants qui veulent tester explicitement un avatar image.
  window.PtitBacAvatarFix = {
    isImageAvatar,
    avatarMarkup: sharedAvatarMarkup
  };
})();
