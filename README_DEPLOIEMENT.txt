APPLICATION CHAMPIGNONS — ZIP AUTONOME

Ce dossier contient uniquement l'application Champignons.

Déploiement Cloudflare Pages :
1. Créez un nouveau projet Pages.
2. Choisissez le dépôt direct / upload de fichiers.
3. Envoyez le contenu de ce ZIP tel quel à la racine du nouveau site.
4. Le fichier index.html doit être à la racine.

Les données existantes (bois, photos, abonnement et reconnaissance) utilisent encore l'API du serveur Couteau Suisse afin de conserver toutes les données déjà enregistrées. Le nouveau site Champignons est séparé visuellement et s'installe comme sa propre application.

Si l'API Champignons est migrée plus tard vers un autre serveur, il suffira de modifier API_BASE dans config.js.


MISE À JOUR V4
- L’écran « Accès Champignons » avec les codes a été supprimé.
- L’application s’ouvre directement sur son accueil.
- Dans Réglages > Compte Couteau Suisse, l’utilisateur renseigne NOM, PRÉNOM et ADRESSE E-MAIL.
- Ces coordonnées doivent être les mêmes que dans Couteau Suisse.
- Les données locales déjà enregistrées (bois, photos, réglages) ne sont pas effacées par cette mise à jour.