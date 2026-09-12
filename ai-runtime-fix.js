"use strict";

/**
 * P'tit Bac — Hotfix IA V1
 *
 * Ce fichier est préchargé AVANT server.js.
 * server.js lit ses réglages IA au chargement, donc on corrige ici les valeurs
 * trop agressives qui provoquaient "This operation was aborted" sur Render.
 *
 * Aucun secret / aucune clé API n'est stocké ici.
 */

function ensureMinimumMs(name, minimum) {
  const current = Number(process.env[name]);
  if (!Number.isFinite(current) || current < minimum) {
    process.env[name] = String(minimum);
  }
}

// L'ancien timeout bots était de 9 s : trop court pour Responses API sur Render.
ensureMinimumMs("BOT_AI_TIMEOUT_MS", 30000);

// La validation principale peut inclure plusieurs réponses structurées.
// 60 s évite les faux échecs tout en gardant une limite nette.
ensureMinimumMs("AUTO_VALIDATION_TIMEOUT_MS", 60000);

// Des lots plus petits réduisent le risque qu'une seule réponse structurée
// prenne trop longtemps ou dépasse la fenêtre de traitement.
const currentBatchSize = Number(process.env.OPENAI_VALIDATION_BATCH_SIZE);
if (!Number.isFinite(currentBatchSize) || currentBatchSize <= 0 || currentBatchSize > 15) {
  process.env.OPENAI_VALIDATION_BATCH_SIZE = "15";
}

// Laisse les modèles configurables depuis Render.
// Ne remplace pas OPENAI_API_KEY et ne l'affiche jamais dans les logs.
console.log(
  `[IA hotfix] timeouts: bots=${process.env.BOT_AI_TIMEOUT_MS}ms, ` +
  `validation=${process.env.AUTO_VALIDATION_TIMEOUT_MS}ms, ` +
  `batch=${process.env.OPENAI_VALIDATION_BATCH_SIZE}`
);
