# Wroket — Description fonctionnelle du logiciel

**Document préparé pour dépôt e-Soleau INPI**  
**Version :** 2026-06-15  
**Auteur :** _[À compléter]_  
**Titulaire des droits :** _[À compléter — voir TITULAIRE.md]_

---

## 1. Identification

| Élément | Détail |
|---------|--------|
| **Dénomination** | Wroket |
| **Nature** | Logiciel SaaS (Software as a Service) |
| **Domaine public** | https://wroket.com |
| **API production** | https://api.wroket.com |
| **Langues interface** | Français, Anglais (i18n) |

---

## 2. Objet du logiciel

Wroket est une plateforme web de **gestion de projets, de tâches et d'agenda** destinée aux professionnels et aux équipes. Elle combine :

- gestion de tâches personnelles et déléguées ;
- pilotage de projets (phases, Kanban, Gantt, jalons) ;
- agenda avec réservation de créneaux et synchronisation calendaires externes ;
- collaboration (équipes, commentaires, notifications, partage) ;
- notes et documentation projet ;
- intégrations avec des outils tiers (Notion, Monday.com, Google Calendar, Microsoft Outlook/Teams).

---

## 3. Modules techniques (architecture logicielle)

| Couche | Technologie | Rôle |
|--------|-------------|------|
| **Frontend** | Next.js 15, React, TypeScript, Tailwind CSS | Interface utilisateur, PWA, Web Push |
| **Backend** | Node.js, Express, TypeScript | API REST, authentification, intégrations OAuth |
| **Persistance** | Google Cloud Firestore | Données utilisateurs (tâches, projets, notes, etc.) |
| **Hébergement** | Google Cloud Run (europe-west1) | Production `wroket-web` + `wroket-api` |
| **CI/CD** | Cloud Build, GitHub Actions | Build Docker, déploiement automatique depuis `main` |
| **Facturation** | Stripe (webhooks, portail client) | Plans Free / Pro / Team |

---

## 4. Fonctionnalités principales (état au 2026-06-15)

### 4.1 Tâches et agenda

- CRUD tâches, sous-tâches, priorités, statuts, archives ;
- Vue « Ma semaine », templates de tâches ;
- Agenda multi-comptes (Google Calendar, Microsoft Outlook) ;
- Réservation de créneaux avec gestion des conflits ;
- Réunions Google Meet / Microsoft Teams (invitations externes).

### 4.2 Projets (PMO)

- Projets multi-phases, Kanban, Board, **Gantt interactif** (drag, resize) ;
- Dépendances entre tâches, jalons, champs personnalisés ;
- Portfolio équipe, liens de partage lecture seule ;
- Pilotage / steering, activity log.

### 4.3 Collaboration

- Équipes, rôles, délégation ;
- Commentaires avec mentions `@email` ;
- Notifications in-app, Web Push (PWA), centre de notifications ;
- Authentification Google SSO, Microsoft SSO, **2FA TOTP**.

### 4.4 Intégrations

- **Notion** : OAuth, import bases/contacts, migration ZIP ;
- **Monday.com** : OAuth, import boards ;
- **Calendriers** : Google et Microsoft Graph (multi-comptes) ;
- Documentation utilisateur intégrée (`/docs`, guides FR/EN).

### 4.5 Sécurité et conformité

- Chiffrement des secrets (Secret Manager GCP) ;
- RGPD : export et suppression de compte ;
- Monitoring drift données, `/health/ready`, alertes Cloud Monitoring.

---

## 5. Originalité et apports distinctifs

Le logiciel Wroket est une **œuvre originale** développée par son auteur. Les éléments suivants constituent des choix de conception et d'implémentation propres au projet :

- orchestration unifiée tâches / agenda / projets avec contraintes métier actionnables (modales de récupération, endpoint `move` atomique) ;
- persistance tâches v2 (`todos_v2`, un document Firestore par tâche) avec invalidation cross-replica ;
- couche d'intégrations Notion/Monday avec mapping de schémas et import idempotent ;
- UX multilingue et PWA avec notifications push multi-appareils.

Les bibliothèques tierces (React, Express, etc.) restent soumises à leurs licences respectives ; seul le code source propre à Wroket fait l'objet du présent dépôt.

---

## 6. Environnements

| Environnement | Usage |
|---------------|--------|
| **Production** | Cloud Run — Firestore `(default)` |
| **Développement local** | `USE_LOCAL_STORE=true`, fichier `local-store.json` (hors dépôt) |
| **VM GCP secondaire** | Environnement de test (non production) |

---

## 7. Références internes

- Roadmap produit : `ROADMAP.md` (extrait joint)
- Architecture : document `wroket-architecture` (joint)
- Archive source : `wroket-source-YYYY-MM-DD.zip` (jointe)
- Manifeste d'intégrité SHA-256 : `wroket-manifeste.txt` (joint)

---

_Document généré à partir du dépôt Git Wroket. Export PDF recommandé pour le dépôt INPI._
