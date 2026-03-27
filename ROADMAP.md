# Wroket — Roadmap

## Fonctionnel mais à consolider

- [ ] **Sessions persistantes** — Persister les sessions dans `local-store.json` (perdues au redémarrage backend)
- [ ] **Changement de mot de passe** — Route `PUT /auth/password` + UI dans Paramètres
- [ ] **Paramètres > Historique** — Afficher l'historique des actions récentes
- [ ] **Paramètres > Administration** — Export JSON des données + suppression de compte

## Fonctionnalités manquantes (Backend + Frontend)

- [ ] **Teams (backend)** — Routes API : créer/lister équipes, inviter membres, accepter/refuser invitations
- [ ] **Projets** — CRUD projets, associer tâches à un projet, vue par projet
- [ ] **Assignation de tâches** — Attribuer une tâche à un collaborateur
- [ ] **Recherche & tags** — Recherche textuelle dans les tâches, système de tags/labels
- [ ] **Commentaires sur tâches** — Ajouter des commentaires/notes à une tâche
- [ ] **Emails d'invitation** — Envoyer un email lors de l'invitation d'un collaborateur (service email type Nodemailer/SendGrid, template, lien d'acceptation)
- [ ] **Notifications / rappels** — Alertes pour les deadlines proches (email ou in-app)
- [ ] **Tâches récurrentes** — Créer des tâches qui se répètent automatiquement
- [ ] **Pièces jointes** — Attacher des fichiers à une tâche

## Sécurité & Auth

- [ ] **Réinitialisation de mot de passe** — Flux "mot de passe oublié" par email
- [ ] **Vérification d'email** — Confirmer l'adresse email à l'inscription
- [ ] **OAuth / SSO** — Connexion via Google, GitHub, etc.

## Tests & Qualité

- [ ] **Tests unitaires backend** — Jest/Vitest pour services et controllers
- [ ] **Tests unitaires frontend** — Tests des composants React critiques
- [ ] **Tests E2E** — Playwright pour les parcours utilisateur

## Déploiement & Infrastructure

- [ ] **Migration Firestore** — Remplacer `local-store.json` par Firestore (Free Tier)
- [ ] **Déploiement frontend** — Build Next.js + Nginx ou Cloud Run sur la VM GCP
- [ ] **CI/CD** — Pipeline GitHub Actions (lint, test, build, deploy)
- [ ] **HTTPS / domaine** — Certificat SSL + nom de domaine
