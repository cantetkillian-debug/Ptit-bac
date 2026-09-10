# P'tit Bac — version soirée

Site multijoueur mobile inspiré de la maquette fournie.

## Règles intégrées

- L’hôte choisit **1, 3 ou 5 manches** à la création du salon.
- L’hôte choisit **30 ou 60 secondes par manche**.
- 6 catégories sont tirées aléatoirement au début de la partie.
- Les 6 mêmes catégories restent identiques pendant toutes les manches.
- Chaque manche utilise une **lettre différente**.
- 1 point seulement si la réponse est **valide ET unique**.
- Doublon, mauvaise lettre, réponse vide ou réponse invalide = 0.
- Le score est **cumulé** d’une manche à l’autre.
- Après chaque manche intermédiaire, l’hôte lance la manche suivante.
- Le classement final n’apparaît qu’après la dernière manche.

### Les 12 catégories

1. Prénom
2. Animal
3. Lieu
4. Métier
5. Nourriture
6. Marque
7. Film
8. Jeu vidéo
9. Personnage fictif
10. Fruit / Légume
11. Objet
12. Sport

## Pourquoi l'hôte valide certaines réponses ?

Le serveur peut détecter automatiquement :
- une réponse vide ;
- une réponse qui ne commence pas par la bonne lettre ;
- un doublon exact (accents et majuscules ignorés).

Mais il ne peut pas savoir de façon fiable si une réponse inventée est réellement un métier, un film, un lieu, etc.  
Les réponses uniques qui passent les contrôles automatiques sont donc montrées à l'hôte, qui appuie sur **Valide** ou **Invalide**.

## Installation locale

```bash
npm install
npm start
```

Puis ouvre :

```text
http://localhost:3000
```

Sur un même Wi-Fi, les autres téléphones peuvent ouvrir l'adresse IP locale de l'ordinateur avec le port 3000.

## Replit

1. Crée un Repl Node.js.
2. Envoie tous les fichiers du projet.
3. Lance `npm install`.
4. Lance `npm start`.
5. Ouvre l'URL publique du Repl.

Le port est récupéré automatiquement avec `process.env.PORT`.

## Structure

```text
petit-bac-complete/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Limite actuelle

Les parties sont stockées en mémoire dans le serveur. Si le serveur redémarre, les salles en cours disparaissent.  
Pour une version de production durable, remplace le stockage en mémoire par Redis/PostgreSQL.


## Déploiement gratuit sur Render

1. Mets ce dossier dans un dépôt GitHub.
2. Va sur Render et crée un **Web Service**.
3. Connecte ton dépôt GitHub.
4. Render détectera le fichier `render.yaml`.
5. Le service utilise :
   - Build Command : `npm install`
   - Start Command : `npm start`
   - Plan : `Free`
6. Une URL publique en `onrender.com` sera créée.

Important : sur le plan gratuit, Render peut mettre le serveur en veille après une période d'inactivité. Le premier chargement suivant peut donc prendre un peu plus de temps.

Le serveur est déjà compatible Render : il écoute `process.env.PORT` et `0.0.0.0`.


## Version iPhone simplifiée

Cette variante n'utilise aucun dossier `public`, afin que tous les fichiers puissent être envoyés facilement depuis l'iPhone vers GitHub.

Structure :

```text
petit-bac-iphone/
├── index.html
├── style.css
├── app.js
├── server.js
├── package.json
├── render.yaml
├── README.md
└── .gitignore
```

Sur GitHub mobile, importe les fichiers décompressés eux-mêmes, pas le ZIP.


## Version 1.15 — Multimanches

Modifications :
- Les choix 1 / 3 / 5 manches sont maintenant réellement appliqués par le serveur.
- Les choix 30 s / 60 s contrôlent réellement le chrono de chaque manche.
- Le lobby affiche les paramètres sélectionnés.
- L’écran de jeu affiche `Manche X/Y`.
- Les lettres sont différentes à chaque manche.
- Les scores sont cumulés jusqu’à la dernière manche.
- Le bot test rejoue automatiquement à chaque manche.
- « Refaire une partie » conserve les réglages du salon et génère de nouvelles catégories / lettres.

## V1.16 — Accueil, profil et pièces
- Nouvel écran d'accueil dans le style pastel premium.
- Profil local persistant : pseudo + icône.
- L'icône choisie suit le joueur dans le salon et les classements.
- Solde de pièces persistant (12 pièces au premier lancement).
- Créer ou rejoindre une partie coûte 5 pièces, débitées seulement après succès.
- Pages liées : Profil, Mes pièces, 12 catégories, Comment jouer ?
