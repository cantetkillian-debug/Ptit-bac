# P’tit Bac — portefeuille et parties rapides 1.45.0

Jeu multijoueur web, base pour une future application mobile.

## Démarrage

Node.js 22, puis :

```sh
npm ci
npm test
npm start
```

En développement : `npm run dev`. Les tests nécessitent les dépendances de développement.

Sur Render : commande de build `npm ci`, commande de démarrage `npm start`, contrôle de santé `/health`. Le fichier render.yaml décrit ces valeurs ; pour un service existant configuré manuellement, modifier ses paramètres dans Render si nécessaire.

## Configuration existante

- `DATABASE_URL` : PostgreSQL, nécessaire aux parties rapides avec vies, aux amis et au chat.
- `OPENAI_API_KEY` : validation sémantique ; `OPENAI_BOT_API_KEY` facultative pour une clé distincte.
- `OPENAI_VALIDATION_MODEL`, `OPENAI_VALIDATION_REVIEW_MODEL`, `OPENAI_BOT_MODEL` : modèles configurables.
- `BOT_AI_ENABLED=false` : réponses locales des bots.
- `PTITBAC_ADMIN_CODE` : accès administrateur selon le mécanisme existant.
- `PTITBAC_WALLET_FILE` : chemin du repli JSON des portefeuilles.
- `PORT` : 3000 par défaut.
- `SOCKET_CORS_ORIGIN` : origines autorisées, séparées par des virgules, si nécessaire.

Sans PostgreSQL, les salons privés peuvent démarrer. Les parties rapides sont refusées : le JSON local ne remplace pas le stockage des vies. La correction sémantique dépend toujours de la configuration IA.

Les secrets doivent rester dans les variables d’environnement. Les données existantes n’ont pas été migrées par cette livraison.

## Organisation

- `server.js` : démarrage, règles du jeu, économie et correction des réponses. Les anciens correctifs économie/salon y sont intégrés.
- `friends-hook.js`, `chat-hook.js`, `player-report-hook.js`, `admin-hook.js` : modules enregistrés explicitement auprès de Socket.IO.
- `friend-code-v2-hook.js` : migration PostgreSQL existante des codes amis.
- `ai-runtime-fix.js` : réglages des délais IA, chargé explicitement par le serveur.
- `app.js` : état client, fonctions partagées et rendu de base.
- Scripts d’écrans : personnalisation des vues. Leur ordre dans index.html reste significatif.
- `public-files.json` : liste des seuls fichiers téléchargeables. Ajouter à cette liste tout nouvel asset public.
- `tests/` : tests HTTP, Socket.IO, récompenses, recherche rapide et lancement. Les opérations PostgreSQL sont simulées dans les tests de lancement.
- `game-economy.js` : règles des gains selon le mode.
- `quick-match.js` : file de recherche automatique.
- `wallet-client.js`, `wallet.css` : recherche et historique du portefeuille.

## Règles 1.45

50 pièces à la création d’un nouveau portefeuille, sans remise à zéro des comptes existants. Salons privés : aucune vie consommée, aucun gain. Parties rapides : 2 à 6 humains, 5 manches, 6 catégories, 60 secondes ; 1 vie au lancement. Gains fixes à la fin : 60 / 40 / 25 / 10 selon le rang, mêmes gains pour un rang ex æquo (1er, 1er, 3e…). Aucun gain de forfait. Pas de bots ni de relances payantes en mode rapide. Voir MISE-A-JOUR-1.45.md.

Les styles sont encore en plusieurs couches. Une suppression globale des anciennes classes sans tester les écrans dynamiques risquerait de casser des vues. Voir OPTIMISATION.md pour les travaux effectués et les priorités restantes.
