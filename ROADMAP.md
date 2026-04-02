# Wroket — Roadmap

## Implémenté

- [x] **Authentification** — Register, login, logout, sessions cookie, hachage bcrypt
- [x] **Profil utilisateur** — Prénom, nom, email ; affiché dans le header
- [x] **CRUD Tâches** — Créer, lister, modifier, supprimer (soft delete)
- [x] **Priorité & Effort** — 3 niveaux chacun (haute/moyenne/basse, lourd/moyen/léger)
- [x] **Deadline & classification** — Classification Eisenhower dynamique (date + importance + effort)
- [x] **Sous-tâches** — Tâches imbriquées (1 niveau), gestion via modal et inline
- [x] **Matrice Eisenhower (Cards)** — Vue visuelle en 4 quadrants avec cartes, limite 5 + expand
- [x] **Vue Radar (Gartner)** — Scatter plot + liste priorités (12 max), tooltips
- [x] **Vue Liste** — Tableau triable, filtres quadrant/statut, multi-select quadrants, exclusivité statuts
- [x] **Filtres catégories** — Faire, Planifier, Expédier, Différer, Accomplies, Annulées, Supprimées
- [x] **Undo** — Bouton "Annuler dernière action"
- [x] **Édition inline** — Double-clic → modal d'édition complète
- [x] **Dark mode** — Toggle light/dark, palette slate/bleu foncé
- [x] **Dashboard** — Statistiques, résumé Eisenhower, tâches urgentes, bilan hebdomadaire, notifications récentes
- [x] **Navigation sidebar** — Accueil, Tâches (sous-menu Mes tâches / Déléguées), Projets, Équipes, Paramètres
- [x] **i18n** — Français / Anglais, persistance locale, sélecteur dans Paramètres
- [x] **Paramètres** — Mon profil (prénom, nom), Langues
- [x] **Teams (backend + frontend)** — CRUD équipes, invitation collaborateurs, gestion membres
- [x] **Assignation de tâches** — Attribuer à un membre, statut pending/accepted/declined
- [x] **Accepter / Refuser** — Boutons accepter/refuser une tâche assignée, badges visuels (vert/orange)
- [x] **Notifications in-app** — Cloche + dropdown, notifications assignation/refus/acceptation/complétion
- [x] **Page Déléguées** — `/todos/delegated` : tâches assignées à d'autres avec statut
- [x] **Toggle scope** — Toutes / Personnelles / Attribuées sur la page Tâches
- [x] **Projets** — CRUD projets, lier à une team, vue détaillée avec tâches, lier/délier tâches existantes, badge projet dans la liste
- [x] **Phases de projet** — Étapes ordonnées (Conception, Dev, Tests…) avec dates, couleurs auto-attribuées, CRUD complet
- [x] **Vue Board** — Tâches groupées par phase, assignation de tâche à une phase, actions inline (compléter, supprimer, délier)
- [x] **Vue Gantt** — Diagramme de Gantt CSS Grid : timeline par phases et tâches, barres colorées, marqueur "Aujourd'hui"
- [x] **Dates de début** — Champ `startDate` sur les tâches pour positionnement Gantt
- [x] **Persistance hybride** — Cache in-memory + Firestore (prod) ou `local-store.json` (dev local)
- [x] **Sécurité** — Helmet, CORS, rate limiting, validation inputs, bcrypt, cookies httpOnly
- [x] **Hardening sécurité (v1)** — OAuth state cryptographique, échappement HTML emails, autorisation commentaires, redaction tokens logs, guard admin middleware, restriction réassignation, CSRF verify-email (GET→POST), arrêt gracieux (flushNow), traçabilité requêtes (X-Request-Id), logging structuré
- [x] **Hardening sécurité (v2)** — Google SSO CSRF (state cookie + token single-use), SSRF webhook (résolution DNS anti-rebinding), persistence Firestore (dirty set post-commit), RGPD export (strip tokens/salt), graceful shutdown complet (server.close + interval cleanup), CSP/HSTS/X-Frame-Options, cap inviteLog, validation commentaires (400 vs 404), res.ok sur tous les fetch frontend
- [x] **Hardening sécurité (v3)** — Recherche globale avec contrôle d'accès projets (listProjects), partage notes avec vérification membership équipe, validation récurrence (interval 1-365, endDate), protection CSV formula injection (neutralisation =+@-), reorder batch unique persist (cap 200), rate limit /auth/search et /auth/my-export, attachments : MIME allowlist + path traversal guard (resolveAndGuard) + sanitisation filename + Content-Disposition RFC 5987 + nosniff, query search type safety + cap 200 chars
- [x] **Harmonisation UI** — Couleurs boutons slate-700 (light), responsive amélioré, formulaire 2 lignes
- [x] **Nettoyage code** — Suppression dead code (countComments, loadStore/saveStore deprecated, getActivityForUser, void stats), suppression requireAdminCheck dupliqué (déjà en middleware), fusion boucles admin, import statique au lieu de require()
- [x] **Kanban Board** — Vue Kanban dans la partie Projets (tâches par phase, drag & drop entre colonnes @dnd-kit), bouton "Ajouter une phase" visible dans toutes les vues (Board, Kanban, Gantt)
- [x] **Archives** — Archivage automatique des tâches terminées (>7j), page dédiée `/todos/archives`, restauration
- [x] **Calendrier & Slots** — Working hours dans paramètres, calcul de créneaux (3 propositions), booking sur une tâche
- [x] **Planification intelligente des slots** — Les créneaux proposés tiennent compte de la priorité et de la deadline de la tâche
  - Ratio de report : high=0%, medium=30%, low=50% du temps restant avant deadline
  - Fenêtre de recherche bornée à deadline - 1 jour (marge de sécurité)
  - Respect du champ `startDate` comme borne inférieure
  - Les tâches haute priorité/deadline proche réservent les premiers créneaux, les basse priorité sont reportées
- [x] **Intégration Google Calendar** — OAuth2 natif (fetch), lecture/écriture agenda Google, token auto-refresh
- [x] **Agenda** — Vue calendrier semaine, fusion événements Wroket (code couleur Eisenhower) + Google Calendar, double-clic sur tâche Wroket pour édition directe (modale TaskEditModal + refresh automatique)
- [x] **Responsive mobile** — Viewport meta, sidebar hamburger, tableaux scrollables, badges wrap, bouton edit tactile
- [x] **Branding Wroket** — Identité visuelle (fusée + checkmark), palette Slate + Emerald, icône app, logo bicolore
- [x] **Page Notifications** — Page dédiée `/notifications` avec filtres (tous/lus/non-lus), actions par type
- [x] **Collaboration (accept/decline)** — Flux complet invitation collaborateur : accept/decline, réciprocité, notifications
- [x] **Page Équipes (cards)** — Vue d'ensemble avec 2 cards résumées (Collaborateurs + Teams), drill-down vers vue détaillée, badges de notification
- [x] **Webhooks sortants** — Intégrations Slack/Discord/Teams dans Paramètres, payloads formatés par plateforme, dispatch auto via notifications, bouton tester
- [x] **Google SSO** — Connexion via Google OAuth2 (openid + email + profile), création automatique de compte
- [x] **Vérification d'email** — Lien de confirmation par email à l'inscription (Nodemailer/Gmail SMTP)
- [x] **Réinitialisation de mot de passe** — Flux "mot de passe oublié" par email avec token sécurisé
- [x] **Emails d'invitation** — "Faites découvrir Wroket" : envoi d'email d'invitation avec logo, template HTML
- [x] **Administration** — Dashboard admin : stats users/tâches/projets/équipes, liste utilisateurs, historique invitations
- [x] **Rôles dans les équipes** — Owner (propriétaire implicite) / Admin (gestion team, rôles, invitations + r/w projet) / Super-user (r/w tâches, phases, sous-projets) / User (lecture seule)
- [x] **Validation deadline** — Interdiction de créer une tâche avec échéance passée (backend + frontend)
- [x] **SlotPicker amélioré** — Auto-ouverture après création de tâche + mode manuel (date/heure libre)
- [x] **Tuto Google Calendar** — Étape dédiée dans le tutoriel d'onboarding
- [x] **DNS www.wroket.com** — Domain mapping Cloud Run + CORS pour www
- [x] **Templates de projet** — Création de projet avec template de phases standard (Cadrage → Clôture)
- [x] **Commentaires sur tâches** — Fil de discussion par tâche (ajout, suppression, affichage chronologique dans la modale d'édition)
- [x] **Tags / labels** — Tags personnalisés sur les tâches (ajout libre, badges indigo, filtre par tag)
- [x] **Dashboard équipe** — Vue consolidée `/teams/dashboard` : stats, répartition par membre, tâches en retard
- [x] **Rappels deadline** — Job horaire créant des notifications in-app (échéance aujourd'hui / dans 24h)
- [x] **Bloc-notes** — Éditeur de notes en ligne et hors ligne (localStorage + sync auto), épinglage, recherche
- [x] **Commandes slash** — `/task`, `/assign`, `/deadline`, `/project`, `/date`, `/time`, `/code`, `/warning` dans l'éditeur de notes
- [x] **Aide contextuelle notes** — Bouton ampoule avec liste des commandes et info hors ligne
- [x] **Timezone utilisateur** — Détection automatique du fuseau horaire navigateur, auto-correction des profils UTC, dropdown dans les paramètres avec alerte de désynchronisation
- [x] **Page d'accueil** — Landing page marketing bilingue FR/EN : hero avec mini-visuel interactif (tags, slots planifiés), 6 flip cards avec icônes SVG et previews (Eisenhower, Agenda multi-comptes, Notes, Kanban, Collaboration, Notifications), CTA, footer
- [x] **Tutoriel mis à jour** — 7 étapes exhaustives (tâches, vues, projets/Kanban, agenda, notes, équipes, démarrage)
- [x] **Aide contextuelle par page** — Bouton ampoule (PageHelpButton) avec popup portal sur chaque page (Dashboard, Tâches, Projets, Agenda, Notes, Paramètres), puces des features disponibles
- [x] **Favicon Wroket** — Logo Wroket (fond blanc) dans les onglets navigateur (icon.png + apple-icon.png)
- [x] **Responsive bloc-notes** — Pattern master-detail mobile (liste ou éditeur plein écran) avec bouton retour
- [x] **Dark mode boutons** — Harmonisation couleurs boutons en dark mode (slate-600 au lieu de slate-100), correction tabs illisibles dark mode (archives, projets, SlotPicker)
- [x] **Import CSV → Projet** — Upload CSV pour créer un projet complet (phases + tâches), prévisualisation avant import, validation
- [x] **Commentaires avancés** — Édition de commentaires, réactions emoji (👍 ✅ ❤️), @mentions avec autocomplétion des collaborateurs
- [x] **Popup commentaires** — Icône commentaire sur les tâches (Cards, Liste, Radar) avec popup hover via `createPortal`, chargement lazy des commentaires
- [x] **Administration complète (RGPD)** — Dashboard admin : stats globales (users, tâches, projets, notes, commentaires, uptime), liste utilisateurs (dernière connexion, notes, taux de complétion), journal d'activité, sessions actives, intégrations, registre RGPD, export/suppression conformes

## Fonctionnel — consolidé

- [x] **Sessions persistantes** — Sessions persistées dans le store Firestore/JSON, hydratées au démarrage, survient aux redémarrages
- [x] **Changement de mot de passe** — Route `PUT /auth/password` avec vérification ancien mot de passe, invalidation des autres sessions, formulaire dans Paramètres > Profil
- [x] **Paramètres > Historique** — Historique des actions récentes de l'utilisateur avec pagination, icônes par type d'entité, formatage date/heure
- [x] **Paramètres > Administration** — Export JSON complet de ses données (tâches, projets, notes, commentaires), suppression de compte avec confirmation SUPPRIMER, nettoyage cookie

## Nouvellement implémenté

- [x] **Recherche globale** — Barre de recherche dans le header (debounced 300ms), recherche textuelle dans tâches (titre + tags), projets (nom + description + tags), notes (titre + contenu), résultats groupés par type
- [x] **Tâches récurrentes** — Récurrence quotidienne/hebdomadaire/mensuelle avec intervalle configurable, date de fin optionnelle, clonage automatique à la complétion avec deadline recalculée, badge 🔄 sur les tâches récurrentes
- [x] **Pièces jointes** — Upload de fichiers sur les tâches (max 5 Mo, max 5 par tâche), stockage local (UPLOAD_DIR), téléchargement, suppression, API REST avec multer
- [x] **Drag & drop tâches** — Réordonnancement des tâches en vue liste avec @dnd-kit, drag handle (⋮⋮), persistance de l'ordre via `sortOrder`, endpoint batch `PUT /todos/reorder`
- [x] **Export CSV** — Export de toutes les tâches au format CSV (id, titre, statut, priorité, effort, deadline, tags, projet, date)
- [x] **Audit log par tâche** — Historique des actions par tâche (GET /:id/activity), filtrage par entityId+entityType, limité à 50 entrées
- [x] **Notes — dossiers / tags** — Champs `folder` et `tags` sur les notes, acceptés en création et mise à jour
- [x] **Notes — export Markdown** — Export de toutes les notes en un seul fichier Markdown avec métadonnées (dossier, tags), route GET /notes/export
- [x] **Notes partagées** — Partage de notes avec une équipe via `shared` + `teamId`, endpoint GET /notes/shared pour lister les notes partagées par les membres des équipes de l'utilisateur
- [x] **Sous-projets** — Arborescence hiérarchique : créer des sous-projets dans un projet (`parentProjectId`), affichage en arbre dans la vue card, promotion en projet racine
- [x] **Tags projets** — Tags personnalisés sur les projets et sous-projets (ajout libre, badges, recherche globale incluse)
- [x] **Assignation tâche → projet (post-création)** — Attribuer une tâche à un projet même si le projet a été créé après la tâche, via dropdown dans la modale d'édition
- [x] **Temps attribué par phase/projet** — Calcul et affichage du temps total attribué pour chaque phase et pour le projet, visible dans la vue détaillée et les cards
- [x] **Vue card projets** — Affichage des projets en grille de cards (au lieu de liste), avec sous-projets imbriqués et indicateurs visuels
- [x] **Drag & drop projets** — Réorganisation des projets par drag & drop (@dnd-kit), persistance via `sortOrder`, endpoint `PUT /projects/reorder`
- [x] **Drag & drop imbrication** — Glisser un projet sur un autre pour en faire un sous-projet (timer 800ms), protection contre l'imbrication de projets ayant déjà des enfants
- [x] **Drag & drop dés-imbrication** — Extraire un sous-projet en le glissant vers la zone racine pour le promouvoir en projet indépendant
- [x] **Indicateurs de progression** — Health badges sur les cards projets (En cours / Attention / En retard / Terminé) calculés à partir des deadlines et du statut des tâches, barre de progression visuelle
- [x] **Undo projets** — Bouton "Annuler" avec timer 10s pour annuler la dernière action (archiver, imbriquer, dés-imbriquer, réorganiser)
- [x] **Agenda — vues jour/semaine/mois** — Toggle entre les vues jour, semaine et mois avec navigation adaptée et affichage des événements
- [x] **Agenda — création rapide** — Double-clic sur un créneau horaire pour créer une tâche rapidement (pré-rempli avec date/heure)
- [x] **Refactoring page projets** — Découpage de `projects/page.tsx` (2400 → 104 lignes) en 5 sous-composants (`ProjectDetailView`, `ProjectListView`, `GanttChart`, `DndWrappers`, `types`) pour stabiliser Turbopack et éliminer les fuites mémoire
- [x] **Agenda — heure de début & durée** — Champs éditables "heure de début" et "durée" dans la création rapide de tâche depuis l'agenda, pré-remplis avec l'heure cliquée et la durée par défaut selon l'effort
- [x] **Drag & drop tâches Board/Gantt** — Réorganisation des tâches et déplacement entre phases dans les vues Board et Gantt (@dnd-kit, SortablePhaseContainer, SortableBoardTaskRow)
- [x] **Limite sous-projets 1 niveau** — Interdiction de créer un sous-projet dans un sous-projet (validation backend + frontend), masquage dynamique du bouton "Ajouter un sous-projet", drag out restaure le statut projet racine
- [x] **Suppression phase avec options** — Popup demandant de supprimer les tâches contenues ou de les placer hors phase
- [x] **Suppression tâche avec sous-tâches** — Composant réutilisable `DeleteTaskDialog` : supprimer tout ou conserver les sous-tâches (promotion en tâches autonomes), appliqué sur My Tasks, Projets et Déléguées
- [x] **Réordonnancement sous-tâches** — Boutons haut/bas pour réordonner les sous-tâches dans la vue liste My Tasks, drag & drop dans la SubtaskModal
- [x] **Tâches récurrentes dans l'agenda** — Expansion des occurrences récurrentes dans l'agenda (backend génère les événements virtuels dans la plage demandée, indicateur ↻, double-clic ouvre la tâche parente)
- [x] **Notes simplifiées** — Suppression du sélecteur projet sur les notes ; une note est soit autonome, soit liée en lecture seule à une tâche/sous-tâche (créée depuis celle-ci)
- [x] **Renommage navigation** — "Collaboration > Collaboration" renommé en "Mes équipes", "Dashboard équipe" renommé en "Tableau de bord"

## Intégrations & Connecteurs

- [x] **Webhooks sortants (Niveau 1)** — Notifications Wroket vers Slack, Discord, Microsoft Teams
  - Configuration par utilisateur dans Paramètres > Intégrations
  - Choix des événements : tâche assignée, complétée, refusée, deadline proche, invitation reçue
  - Support multi-webhooks (un par channel/plateforme)
  - Bouton "Tester" pour valider la configuration
  - Payloads formatés par plateforme (Slack Block Kit, Discord Embeds, Teams Adaptive Cards)
- [ ] **Bots interactifs (Niveau 2)** — Commandes slash depuis Slack/Discord
  - `/wroket add "titre" --priority high --effort medium` — créer une tâche
  - `/wroket today` — lister les tâches du jour
  - `/wroket done #id` — marquer une tâche comme terminée
  - Nécessite une app Slack/Discord avec OAuth + serveur de commandes
- [ ] **Sync bidirectionnelle (Niveau 3)** — Messages Slack ↔ commentaires Wroket
  - Réponses aux notifications Wroket dans Slack remontées comme commentaires
  - Threads Slack liés aux tâches Wroket

## À l'étude (R&D)

- [ ] **Notes — édition collaborative** — Édition temps réel multi-utilisateurs sur les notes partagées (WebSocket/CRDT)
- [x] **Multi-comptes & multi-calendriers Google** — Connexion de plusieurs comptes Google (ex: perso + pro), sélection des calendriers par compte
  - Modèle `googleAccounts[]` avec tokens + email par compte, migration automatique de l'ancien format single-account
  - OAuth callback : détection de l'email du compte via CalendarList API, ajout au tableau (ou mise à jour si déjà connecté)
  - Endpoints per-account : `GET/PUT /calendar/google/accounts/:accountId/calendars`, `DELETE /calendar/google/disconnect/:accountId`
  - Page dédiée Agenda > Gérer les agendas : liste des comptes connectés avec calendriers par compte, bouton "Ajouter un compte Google", déconnexion individuelle
  - Dropdown multi-comptes dans l'Agenda avec toggle de visibilité par compte, couleurs distinctes par compte
  - Navigation sidebar "Agenda" en dossier déployable (Mon agenda / Gérer les agendas)
  - RGPD : `googleAccounts` strippé de l'export utilisateur
- [ ] **Multi-calendriers externes** — Connecter des fournisseurs supplémentaires
  - Outlook / Microsoft 365 (OAuth2 Microsoft Graph)
  - CalDAV générique (Nextcloud, iCloud, Fastmail…)
  - Prise en compte de tous les calendriers actifs dans le calcul des créneaux disponibles (SlotPicker)

## Sécurité & Auth

- [x] **Réinitialisation de mot de passe** — Flux "mot de passe oublié" par email
- [x] **Vérification d'email** — Confirmer l'adresse email à l'inscription
- [x] **Google SSO** — Connexion via Google OAuth2
- [x] **OAuth state validation** — Tokens cryptographiques aléatoires (CSPRNG) remplaçant les UID bruts comme paramètre `state` OAuth
- [x] **Protection injection HTML** — Échappement des contenus utilisateur dans les templates email (`escapeHtml`)
- [x] **Autorisation commentaires** — Vérification `canAccessTodo()` avant ajout/suppression de commentaires
- [x] **Redaction tokens** — Les tokens de vérification/reset ne sont plus loggés en clair (dry-run)
- [x] **Guard admin (middleware)** — `requireAdmin` au niveau routeur pour les routes `/admin`
- [x] **Restriction réassignation** — Les assignés ne peuvent plus modifier le champ `assignedTo`
- [x] **CSRF verify-email** — Migration GET→POST avec rétrocompatibilité (body + query)
- [x] **Arrêt gracieux** — `flushNow()` sur SIGTERM/SIGINT pour éviter la perte de données (debounce 500ms), `server.close()` + cleanup intervals
- [x] **Traçabilité requêtes** — Header `X-Request-Id` + logging structuré JSON (prod) / lisible (dev)
- [x] **Google SSO CSRF** — Token `state` cryptographique (CSPRNG 32 bytes), stocké en cookie httpOnly, validé single-use au callback
- [x] **SSRF webhook** — Résolution DNS avant dispatch pour bloquer les attaques DNS rebinding (nip.io, localtest.me), validation IPv4/IPv6 privées
- [x] **CSP / HSTS** — Content-Security-Policy, Strict-Transport-Security (2 ans + preload), X-Frame-Options DENY, Referrer-Policy, Permissions-Policy
- [x] **Persistence Firestore safe** — Dirty domains retirés uniquement après commit réussi (évite perte silencieuse de données)
- [x] **RGPD export sécurisé** — Strip de tous les champs sensibles (salt, tokens OAuth/reset/verify) dans l'export utilisateur
- [x] **Memory leak fix** — Purge quotidienne du set de déduplication des rappels deadline (notifiedSet)
- [x] **Recherche sécurisée** — Contrôle d'accès projets via `listProjects`, type safety `req.query.q`, cap longueur 200 chars, rate limit `lookupLimiter`
- [x] **Partage notes sécurisé** — Vérification membership équipe (`getTeamRole`) avant partage, rejet si utilisateur non membre, cap tags à 10
- [x] **Validation récurrence** — Intervalle entier fini 1–365, fréquence whitelistée, date de fin validée, guard `isNaN` dans `calculateNextDueDate`
- [x] **CSV export sécurisé** — Neutralisation formula injection (=, +, -, @, tab, CR) via préfixe `'` dans les cellules
- [x] **Reorder sécurisé** — Batch unique persist (1 seul `scheduleSave`), cap 200 items, vérification propriété (`isOwner`)
- [x] **Attachments sécurisés** — MIME allowlist (images, PDF, docs, CSV, ZIP, JSON), `resolveAndGuard` anti path-traversal, `sanitizeFilename`, Content-Disposition RFC 5987, `X-Content-Type-Options: nosniff`
- [x] **Hardening sécurité (v4)** — Préservation refresh_token Google lors de re-auth, suppression fuite body Google dans erreurs, validation dates ISO (format + start<end + range max 90j), fan-out Google Calendar plafonné (20 requêtes parallèles max), max 5 comptes Google par user, calendarId length-bound (200), clearSlot/disconnectGoogle 404 si introuvable, protection open redirect auth URL Google, handleTest try/catch, correction bug logique deleteMyAccount
- [x] **Hardening sécurité (v5)** — `trust proxy` pour détection IP derrière Cloud Run, limite longueur mot de passe (MAX_PASSWORD_BYTES 1024, anti CPU DoS), `crypto.timingSafeEqual` avec length guard dans `changePassword`, centralisation logique `cookieSecure` (NODE_ENV + FRONTEND_URL), suppression `req.query.token` dans `verifyEmail` (token body only), validation inputs projets (types, valeurs vides, statut), CORS `callback(null, false)` au lieu d'erreur
- [x] **Optimisation performance** — Compression Gzip/Brotli (`compression` middleware), fix N+1 queries team membership (`teamMembershipCache` dans `listProjects`), batch `Promise.all` pour suppression de phase, memoisation `ProjectListView` (`useMemo` sur projets actifs/archivés/enfants/health)
- [ ] **OAuth GitHub / Microsoft** — SSO supplémentaires
- [ ] **2FA** — Authentification à deux facteurs (TOTP)

## Tests & Qualité

- [ ] **Tests unitaires backend** — Jest/Vitest pour services et controllers
- [ ] **Tests unitaires frontend** — Tests des composants React critiques
- [ ] **Tests E2E** — Playwright pour les parcours utilisateur

## Déploiement & Infrastructure

- [x] **Cloud Run (europe-west1)** — Backend + Frontend serverless sur Google Cloud Run
  - Backend : `wroket-api` → `api.wroket.com` (Express/Node 20, Firestore)
  - Frontend : `wroket-web` → `wroket.com` (Next.js standalone)
  - Service account dédié `wroket-run`, 256 Mi RAM, 0-2 instances
  - HTTPS automatique (Google-managed certificates)
  - Zero-cost au repos (scale-to-zero)
- [x] **Firestore** — Base de données NoSQL en production
  - Cache in-memory + écriture Firestore asynchrone (debounce 500ms)
  - Fallback `USE_LOCAL_STORE=true` pour dev local (`local-store.json`)
  - Free Tier : 50k lectures/jour, 20k écritures/jour
- [x] **Cloud Build** — CI/CD sur push `main`
  - Build Docker backend + frontend → Artifact Registry (`europe-west1`)
  - Deploy automatique vers Cloud Run
- [x] **CI GitHub Actions** — Lint & type check sur push/PR
- [x] **DNS & Domaines** — `wroket.com` + `www.wroket.com` + `api.wroket.com` (CNAME `ghs.googlehosted.com`)
- [ ] **Monitoring** — Cloud Monitoring alertes (latence, erreurs 5xx, usage Firestore)
