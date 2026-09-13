# Première étape : portefeuille et modes de jeu

Ce correctif se pose sur la version 1.44.0 précédemment livrée. Copier le contenu du dossier `fichiers/` à la racine du projet, en conservant les autres fichiers. Aucun fichier n’est à supprimer pour cette mise à jour. Conserver les dossiers `tests/` et les nouveaux modules à leurs emplacements.

Render : `npm ci` puis `npm start`, comme auparavant. Conserver les variables d’environnement existantes. Aucun déploiement ni accès à la base réelle n’a été effectué dans cette session.

## Comportement

- Nouveau portefeuille : 50 pièces, avec une ligne « Bienvenue » dans l’historique. Une reconnexion au même portefeuille ne réattribue pas ce bonus. Les soldes existants sont conservés. Le système actuel identifie le portefeuille par son jeton ; ce n’est pas encore un compte récupérable après effacement du stockage du téléphone.
- Salons créés/rejoints par code : mode privé obligatoire, sans consommation de vie et sans gain de pièces. Les relances de lettres/catégories gardent leur coût existant dans ce mode. Il n’existe pas encore de missions ou bonus de progression ; leur futur code devra respecter cette exclusion.
- Partie rapide : file automatique de 2 à 6 humains. Quand au moins deux joueurs attendent, le serveur laisse 8 secondes pour regrouper les participants avant le lancement. Annulation gratuite pendant la recherche. Le premier joueur devient l’hôte pour les confirmations de catégories et passages entre les manches du fonctionnement existant.
- Format rapide fixe : 5 manches, 6 catégories débutant, 60 secondes. 1 vie par humain au lancement ; pas d’ajout de bots, de changement de format, d’entrée par code ou de relance payante. Rejouer passe par une nouvelle recherche depuis l’accueil.
- Gains à la fin complète d’une partie rapide : 60, 40, 25, puis 10 pièces. Les égalités utilisent le classement de compétition : deux premiers obtiennent 60 chacun, le suivant est troisième et obtient 25. Si la partie finit par forfait, aucun gain de pièces n’est versé.
- Historique des 30 derniers mouvements depuis le compteur de pièces de l’accueil.

## Protections et corrections

- Les récompenses dépendent du mode créé par le serveur. Une requête cliente ne peut pas convertir un salon privé en partie récompensée.
- Le lancement est verrouillé pendant le débit. Les vérifications de transactions de vie sont effectuées après verrouillage des lignes PostgreSQL, avec ordre stable des joueurs.
- La consultation des vies n’écrit plus un état potentiellement ancien dans la base : elle ne peut donc plus annuler par inadvertance un débit concurrent.
- Si une déconnexion est détectée pendant le débit initial, le lancement est annulé et le remboursement est appelé.
- Une fin de partie traitée deux fois ne doit pas créditer deux fois le portefeuille.
- Recherche en double et annulation pendant la vérification du profil prises en charge.

## Vérifications

9 tests automatisés passent : accès HTTP, contrôle des salons, accueil 50 pièces unique, mode privé imposé, refus rapide sans base, barème/égalités/exclusions, file/annulation/doublon, double lancement, interruption pendant débit et double distribution.

Les tests de lancement utilisent les fonctions réelles du serveur avec les opérations de débit/remboursement simulées. Ils vérifient l’enchaînement du code, pas le comportement d’un vrai PostgreSQL. La file est testée avec des connexions simulées, les opérations ordinaires de salon avec de vraies connexions Socket.IO locales. Les scripts client, l’historique et les commandes de recherche ont été exercés dans un DOM simulé ; ce n’est pas un contrôle visuel sur téléphone.

Environnement local : Node.js 24.19, cible du projet : Node.js 22. Avant publication à tous, vérifier sur deux téléphones une partie rapide entière avec PostgreSQL et l’IA, ainsi qu’un salon privé : bilan attendu privé = zéro vie débitée et zéro pièce gagnée ; rapide = une vie débitée et un seul gain final.

## Limites et suite

Les parties et la file restent en mémoire d’un seul processus serveur. Les tests ne couvrent pas la durabilité en cas d’arrêt brutal pendant une transaction ou d’indisponibilité PostgreSQL ; un redémarrage perd les salons. Une instance unique reste nécessaire avec l’architecture actuelle.

Cette livraison traite le premier bloc accepté. Les améliorations du comportement des bots, de la correction IA, des animations/sons/musique, puis de l’inventaire et de la boutique restent à réaliser. Les fichiers d’audit OPTIMISATION.md décrivent la version 1.44 et sont historiques ; les nouvelles règles ci-dessus prévalent.
