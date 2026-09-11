(() => {
  "use strict";

  const PROFILE_AVATARS_V8 = [
    "🧠","🐼","🦊","🐯","🐸",
    "🦁","🐨","🐙","🦄","🤖",
    "😎","⭐","🎮","⚽"
  ];

  function publicId() {
    const token = String(localStorage.getItem("petitbac_walletToken") || "");
    return token ? `#${token.slice(0,6).toUpperCase()}` : "#------";
  }

  function backButtonMarkup(id) {
    return `
      <button id="${id}" class="profile-v2-back" type="button" aria-label="Retour">
        <img src="/back-arrow.png" alt="">
      </button>
    `;
  }

  function renderProfileV2() {
    if (session?.state) return render();

    const p = getProfile();

    setScreen(`
      <main class="screen profile-v2-final">
        <div class="profile-v2-bg-crown crown-a">♛</div>
        <div class="profile-v2-bg-crown crown-b">♛</div>
        <div class="profile-v2-bg-crown crown-c">♛</div>
        <div class="profile-v2-bg-crown crown-d">♛</div>
        <i class="profile-v2-spark spark-a"></i>
        <i class="profile-v2-spark spark-b"></i>

        <header class="profile-v2-top">
          ${backButtonMarkup("profileV2Back")}
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
              <small>Pseudo et avatar</small>
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

        <div class="profile-v2-logout-row">
          <button id="profileV2Logout" class="profile-v2-logout" type="button">
            <span>↪</span>
            Se déconnecter
          </button>
        </div>

        <footer class="profile-v2-footer">
          <div class="profile-v2-footer-crown">♛</div>
          <strong>P’tit Bac</strong>
          <small>Version bêta</small>
        </footer>

        <div class="profile-v2-wave wave-left"></div>
        <div class="profile-v2-wave wave-right"></div>
      </main>
    `);

    // Retour = exactement l'écran précédent dans ce parcours : l'accueil.
    document.getElementById("profileV2Back")?.addEventListener("click", () => window.renderHome());

    document.getElementById("profileV2EditRow")?.addEventListener("click", renderProfileEditV8);

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

  function renderProfileEditV8() {
    if (session?.state) return render();

    const current = getProfile();
    let selectedAvatar = current.icon || "🧠";

    setScreen(`
      <main class="screen profile-edit-v8">
        <div class="profile-edit-v8-glow glow-a"></div>
        <div class="profile-edit-v8-glow glow-b"></div>

        <header class="profile-edit-v8-top">
          ${backButtonMarkup("profileEditBack")}
          <div class="profile-edit-v8-heading">
            <h1>Modifier mon <span>profil</span></h1>
            <p>Personnalise ton profil comme tu le souhaites !</p>
          </div>
          <span class="profile-v2-top-spacer" aria-hidden="true"></span>
        </header>

        <section class="profile-edit-v8-card profile-edit-v8-name-card">
          <div class="profile-edit-v8-card-title">
            <div class="profile-edit-v8-section-icon">T</div>
            <strong>Ton pseudo</strong>
            <span id="profileEditCount">${String(current.name || "").length}/16</span>
          </div>

          <div class="profile-edit-v8-input-row">
            <input
              id="profileEditName"
              type="text"
              maxlength="16"
              autocomplete="nickname"
              value="${escapeHtml(current.name || "")}"
              placeholder="Ton pseudo"
              aria-label="Ton pseudo"
            >
            <button id="profileEditClear" type="button" aria-label="Effacer le pseudo">×</button>
          </div>

          <small>Ton pseudo sera visible par tous les joueurs.</small>
        </section>

        <section class="profile-edit-v8-card profile-edit-v8-avatar-card">
          <div class="profile-edit-v8-card-title avatars-title">
            <div class="profile-edit-v8-section-icon">👤</div>
            <strong>Photo de profil</strong>
            <span>Choisis un avatar</span>
          </div>

          <div class="profile-edit-v8-grid" id="profileEditGrid">
            ${PROFILE_AVATARS_V8.map(icon => `
              <button
                type="button"
                class="profile-edit-v8-avatar ${icon === selectedAvatar ? "is-selected" : ""}"
                data-avatar="${escapeHtml(icon)}"
                aria-label="Choisir ${escapeHtml(icon)}"
              >
                <span>${escapeHtml(icon)}</span>
                <i>✓</i>
              </button>
            `).join("")}

            <button type="button" class="profile-edit-v8-avatar is-coming" disabled aria-label="Plus d'avatars à venir">
              <span>＋</span>
              <small>Plus à venir</small>
            </button>
          </div>
        </section>

        <div class="profile-edit-v8-actions">
          <button id="profileEditCancel" class="profile-edit-v8-cancel" type="button">Annuler</button>
          <button id="profileEditSave" class="profile-edit-v8-save" type="button">
            <span>▣</span>
            Enregistrer
          </button>
        </div>
      </main>
    `);

    const input = document.getElementById("profileEditName");
    const count = document.getElementById("profileEditCount");
    const grid = document.getElementById("profileEditGrid");

    const updateCounter = () => {
      const value = String(input?.value || "").slice(0,16);
      if (input && input.value !== value) input.value = value;
      if (count) count.textContent = `${value.length}/16`;
    };

    input?.addEventListener("input", updateCounter);

    document.getElementById("profileEditClear")?.addEventListener("click", () => {
      if (!input) return;
      input.value = "";
      input.focus();
      updateCounter();
    });

    grid?.addEventListener("click", event => {
      const btn = event.target.closest("[data-avatar]");
      if (!btn) return;

      selectedAvatar = btn.dataset.avatar || selectedAvatar;
      grid.querySelectorAll("[data-avatar]").forEach(el => {
        el.classList.toggle("is-selected", el === btn);
      });
    });

    // Important : ici la flèche revient au profil, car c'est l'écran juste avant.
    document.getElementById("profileEditBack")?.addEventListener("click", renderProfileV2);
    document.getElementById("profileEditCancel")?.addEventListener("click", renderProfileV2);

    document.getElementById("profileEditSave")?.addEventListener("click", () => {
      const name = String(input?.value || "").trim();

      if (!name) {
        toast("Choisis un pseudo.");
        input?.focus();
        return;
      }

      if (name.length > 16) {
        toast("Le pseudo doit faire 16 caractères maximum.");
        input?.focus();
        return;
      }

      saveProfile(name, selectedAvatar);
      toast("Profil enregistré !");
      renderProfileV2();
    });

    input?.focus({ preventScroll:true });
  }

  window.renderProfile = renderProfileV2;
  window.renderProfileEdit = renderProfileEditV8;

  try { renderProfile = renderProfileV2; } catch {}
})();
