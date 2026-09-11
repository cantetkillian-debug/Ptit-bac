(() => {
  "use strict";

  function shopEconomyState() {
    try {
      const live = window.PtitBacEconomy?.state?.();
      if (live) return live;
    } catch {}
    return {
      coins: typeof getCoins === "function"
        ? getCoins()
        : Number(localStorage.getItem("petitbac_walletBalance") || 0),
      lives: 5,
      maxLives: 5
    };
  }

  function renderShopV2() {
    const eco = shopEconomyState();
    const coins = Math.max(0, Number(eco.coins) || 0);
    const lives = Math.max(0, Number(eco.lives) || 0);
    const maxLives = Math.max(1, Number(eco.maxLives) || 5);

    setScreen(`
      <main class="screen shop-v2">
        <div class="shop-v2-glow glow-a"></div>
        <div class="shop-v2-glow glow-b"></div>
        <span class="shop-v2-letter letter-a">A</span>
        <span class="shop-v2-letter letter-b">B</span>
        <span class="shop-v2-crown-mark">♛</span>

        <header class="shop-v2-header">
          <button class="shop-v2-back" id="shopV2Back" type="button" aria-label="Retour">
            <img src="/back-arrow.png" alt="">
          </button>

          <h1>Boutique</h1>

          <div class="shop-v2-resources">
            <div class="shop-v2-resource">
              <img src="/coin.png" alt="">
              <strong>${coins}</strong>
            </div>
            <div class="shop-v2-resource">
              <img src="/heart.png" alt="">
              <strong>${lives}/${maxLives}</strong>
            </div>
          </div>
        </header>

        <p class="shop-v2-subtitle">
          Gagne des pièces, débloque des avantages<br>
          et profite encore plus du jeu !
        </p>

        <section class="shop-v2-reward">
          <span class="shop-v2-free">GRATUIT</span>

          <div class="shop-v2-reward-content">
            <div class="shop-v2-clapper" aria-hidden="true">🎬</div>

            <div class="shop-v2-reward-copy">
              <h2>Pub récompensée</h2>
              <p>Regarde une pub et reçois<br><strong>80 pièces.</strong></p>
              <div class="shop-v2-reward-value">
                <img src="/coin.png" alt="">
                <strong>+80</strong>
              </div>
            </div>
          </div>

          <button class="shop-v2-purple-btn" id="shopV2RewardAd" type="button">
            <span class="shop-v2-play">▶</span>
            Regarder une pub
          </button>
        </section>

        <div class="shop-v2-section-head">
          <div>
            <span class="shop-v2-section-icon">🪙</span>
            <h2>Packs de pièces</h2>
          </div>
          <p>Choisis le pack qui te convient !</p>
        </div>

        <section class="shop-v2-pack-grid">
          <article class="shop-v2-pack">
            <div class="shop-v2-coin-art small">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
            </div>
            <small>Petit pack</small>
            <h3>25 pièces</h3>
            <p>Parfait pour<br>commencer !</p>
            <button class="shop-v2-buy" type="button" data-product="coins25">0,99 €</button>
          </article>

          <article class="shop-v2-pack popular">
            <span class="shop-v2-popular">LE PLUS POPULAIRE</span>
            <div class="shop-v2-coin-art">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
            </div>
            <small>Gros pack</small>
            <h3>100 pièces</h3>
            <p>Joue encore plus<br>longtemps !</p>
            <button class="shop-v2-buy" type="button" data-product="coins100">2,99 €</button>
          </article>

          <article class="shop-v2-pack">
            <div class="shop-v2-mega-art">
              <span class="shop-v2-bag">♛</span>
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
              <img src="/coin.png" alt="">
            </div>
            <small>Méga pack</small>
            <h3>250 pièces</h3>
            <p>Pour les vrais<br>champions !</p>
            <button class="shop-v2-buy" type="button" data-product="coins250">5,99 €</button>
          </article>
        </section>

        <section class="shop-v2-noads">
          <span class="shop-v2-best">MEILLEURE OFFRE</span>
          <div class="shop-v2-noads-art" aria-hidden="true">🚫</div>

          <div class="shop-v2-noads-copy">
            <h2>Sans pub à vie</h2>
            <p>✓ Aucune publicité automatique</p>
            <p>✓ <strong>+ 500 pièces offertes</strong></p>
          </div>

          <button class="shop-v2-buy shop-v2-noads-btn" type="button" data-product="noads">
            9,99 €
          </button>
        </section>

        <footer class="shop-v2-footer">
          <img src="/ptitbac.logo.png" alt="P'tit Bac">
          <small>Version bêta</small>
        </footer>

        <div class="shop-v2-wave wave-1"></div>
        <div class="shop-v2-wave wave-2"></div>
      </main>
    `);

    document.getElementById("shopV2Back")?.addEventListener("click", () => {
      if (typeof renderHome === "function") renderHome();
    });

    document.getElementById("shopV2RewardAd")?.addEventListener("click", () => {
      toast("Les pubs récompensées seront activées dans l’application mobile.");
    });

    document.querySelectorAll(".shop-v2 [data-product]").forEach(btn => {
      btn.addEventListener("click", () => {
        toast("Les achats seront activés avec les achats intégrés Apple.");
      });
    });
  }

  window.renderShop = renderShopV2;
  try { renderShop = renderShopV2; } catch {}
})();