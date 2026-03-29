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
- [x] **Persistance JSON** — Données users, todos, notifications, collaborateurs, équipes, projets dans `local-store.json`
- [x] **Sécurité** — Helmet, CORS, rate limiting, validation inputs, bcrypt, cookies httpOnly
- [x] **Harmonisation UI** — Couleurs boutons slate-700 (light), responsive amélioré, formulaire 2 lignes
- [x] **Kanban Board** — Vue Kanban dans la partie Projets (tâches par phase, drag-style)
- [x] **Archives** — Archivage automatique des tâches terminées (>7j), page dédiée `/todos/archives`, restauration
- [x] **Calendrier & Slots** — Working hours dans paramètres, calcul de créneaux (3 propositions), booking sur une tâche
- [x] **Intégration Google Calendar** — OAuth2 natif (fetch), lecture/écriture agenda Google, token auto-refresh
- [x] **Agenda** — Vue calendrier semaine, fusion événements Wroket (code couleur Eisenhower) + Google Calendar
- [x] **Responsive mobile** — Viewport meta, sidebar hamburger, tableaux scrollables, badges wrap, bouton edit tactile
- [x] **Branding Wroket** — Identité visuelle (fusée + checkmark), palette Slate + Emerald, icône app, logo bicolore
- [x] **Page Notifications** — Page dédiée `/notifications` avec filtres (tous/lus/non-lus), actions par type
- [x] **Collaboration (accept/decline)** — Flux complet invitation collaborateur : accept/decline, réciprocité, notifications
- [x] **Page Équipes (cards)** — Vue d'ensemble avec 2 cards résumées (Collaborateurs + Teams), drill-down vers vue détaillée, badges de notification
- [x] **Webhooks sortants** — Intégrations Slack/Discord/Teams dans Paramètres, payloads formatés par plateforme, dispatch auto via notifications, bouton tester

## Fonctionnel mais à consolider

- [ ] **Sessions persistantes** — Persister les sessions dans `local-store.json` (perdues au redémarrage backend)
- [ ] **Changement de mot de passe** — Route `PUT /auth/password` + UI dans Paramètres
- [ ] **Paramètres > Historique** — Afficher l'historique des actions récentes
- [ ] **Paramètres > Administration** — Export JSON des données + suppression de compte

## Fonctionnalités manquantes

- [ ] **Recherche & tags** — Recherche textuelle dans les tâches, système de tags/labels
- [ ] **Commentaires sur tâches** — Ajouter des commentaires/notes à une tâche
- [ ] **Emails d'invitation** — Envoyer un email lors de l'invitation d'un collaborateur (Nodemailer/SendGrid, template, lien d'acceptation)
- [ ] **Notifications / rappels** — Alertes pour les deadlines proches (email ou in-app)
- [ ] **Tâches récurrentes** — Créer des tâches qui se répètent automatiquement
- [ ] **Pièces jointes** — Attacher des fichiers à une tâche

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

- [ ] **Bloc-notes (Notepad)** — Éditeur de notes fonctionnel en ligne et hors ligne
  - Synchronisation online/offline (Service Worker + IndexedDB local, sync au retour réseau)
  - Éditeur rich-text ou Markdown (support titres, listes, code, liens)
  - Commandes slash intégrées : `/task` pour créer une tâche depuis une note, `/assign` pour assigner, `/deadline` pour fixer une échéance, `/project` pour lier à un projet
  - Organisation : dossiers / tags / favoris
  - Questions ouvertes : gestion des conflits de sync (CRDT vs last-write-wins), taille max des notes, partage de notes entre membres d'une équipe, export (PDF, Markdown)

## Sécurité & Auth

- [ ] **Réinitialisation de mot de passe** — Flux "mot de passe oublié" par email
- [ ] **Vérification d'email** — Confirmer l'adresse email à l'inscription
- [ ] **OAuth / SSO** — Connexion via Google, GitHub, etc.

## Tests & Qualité

- [ ] **Tests unitaires backend** — Jest/Vitest pour services et controllers
- [ ] **Tests unitaires frontend** — Tests des composants React critiques
- [ ] **Tests E2E** — Playwright pour les parcours utilisateur

## Déploiement & Infrastructure

- [ ] **Phase 1 : Migration SQLite** — Remplacer `local-store.json` par SQLite (`better-sqlite3`)
  - Fichier `.db` unique sur disque, requêtes synchrones ultra-rapides
  - Zéro réseau, zéro quota, zéro coût — compatible e2-micro
  - Backup simple : `gsutil cp` du fichier .db vers Cloud Storage
  - Pertinent tant que l'architecture reste single-instance
- [ ] **Phase 2 : Migration Firestore ou PostgreSQL** — Si scaling multi-instance nécessaire
  - Firestore : si passage à Cloud Run avec auto-scaling (NoSQL, Free Tier 50k lectures/jour)
  - PostgreSQL (Cloud SQL) : si besoin de requêtes complexes, reporting, full-text search (~$7-10/mois)
  - Décision à prendre quand la base dépasse 100 utilisateurs actifs
- [ ] **Sizing VM** — e2-micro (0.25 vCPU, 1 Go) suffisant en phase beta (<20 users). Passer à e2-small (0.5 vCPU, 2 Go, ~$5-7/mois) au-delà de 10 users actifs simultanés ou si `local-store.json` dépasse 5 Mo
- [ ] **Déploiement frontend** — Build Next.js + Nginx ou Cloud Run sur la VM GCP
- [ ] **CI/CD** — Pipeline GitHub Actions (lint, test, build, deploy)
- [ ] **HTTPS / domaine** — Certificat SSL + nom de domaine
