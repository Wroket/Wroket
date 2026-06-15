# Cadrage V1 — Bases de données (Notes › Bases) + import Notion

Document de travail pour les bases tabulaires utilisateur sous Notes et le routage import Notion (Projet / Contacts / Bases).

**Dernière mise à jour** : 2026-06-14  
**Statut** : implémentation par vagues  
**Liens** : [contacts-notion-v1.md](contacts-notion-v1.md) · [ROADMAP.md](../ROADMAP.md)

---

## 1. Objectif

Offrir des **bases de données personnelles** (colonnes typées + lignes) dans Notes, distinctes des **documents** (notes HTML) et des **Contacts** (schéma fixe CRM léger).

Permettre l'import Notion API vers :
- **Projet** — base tâches (inchangé)
- **Contacts** — base People + mapping manuel
- **Bases** — bases génériques Notion

---

## 2. Non-objectifs V1

| Exclu | Raison |
|-------|--------|
| Push Wroket → Notion | Pull uni-directionnel |
| Formules / rollups Notion | Hors scope |
| Sync offline bases | Online-only V1 |
| Import ZIP → Bases | API OAuth uniquement |
| Fusion Contacts ↔ Bases | Entités séparées |

---

## 3. Modèle

### UserDatabase

- `id`, `ownerUid`, `name`, `columns[]`, `externalRef`, `defaultView` (`table` | `board`), timestamps

### DatabaseColumnDef

- `id`, `name`, `type` (`text` | `number` | `date` | `select` | `checkbox` | `email` | `phone`), `options?`, `externalKey?`

### DatabaseRow

- `id`, `databaseId`, `values` (columnId → valeur), `externalRef`, timestamps

**Caps** : 50 bases / owner, 5 000 lignes / owner, 30 colonnes / base.

---

## 4. API `/user-databases`

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/user-databases` | Liste bases owner |
| POST | `/user-databases` | Création |
| GET | `/user-databases/:id` | Détail + colonnes |
| PATCH | `/user-databases/:id` | Nom / colonnes |
| DELETE | `/user-databases/:id` | Suppression base + lignes |
| GET | `/user-databases/:id/rows` | Lignes |
| POST | `/user-databases/:id/rows` | Création ligne |
| PATCH | `/user-databases/:id/rows/:rowId` | Édition |
| DELETE | `/user-databases/:id/rows/:rowId` | Suppression |

---

## 5. Import Notion

### Routage

| `suggestedKind` | Destination |
|-----------------|-------------|
| `project` | Projet Wroket |
| `contacts` | Contacts (+ mapping manuel) |
| `ambiguous` | Choix utilisateur (projet / contacts / bases) |
| `data` | Bases Notes — **choix explicite** à l’import (jamais auto-suggéré par score) |

### Sync Bases

- `POST /integrations/notion/preview-data-sync`
- `POST /integrations/notion/confirm-data-sync`
- Moteur : `dataSyncService` (pattern `contactSyncService`)

### Contacts — mapping manuel

Mapping limité aux champs : `firstName`, `lastName`, `email`, `phone`, `company`, `tags`, `notes` (local).

---

## 6. Vagues

### Vague 1 — Fondation Bases (sans Notion) ✅

CRUD bases + colonnes + lignes, UI Notes › Bases (tableau).

### Vague 2 — Contacts notes + mapping ✅

Champ `Contact.notes` local ; assistant mapping Notion contacts.

### Vague 3 — Import Notion → Bases ✅

`buildNotionDataSnapshot`, wizard 3 destinations.

### Vague 4 — Vues Notion-like ✅ (MVP)

Board (groupe select), calendrier (date), relations entre bases (colonne `relation`).

---

## 7. UI Données

Section **« Données »** (ex-Bloc-notes) ; sous-section tabulaire **« Bases »** (évite confusion avec l’export compte dans Paramètres).

Navigation : tuile **Bases** + dossiers documents ; `?section=databases&db=…` pour deep-link post-import.

---

## 8. E2E minimale

- [x] Créer base + colonnes + lignes depuis Données › Bases (tests `userDatabaseService`)
- [x] Import Notion base générique → Bases, re-sync idempotent (tests `dataSyncService`)
- [x] Import People → Contacts avec mapping manuel ; commentaires locaux préservés (tests `contactService` + wizard UI)
- [ ] Base tâches → Projet (régression — validation manuelle / e2e existant)
- [x] Export RGPD inclut bases (test `exportUserData`)
