# Audit et nettoyage — V0.1 vers 1.44.0

Analyse du ZIP fourni. Le site Render n’a pas pu être consulté avec l’outil de consultation web ; aucun changement n’a été publié.

## Installation du correctif

1. Conserver une copie de V0.1.zip.
2. Copier le contenu de `fichiers/` à la racine du projet en remplaçant les fichiers correspondants. Conserver les autres fichiers.
3. Supprimer seulement les fichiers listés dans SUPPRIMER.txt. Aucun fichier de données, secret ou paramètre de base n’est à supprimer.
4. Exécuter `npm ci`, puis `npm test` et `npm start` avec Node.js 22.
5. Sur Render, utiliser `npm start` : ne pas conserver une ancienne commande avec des `-r economy-hook.js` ou `-r room-limit-hook.js`.
6. Vérifier une partie complète à deux téléphones avec la base et la clé IA habituelles avant mise en production.

Ce ZIP contient uniquement les fichiers modifiés ou ajoutés. Il ne constitue pas un site autonome sans les fichiers conservés de V0.1.

## Modifications réalisées

- Les deux correctifs qui transformaient le texte de server.js au démarrage ont été appliqués une fois et intégrés au source. Le serveur ne dépend plus de recherches/remplacements fragiles ni du remplacement global de fs.readFileSync.
- Amis, chat, signalements et administration : installation explicite sur l’instance Socket.IO, dans l’ordre existant ; plus de remplacement du constructeur partagé Server.
- Entrée sans coût en pièces et avatar photo intégrés dans app.js ; suppression du correctif client correspondant. La participation reste contrôlée en vies côté serveur.
- Six fenêtres de sortie presque identiques remplacées par une fonction commune ; les préfixes CSS de chaque écran sont conservés.
- Arrêt du minuteur de manche quand la session locale est effacée.
- Script client chargé avec defer dans l’ordre initial, message de chargement et secours d’accueil adaptés.
- Contrôle périodique de l’état administrateur espacé de 5 à 30 secondes et suspendu quand la page est masquée ou déconnectée.
- Sept règles CSS strictement dupliquées retirées, en conservant leur dernière occurrence. Les autres superpositions restent en place.
- Recompression sans perte de 22 PNG : 2 163 161 octets économisés. Dimensions et pixels RGBA comparés à l’original et identiques.
- Fichiers historiques non référencés retirés, dont l’ancien salon V3 et une maquette de profil autonome avec des données fixes.
- package-lock.json ajouté ; build Render reproductible avec npm ci ; version serveur alignée sur package.json.

## Corrections de sécurité et de fiabilité

Le serveur d’origine publiait tout son dossier avec express.static. Des fichiers internes et les JSON créés au fonctionnement pouvaient ainsi être téléchargés. La version nettoyée utilise une liste explicite d’assets publics. Les scripts serveur, fichiers SQL, dépendances et données ne sont pas servis.

Les actions sur une partie vérifient désormais que la connexion Socket.IO est celle du joueur indiqué. Connaître un playerId ne suffit plus pour utiliser ses commandes. La reconnexion exige toujours le jeton du profil, interdit les bots et retire l’ancienne connexion du salon.

Les paquets applicatifs mal formés sont refusés avant les gestionnaires, ce qui évite notamment une exception sur un payload null. Cela ne remplace pas une politique complète de quotas et de limitation de débit.

`/health` renvoie un vrai JSON. Une URL de fichier inconnue renvoie 404 au lieu du HTML d’accueil. Le diagnostic IA payant `?live=1` exige désormais `Authorization: Bearer <PTITBAC_ADMIN_CODE>`.

Les scripts et styles peuvent être revalidés par ETag ; les images et le son sont mis en cache un jour. Après remplacement d’une image sous le même nom, un client peut donc conserver l’ancienne jusqu’à expiration du cache. Une future compilation avec noms de fichiers hachés permettra un cache long sans ce compromis.

## Vérifications effectuées

- Démarrage réel du serveur sans PostgreSQL ni clé IA.
- Vérification syntaxique des 29 fichiers JavaScript restants.
- Tests HTTP : assets publics disponibles, fichiers internes refusés, route de santé, diagnostic protégé et réponse 304 avec ETag.
- Tests Socket.IO réels : création, arrivée d’un second joueur, modification des paramètres par l’hôte, refus d’usurpation, refus d’un mauvais jeton, remplacement de connexion, ajout de quatre bots, limite de six joueurs, refus d’incarner un bot, payload null et refus explicite de démarrer sans base.
- Chargement des scripts client, rendu de l’accueil et six fenêtres de sortie vérifiés dans un DOM simulé. Aucun contrôle de mise en page n’en découle.
- Comparaison des pixels de tous les PNG recompressés.

Limites : environnement de test Node.js 24.19, alors que la cible déclarée reste Node.js 22 ; Chromium n’a pas pu être téléchargé, donc aucun contrôle visuel Safari/Chrome. Pas d’accès à la base réelle, aux migrations en production ni à une clé IA. Les débits de vies, gains, amis, chat, administration et la succession complète des manches avec correction IA ne sont pas validés de bout en bout ici.

## Priorités suivantes

1. **Fiabiliser le cycle complet des parties.** Tester perte de réseau, retour après verrouillage du téléphone, double appui sur démarrer, départ de l’hôte pendant le débit des vies et redémarrage du serveur. Les salons restent en mémoire et ne survivent pas à un redémarrage.
2. **Consolider les écrans.** Plusieurs fonctions de rendu de base sont encore remplacées par des scripts de personnalisation. Remplacer progressivement ce mécanisme par un module par écran, avec captures de référence à différentes tailles. Ne pas supprimer tout style portant un ancien numéro : certaines règles servent encore de base.
3. **Réduire davantage les téléchargements.** Les PNG restent volumineux pour de petites icônes. Préparer des versions aux dimensions réellement affichées et tester visuellement une conversion WebP. Cela va plus loin que la recompression sans perte de cette livraison.
4. **Renforcer comptes et persistance.** Prévoir une récupération de compte indépendante du localStorage. Les jetons actuels jouent le rôle de secrets d’accès. Centraliser les connexions PostgreSQL, organiser les migrations et rendre les transactions de vie/pièces robustes aux interruptions et à plusieurs instances.
5. **Préparer l’application mobile.** Créer un dossier séparé pour le client compilé, configurer explicitement l’URL du serveur Socket.IO, puis intégrer Capacitor. Le serveur Node/PostgreSQL restera hébergé. Tester clavier, zones sûres, retour au premier plan et reconnexion sur de vrais appareils.

Capacitor peut s’ajouter à un projet web existant et réutiliser HTML/CSS/JavaScript pour iOS et Android. Il demande notamment un dossier de fichiers web construit distinct : [documentation officielle](https://capacitorjs.com/docs/getting-started). C’est une piste adaptée à ce projet, pas une application mobile déjà livrée dans ce correctif.
