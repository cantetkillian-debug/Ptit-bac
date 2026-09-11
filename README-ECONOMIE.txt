P'TIT BAC — ECONOMIE V2

Fichiers a mettre a la racine GitHub:
- package.json (remplacer)
- index.html (remplacer)
- economy-hook.js (nouveau)
- economy-client.js (nouveau)
- economy.css (nouveau)

Puis dans Supabase > SQL Editor:
- executer supabase-economy.sql une seule fois.

Regles:
- nouveau joueur: 50 pieces
- 5/5 vies
- partie rapide: 1 vie
- recharge: +1 vie toutes les 30 minutes
- 1er: 60 pieces +/-20%
- 2e: 40 pieces +/-20%
- 3e: 25 pieces +/-20%
- autres: 10 pieces +/-20%
- video recompensee prevue: +80 pieces

Important:
- Ce ZIP se pose APRES PtitBac-Amis-V1.
- friends-hook.js, friends-client.js et friends.css doivent deja etre presents.
- Le vrai SDK publicitaire sera branche plus tard; le serveur reserve deja la recompense de 80.
