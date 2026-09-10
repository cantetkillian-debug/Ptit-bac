# P’tit Bac — V1.39 stabilité

Jeu P’tit Bac multijoueur mobile en Node.js / Socket.IO, pensé pour être déployé sur Render.

## Fonctionnalités principales

- 1, 3 ou 5 manches.
- 30, 60 ou 90 secondes par manche.
- 6 à 10 catégories fixes pendant toute la partie.
- 43 catégories réparties en trois difficultés : débutant, moyen et difficile.
- Sélection pondérée des catégories selon la difficulté.
- Roue A–Z avec un joueur humain choisi pour lancer la lettre.
- Relance des catégories : 10 pièces.
- Relance de la lettre : 10 pièces.
- Participation à une partie : 5 pièces par joueur humain.
- Validation automatique des réponses par OpenAI, avec contrôle local des réponses vides, mauvaises lettres et doublons.
- 1 point uniquement pour une réponse valide et unique.
- Résultats détaillés après chaque manche et classement final.
- Portefeuille géré côté serveur avec historique de transactions.
- PostgreSQL pris en charge si `DATABASE_URL` est configurée ; repli sur `wallets.json` pour le développement.

## Validation IA

La clé OpenAI ne doit jamais être placée dans GitHub ou dans `app.js`.

Sur Render, ajoute :

```text
OPENAI_API_KEY=ta_clé_privée
```

Variables optionnelles :

```text
OPENAI_VALIDATION_MODEL=gpt-5-mini
OPENAI_VALIDATION_REVIEW_MODEL=gpt-5-mini
OPENAI_VALIDATION_WEB_SEARCH=false
OPENAI_VALIDATION_BATCH_SIZE=20
AUTO_VALIDATION_TIMEOUT_MS=30000
```

### Diagnostic

Ouvre :

```text
/api/validation-health
```

Le champ `aiConfigured` indique si la variable `OPENAI_API_KEY` est présente. L’endpoint expose aussi le dernier succès et la dernière erreur OpenAI sans révéler la clé.

Pour effectuer un vrai test API volontaire et très léger :

```text
/api/validation-health?live=1
```

Ce test consomme une petite quantité de crédit API.

### Comportement en cas de panne

Une panne OpenAI ne transforme plus toutes les réponses en réponses fausses. La manche reste sur l’écran de vérification avec l’état « vérification en pause ». L’hôte peut ensuite utiliser « Réessayer la vérification ». Aucun score n’est calculé tant que la validation n’a pas abouti.

Les erreurs temporaires sont retentées automatiquement une fois avant de mettre la vérification en pause.

## Portefeuille

Un nouveau portefeuille commence avec 25 pièces.

Transactions possibles :

- `GAME_ENTRY` : -5 pièces au lancement réel de la partie.
- `CATEGORY_REROLL` : -10 pièces.
- `LETTER_REROLL` : -10 pièces.
- `GAME_REWARD` : récompense de fin de partie.
- `ADMIN_ADJUST` / `ADMIN_SET` : outil de test administrateur.

Chaque portefeuille conserve les 100 dernières transactions. Les débits d’entrée et récompenses de fin utilisent aussi des clés d’idempotence afin de réduire le risque de double débit ou double récompense.

### Récompenses

La cagnotte contient exactement les mises des joueurs humains :

```text
nombre de joueurs humains × 5 pièces
```

Répartition de base :

- 2 joueurs : 100 % au gagnant.
- 3 joueurs : 67 % / 33 %.
- 4 joueurs : 60 % / 40 %.
- 5 joueurs et plus : 60 % / 25 % / 15 %.

Une variation aléatoire de ±20 % est appliquée aux parts gagnantes puis renormalisée. La somme finale redistribuée reste exactement égale à la cagnotte. Les égalités partagent les places concernées.

## Persistance des pièces

### Recommandé : PostgreSQL

Configure une variable Render :

```text
DATABASE_URL=postgresql://...
```

Le serveur crée automatiquement la table `ptitbac_wallets` au démarrage et recharge les portefeuilles existants.

### Développement / secours : JSON

Sans `DATABASE_URL`, le serveur utilise `wallets.json`. Ce mode convient aux tests mais n’est pas recommandé comme stockage définitif sur une instance Render éphémère.

Un emplacement JSON spécifique peut être choisi avec :

```text
PTITBAC_WALLET_FILE=/chemin/wallets.json
```

## Outil administrateur de pièces

Il n’existe plus de code administrateur par défaut dans le code source.

Pour l’activer, configure sur Render :

```text
PTITBAC_ADMIN_CODE=un_code_privé
```

Sans cette variable, l’outil est désactivé côté serveur.

## Sécurité réseau

Socket.IO est en même origine par défaut. Pour autoriser explicitement un frontend séparé :

```text
SOCKET_CORS_ORIGIN=https://exemple.com
```

Plusieurs origines peuvent être séparées par des virgules.

## Installation locale

```bash
npm install
npm start
```

Puis ouvre :

```text
http://localhost:3000
```

## Déploiement Render

Le dépôt contient `render.yaml`. Le service utilise :

```text
Build Command: npm install
Start Command: npm start
```

Variables importantes à mettre dans **Render → Environment** et jamais dans GitHub :

```text
OPENAI_API_KEY
DATABASE_URL              # recommandé pour les pièces
PTITBAC_ADMIN_CODE        # uniquement si l’outil admin est souhaité
```

## Fichiers

```text
index.html
style.css
app.js
server.js
package.json
render.yaml
petit-bac-logo.png
README.md
.gitignore
```

`petit-bac-logo.jpg` est un ancien fichier devenu inutile et peut être supprimé du dépôt.

## V1.39 — corrections principales

- Validation OpenAI plus résiliente : retry + état de panne sans donner 0 point à toute la manche.
- Bouton de nouvelle tentative réservé à l’hôte.
- Diagnostic OpenAI enrichi.
- `VALIDATION_ENGINE_VERSION` centralisée.
- Messages du cache corrigés.
- Historique transactionnel du portefeuille.
- Protection supplémentaire contre les doubles débits/récompenses.
- Prise en charge optionnelle de PostgreSQL.
- Suppression du code admin par défaut exposé côté client/serveur.
- CORS Socket.IO limité par défaut à la même origine.
- Ancien formulaire mis à jour avec l’option 90 secondes.
- Documentation remise à jour.
