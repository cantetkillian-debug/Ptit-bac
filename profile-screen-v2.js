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

  function profileMenuImage(src) {
    return `<img src="${src}" alt="" aria-hidden="true" style="width:38px;height:38px;object-fit:contain;display:block;">`;
  }

  function isPhotoAvatar(value) {
    return !!window.PtitBacProfilePhoto?.isImageAvatar?.(value);
  }

  function avatarVisual(value, className = "") {
    if (isPhotoAvatar(value)) {
      return `<img src="${value}" class="${className}" alt="" draggable="false">`;
    }
    return `<span>${escapeHtml(value || "🧠")}</span>`;
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
            ${avatarVisual(p.icon || "🧠", "profile-v2-avatar-photo")}
          </div>

          <h2>${escapeHtml(p.name || "Joueur")}</h2>

          <button id="profileV2CopyId" class="profile-v2-id" type="button" aria-label="Copier mon identifiant">
            ${publicId()}
          </button>
        </section>

        <nav class="profile-v2-menu">
          <button id="profileV2EditRow" type="button">
            <span class="profile-v2-menu-icon">${profileMenuImage("/profile-icon.png")}</span>
            <span class="profile-v2-menu-copy">
              <strong>Modifier mon profil</strong>
              <small>Pseudo et avatar</small>
            </span>
            <b>›</b>
          </button>

          <button data-nav="friends" type="button">
            <span class="profile-v2-menu-icon">${profileMenuImage("/friends.png")}</span>
            <span class="profile-v2-menu-copy">
              <strong>Mes amis</strong>
              <small>Voir et gérer mes amis</small>
            </span>
            <b>›</b>
          </button>

          <button id="profileV2Settings" type="button">
            <span class="profile-v2-menu-icon">${profileMenuImage("/settings.png")}</span>
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
          <img src="/ptitbac.logo.png" alt="P’tit Bac" class="profile-v2-footer-logo">
          <small>Version bêta</small>
        </footer>

        <div class="profile-v2-wave wave-left"></div>
        <div class="profile-v2-wave wave-right"></div>
      </main>
    `);

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

            <button
              type="button"
              id="profileEditImport"
              class="profile-edit-v8-avatar profile-edit-v8-import ${isPhotoAvatar(selectedAvatar) ? "is-selected" : ""}"
              aria-label="Importer une photo"
            >
              <span class="profile-edit-v8-import-preview">
                ${isPhotoAvatar(selectedAvatar)
                  ? `<img src="${selectedAvatar}" alt="" draggable="false">`
                  : `<span class="profile-edit-v8-camera" aria-hidden="true">▧</span>`}
              </span>
              <small>Importer</small>
              <i>✓</i>
            </button>

            <input id="profileEditPhotoInput" class="profile-edit-v8-file-input" type="file" accept="image/png,image/jpeg,image/webp" tabindex="-1">
          </div>
        </section>

        <div class="profile-edit-v8-actions">
          <button id="profileEditCancel" class="profile-edit-v8-cancel" type="button">Annuler</button>
          <button id="profileEditSave" class="profile-edit-v8-save" type="button">
            Enregistrer
          </button>
        </div>
      </main>
    `);

    const input = document.getElementById("profileEditName");
    const count = document.getElementById("profileEditCount");
    const grid = document.getElementById("profileEditGrid");
    const importButton = document.getElementById("profileEditImport");
    const photoInput = document.getElementById("profileEditPhotoInput");

    let importedPhoto = isPhotoAvatar(selectedAvatar) ? selectedAvatar : "";

    const updateCounter = () => {
      const value = String(input?.value || "").slice(0,16);
      if (input && input.value !== value) input.value = value;
      if (count) count.textContent = `${value.length}/16`;
    };

    const refreshSelection = () => {
      grid?.querySelectorAll("[data-avatar]").forEach(el => {
        const selected = el.dataset.avatar === selectedAvatar;
        el.classList.toggle("is-selected", selected);
      });

      if (importButton) {
        const selected = isPhotoAvatar(selectedAvatar);
        importButton.classList.toggle("is-selected", selected);

        const preview = importButton.querySelector(".profile-edit-v8-import-preview");
        if (preview) {
          preview.innerHTML = importedPhoto
            ? `<img src="${importedPhoto}" alt="" draggable="false">`
            : `<span class="profile-edit-v8-camera" aria-hidden="true">▧</span>`;
        }
      }
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
      window.PtitBacProfilePhoto?.markEmoji?.(selectedAvatar);
      refreshSelection();
    });

    importButton?.addEventListener("click", () => {
      // Si une photo a déjà été importée, un premier clic la sélectionne.
      // Un nouveau choix reste possible via le sélecteur de fichiers.
      if (importedPhoto) {
        selectedAvatar = importedPhoto;
        refreshSelection();
      }
      photoInput?.click();
    });

    photoInput?.addEventListener("change", async () => {
      const file = photoInput.files?.[0];
      if (!file) return;

      importButton?.classList.add("is-loading");

      try {
        const dataUrl = await window.PtitBacProfilePhoto.fileToProcessedDataUrl(file);
        importedPhoto = dataUrl;
        selectedAvatar = dataUrl;
        refreshSelection();
        toast("Photo prête à être enregistrée.");
      } catch (err) {
        toast(err?.message || "Impossible d'importer cette photo.");
      } finally {
        importButton?.classList.remove("is-loading");
        photoInput.value = "";
      }
    });

    document.getElementById("profileEditBack")?.addEventListener("click", renderProfileV2);
    document.getElementById("profileEditCancel")?.addEventListener("click", renderProfileV2);

    document.getElementById("profileEditSave")?.addEventListener("click", async () => {
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

      try {
        if (isPhotoAvatar(selectedAvatar)) {
          await window.PtitBacProfilePhoto?.savePhoto?.(selectedAvatar);
        } else {
          window.PtitBacProfilePhoto?.markEmoji?.(selectedAvatar);
        }

        saveProfile(name, selectedAvatar);
        toast("Profil enregistré !");
        renderProfileV2();
      } catch {
        toast("Impossible d'enregistrer la photo.");
      }
    });

    // Important : aucun focus automatique ici.
    // Le clavier s'ouvre uniquement après un appui du joueur dans le champ pseudo.
  }

  window.renderProfile = renderProfileV2;
  window.renderProfileEdit = renderProfileEditV8;

  try { renderProfile = renderProfileV2; } catch {}
})();
