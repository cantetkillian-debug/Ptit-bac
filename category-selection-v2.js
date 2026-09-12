(() => {
  "use strict";

  const originalRenderCategorySelection =
    typeof renderCategorySelection === "function" ? renderCategorySelection : null;

  function categoryDecorLetters() {
    return `
      <span class="cat-v2-letter l-a">A</span>
      <span class="cat-v2-letter l-b">B</span>
      <span class="cat-v2-letter l-c">C</span>
      <span class="cat-v2-letter l-f">F</span>
      <span class="cat-v2-letter l-g">G</span>
      <span class="cat-v2-letter l-z">Z</span>
    `;
  }

  function categoryCoinPill(value, extra = "") {
    return `
      <span class="cat-v2-coin-pill ${extra}">
        <img src="/coin.png" alt="">
        <strong>${Number(value || 0)}</strong>
      </span>
    `;
  }

  function categoryCard(category, index) {
    return `
      <article class="category-pick-card cat-v2-card" style="--pick-index:${index}">
        <span class="category-pick-icon cat-v2-icon">${categoryIcon(category)}</span>
        <strong>${escapeHtml(category)}</strong>
      </article>
    `;
  }

  function renderCategorySelectionV2() {
    if (!session?.state) {
      if (originalRenderCategorySelection) return originalRenderCategorySelection();
      return;
    }

    clearInterval(session.timerHandle);

    const state = session.state;
    const user = me();
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const categoryRerollCost = Number(state.categoryRerollCost || 10);
    const balance = getCoins();
    const host = !!user?.isHost;
    const insufficient = balance < categoryRerollCost;
    const categoryCountClass =
      categories.length >= 9 ? "cat-v2-many" :
      categories.length >= 7 ? "cat-v2-medium" : "cat-v2-normal";

    setScreen(`
      <main class="screen category-pick-screen cat-v2 ${categoryCountClass}">
        <div class="cat-v2-glow glow-a"></div>
        <div class="cat-v2-glow glow-b"></div>
        ${categoryDecorLetters()}

        <header class="category-pick-header cat-v2-top">
          ${host
            ? `<button class="pregame-return-btn cat-v2-back" id="returnLobbyCategoriesBtn" type="button" aria-label="Retour au salon">
                <img src="/lobby-exit.png" alt="">
              </button>`
            : `<span class="pregame-return-spacer cat-v2-back-spacer"></span>`}

          ${categoryCoinPill(balance, "cat-v2-balance")}
        </header>

        <section class="category-pick-copy cat-v2-copy">
          <span class="cat-v2-kicker">SÉLECTION DES CATÉGORIES</span>
          <h1>Voici votre tirage !</h1>
          <span class="cat-v2-title-line"></span>
          <p>${categories.length} catégories <b>•</b> Niveau ${difficultyLabel(state.categoryDifficulty)}</p>
        </section>

        <section class="category-pick-grid cat-v2-grid" aria-label="Catégories tirées">
          ${categories.map(categoryCard).join("")}
        </section>

        ${host ? `
          <section class="category-pick-actions cat-v2-actions">
            <button class="category-reroll-btn cat-v2-reroll" id="rerollCategoriesBtn" type="button" ${insufficient ? "disabled" : ""}>
              <span class="cat-v2-reroll-title">
                <b class="cat-v2-reroll-icon">↻</b>
                Relancer le tirage
              </span>
              ${categoryCoinPill(categoryRerollCost, "cat-v2-cost")}
              <small>Obtenez ${categories.length} nouvelles catégories aléatoires.</small>
            </button>

            ${insufficient
              ? `<p class="letter-cost-note cat-v2-cost-note">
                  Il te faut ${categoryRerollCost} pièces pour relancer les catégories.
                </p>`
              : ""}

            <button class="btn btn-primary category-confirm-btn cat-v2-confirm" id="confirmCategoriesBtn" type="button">
              Continuer vers la lettre <span>→</span>
            </button>
          </section>
        ` : `
          <section class="cat-v2-wait">
            <span class="spinner small-spinner"></span>
            <strong>En attente de l’hôte…</strong>
            <small>L’hôte choisit quand continuer vers la lettre.</small>
          </section>
        `}

        <footer class="ptb-shared-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    const backBtn = document.getElementById("returnLobbyCategoriesBtn");
    if (backBtn) {
      backBtn.onclick = () => {
        if (!confirm("Retourner au salon ? Les 5 pièces de participation seront remboursées.")) return;
        backBtn.disabled = true;
        socket.emit("game:returnLobby", {
          code: state.code,
          playerId: session.playerId
        });
      };
    }

    if (host) {
      const rerollBtn = document.getElementById("rerollCategoriesBtn");
      const confirmBtn = document.getElementById("confirmCategoriesBtn");

      if (rerollBtn) {
        rerollBtn.onclick = () => {
          if (rerollBtn.disabled) return;
          rerollBtn.classList.add("is-loading");
          rerollBtn.disabled = true;
          if (confirmBtn) confirmBtn.disabled = true;

          socket.emit("game:rerollCategories", {
            code: state.code,
            playerId: session.playerId
          });
        };
      }

      if (confirmBtn) {
        confirmBtn.onclick = () => {
          confirmBtn.disabled = true;
          if (rerollBtn) rerollBtn.disabled = true;
          socket.emit("game:confirmCategories", {
            code: state.code,
            playerId: session.playerId
          });
        };
      }
    }
  }

  // Remplace uniquement l'écran de sélection des catégories.
  // Le reste de la logique de partie reste dans app.js.
  window.renderCategorySelection = renderCategorySelectionV2;

  // Dans les scripts classiques, le binding global et window partagent la fonction.
  // Cette affectation couvre aussi les navigateurs qui gardent la référence globale.
  try {
    renderCategorySelection = renderCategorySelectionV2;
  } catch (_) {}
})();
