(() => {
  "use strict";

  function cleanLetterScreen() {
    const screen = document.querySelector(".letter-v2-screen");
    if (!screen) return;

    // La flèche au-dessus de la roue est supprimée complètement.
    screen.querySelectorAll(".letter-v2-pointer").forEach(el => el.remove());

    // Supprime le statut résiduel "Lettre tirée !" quelle que soit
    // l'ancienne version du composant qui l'a créé.
    const walker = document.createTreeWalker(
      screen,
      NodeFilter.SHOW_TEXT
    );

    const toRemove = new Set();
    let node;

    while ((node = walker.nextNode())) {
      const text = String(node.nodeValue || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("fr-FR");

      if (
        text === "lettre tirée !" ||
        text === "lettre tirée!" ||
        text === "lettre tiree !" ||
        text === "lettre tiree!"
      ) {
        const parent = node.parentElement;
        if (parent) toRemove.add(parent);
      }
    }

    toRemove.forEach(el => el.remove());
  }

  // Nettoyage immédiat + après chaque nouveau rendu de l'application.
  cleanLetterScreen();

  const root = document.getElementById("app");
  if (root) {
    new MutationObserver(cleanLetterScreen).observe(root, {
      childList: true,
      subtree: true
    });
  }
})();
