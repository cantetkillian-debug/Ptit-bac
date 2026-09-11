(() => {
  "use strict";

  const previousHome = window.renderHome;

  function applyFinalHomeTweaks() {
    const home = document.querySelector(".home-plaque-v1");
    if (!home) return;

    const footerText = home.querySelector(".home-plaque-footer p");
    if (footerText) footerText.textContent = "Version bêta";

    // Les sous-textes des raccourcis sont volontairement masqués en V2.
    home.querySelectorAll(".home-plaque-shortcuts small").forEach(el => {
      el.setAttribute("aria-hidden", "true");
    });
  }

  function renderHomeV2() {
    if (typeof previousHome === "function") {
      previousHome();
      applyFinalHomeTweaks();
      requestAnimationFrame(applyFinalHomeTweaks);
    }
  }

  window.renderHome = renderHomeV2;
  try { renderHome = renderHomeV2; } catch {}

  applyFinalHomeTweaks();
})();
