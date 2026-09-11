(() => {
  "use strict";

  const legacyProfile = window.renderProfile;

  function publicId() {
    const token = String(localStorage.getItem("petitbac_walletToken") || "");
    return token ? `#${token.slice(0,6).toUpperCase()}` : "#------";
  }

  function renderProfileV2() {
    if (session?.state) return render();

    const p = getProfile();

    setScreen(`
      <main class="screen profile-v2-final">
        <div class="profile-v2-bg-crown crown-a">♛</div>
        <div class="profile-v2-bg-crown crown-b">♛</div>
        <div class="profile-v2-bg-crown crown-c">♛</div>
        <i class="profile-v2-spark spark-a"></i>
        <i class="profile-v2-spark spark-b"></i>

        <header class="profile-v2-top">
          <button id="profileV2Back" class="profile-v2-topbtn" type="button" aria-label="Retour">‹</button>
          <h1>Mon profil</h1>
          <span class="profile-v2-top-spacer" aria-hidden="true"></span>
        </header>

        <section class="profile-v2-identity">
          <div class="profile-v2-avatar">
            <span>${escapeHtml(p.icon || "🧠")}</span>
          </div>

          <h2>${escapeHtml(p.name || "Joueur")}</h2>

          <button id="profileV2CopyId" class="profile-v2-id" type="button" aria-label="Copier mon identifiant">
            ${publicId()} <span>▣</span>
          </button>
        </section>

        <nav class="profile-v2-menu">
          <button id="profileV2EditRow" type="button">
            <span class="profile-v2-menu-icon">👤</span>
            <span class="profile-v2-menu-copy">
              <strong>Modifier mon profil</strong>
              <small>Pseudo, avatar, bio...</small>
            </span>
            <b>›</b>
          </button>

          <button data-nav="friends" type="button">
            <span class="profile-v2-menu-icon">👥</span>
            <span class="profile-v2-menu-copy">
              <strong>Mes amis</strong>
              <small>Voir et gérer mes amis</small>
            </span>
            <b>›</b>
          </button>

          <button id="profileV2Settings" type="button">
            <span class="profile-v2-menu-icon">⚙</span>
            <span class="profile-v2-menu-copy">
              <strong>Paramètres</strong>
              <small>Son, notifications, confidentialité...</small>
            </span>
            <b>›</b>
          </button>
        </nav>

        <button id="profileV2Logout" class="profile-v2-logout" type="button">
          <span>↪</span>
          Se déconnecter
        </button>

        <footer class="profile-v2-footer">
          <strong>P’tit Bac</strong>
          <small>Version bêta</small>
        </footer>

        <div class="profile-v2-wave wave-left"></div>
        <div class="profile-v2-wave wave-right"></div>
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

    document.getElementById("profileV2Settings")?.addEventListener("click", () => {
      toast("Paramètres bientôt disponibles.");
    });

    document.getElementById("profileV2Logout")?.addEventListener("click", () => {
      toast("La déconnexion sera activée avec les comptes.");
    });
  }

  window.renderProfile = renderProfileV2;
  try { renderProfile = renderProfileV2; } catch {}
})();
