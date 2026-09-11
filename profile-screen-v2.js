(() => {
  "use strict";

  const legacyProfile = window.renderProfile;

  function getEco() {
    try {
      const state = window.PtitBacEconomy?.state?.();
      if (state) return state;
    } catch {}
    return {
      coins: Number(localStorage.getItem("petitbac_walletBalance") || 0),
      lives: 5,
      maxLives: 5
    };
  }

  function getStats() {
    try {
      const raw = JSON.parse(localStorage.getItem("ptitbac_profile_stats") || "{}");
      const played = Math.max(0, Math.floor(Number(raw.played) || 0));
      const wins = Math.max(0, Math.min(played, Math.floor(Number(raw.wins) || 0)));
      return {
        played,
        wins,
        rate: played ? Math.round((wins / played) * 100) : 0
      };
    } catch {
      return { played:0, wins:0, rate:0 };
    }
  }

  function getProgress() {
    const level = Math.max(1, Math.floor(Number(localStorage.getItem("ptitbac_profile_level")) || 1));
    const xp = Math.max(0, Math.floor(Number(localStorage.getItem("ptitbac_profile_xp")) || 0));
    const max = 500;
    return {
      level,
      xp: Math.min(xp, max),
      max,
      pct: Math.min(100, Math.round((Math.min(xp, max) / max) * 100))
    };
  }

  function publicId() {
    const token = String(localStorage.getItem("petitbac_walletToken") || "");
    return token ? `#${token.slice(0,6).toUpperCase()}` : "#------";
  }

  function renderProfileV2() {
    if (session?.state) return render();

    const p = getProfile();
    const eco = getEco();
    const stats = getStats();
    const prog = getProgress();

    const coins = Math.max(0, Math.floor(Number(eco.coins ?? getCoins()) || 0));
    const lives = Math.max(0, Math.floor(Number(eco.lives) || 0));
    const maxLives = Math.max(1, Math.floor(Number(eco.maxLives) || 5));
    const friends = Math.max(0, Math.floor(Number(localStorage.getItem("ptitbac_friends_count")) || 0));

    setScreen(`
      <main class="screen profile-v2-final">
        <header class="profile-v2-top">
          <button id="profileV2Back" class="profile-v2-topbtn" type="button" aria-label="Retour">‹</button>
          <h1>Mon profil</h1>
          <button id="profileV2EditTop" class="profile-v2-topbtn edit" type="button" aria-label="Modifier">✎</button>
        </header>

        <section class="profile-v2-hero">
          <div class="profile-v2-resource">
            <div class="profile-v2-pill">
              <img src="/coin.png" alt="">
              <strong>${coins}</strong>
            </div>
            <small>Mes pièces</small>
          </div>

          <div class="profile-v2-user">
            <div class="profile-v2-avatar">
              <span>${escapeHtml(p.icon || "🧠")}</span>
              <i></i>
            </div>
            <h2>${escapeHtml(p.name || "Joueur")}</h2>
            <button id="profileV2CopyId" class="profile-v2-id" type="button">
              ${publicId()} <span>▣</span>
            </button>
            <div class="profile-v2-online"><i></i>En ligne</div>
          </div>

          <div class="profile-v2-resource">
            <div class="profile-v2-pill">
              <img src="/heart.png" alt="">
              <strong>${lives}/${maxLives}</strong>
            </div>
            <small>${lives >= maxLives ? "Vies au maximum" : "Vies disponibles"}</small>
          </div>
        </section>

        <section class="profile-v2-level">
          <div class="profile-v2-level-name">
            <span>♛</span>
            <strong>Niv. ${prog.level}</strong>
          </div>
          <div class="profile-v2-bar"><i style="width:${prog.pct}%"></i></div>
          <strong class="profile-v2-xp">${prog.xp} / ${prog.max} XP</strong>
        </section>

        <section class="profile-v2-stats">
          <article><span>🎮</span><strong>${stats.played}</strong><small>Parties jouées</small></article>
          <article><span>🏆</span><strong>${stats.wins}</strong><small>Victoires</small></article>
          <article><span>◎</span><strong>${stats.rate}%</strong><small>Taux de victoire</small></article>
          <article><span>👥</span><strong>${friends}</strong><small>Amis</small></article>
        </section>

        <nav class="profile-v2-menu">
          <button id="profileV2EditRow" type="button"><span>👤</span><strong>Modifier mon profil</strong><b>›</b></button>
          <button id="profileV2Stats" type="button"><span>▥</span><strong>Mes statistiques</strong><b>›</b></button>
          <button data-nav="friends" type="button"><span>👥</span><strong>Mes amis</strong><b>›</b></button>
          <button id="profileV2Rewards" type="button"><span>🎁</span><strong>Mes récompenses</strong><b>›</b></button>
          <button id="profileV2Settings" type="button"><span>⚙</span><strong>Paramètres</strong><b>›</b></button>
        </nav>

        <button id="profileV2Logout" class="profile-v2-logout" type="button">
          <span>↪</span> Se déconnecter
        </button>
      </main>
    `);

    document.getElementById("profileV2Back")?.addEventListener("click", () => window.renderHome());

    const editProfile = () => {
      if (typeof legacyProfile === "function" && legacyProfile !== renderProfileV2) {
        legacyProfile();
      } else {
        toast("Modification du profil bientôt disponible.");
      }
    };

    document.getElementById("profileV2EditTop")?.addEventListener("click", editProfile);
    document.getElementById("profileV2EditRow")?.addEventListener("click", editProfile);

    document.getElementById("profileV2CopyId")?.addEventListener("click", async () => {
      const id = publicId();
      try {
        await navigator.clipboard.writeText(id);
        toast("ID copié !");
      } catch {
        toast(id);
      }
    });

    document.getElementById("profileV2Stats")?.addEventListener("click", () => toast("Statistiques bientôt disponibles."));
    document.getElementById("profileV2Rewards")?.addEventListener("click", () => toast("Récompenses bientôt disponibles."));
    document.getElementById("profileV2Settings")?.addEventListener("click", () => toast("Paramètres bientôt disponibles."));
    document.getElementById("profileV2Logout")?.addEventListener("click", () => toast("La déconnexion sera activée avec les comptes."));
  }

  window.renderProfile = renderProfileV2;
  try { renderProfile = renderProfileV2; } catch {}
})();
