# Cadrage V1 — Contacts (Collaborations) + import Notion People

Document de travail pour corriger l’import **People → tâches** et introduire un répertoire **Contacts** distinct des **Collaborateurs** Wroket.

**Dernière mise à jour** : 2026-06-14  
**Statut** : cadrage validé — prêt pour implémentation par slices  
**Liens** : [ROADMAP § Acquisition Notion](../ROADMAP.md#acquisition--migration-notion--monday) · [externalSyncService](../backend/src/services/externalSyncService.ts) · [teams/page.tsx](../frontend/src/app/teams/page.tsx)

---

## 1. Problème & opportunité

### Constats

- Le pull Notion (`buildNotionDatabaseSnapshot`) traite **toute base** comme un **projet** : chaque page → tâche, avec phases dérivées du statut ou « Général ».
- Une base **People** (CRM léger Notion) produit donc des « tâches » sans sens (ex. « Jean Dupont », « Acme Corp »).
- La zone **Collaborations** (`/teams`) gère des **collaborateurs Wroket** : `{ email, status }` + workflow d’invitation — pas un carnet d’adresses enrichi.
- Les « contacts » actuels dans l’app = pool d’**emails** (`listKnownContactEmails`) pour l’autocomplétion d’assignation.

### Objectif V1

Offrir un **répertoire Contacts** (nom, prénom, entreprise, email, téléphone, tags) sous **Collaborations**, avec **import / sync pull** depuis une base Notion People, **sans** devenir un CRM (pas de pipeline, deals, activités commerciales).

### Non-objectifs V1

| Exclu | Raison |
|-------|--------|
| CRM complet (pipeline, opportunités, scoring) | Hors positionnement Wroket (cf. ROADMAP non-objectifs Monday CRM) |
| Push Wroket → Notion | Sync uni-directionnelle pull, comme projets |
| Fusion Contacts ↔ Collaborateurs | Deux entités, lien optionnel « Inviter comme collaborateur » |
| Import ZIP People (CSV export Notion) | V1 = **API OAuth** uniquement ; ZIP People = slice ultérieure si demande |
| Contacts par projet (stakeholders) | V2 — V1 = répertoire utilisateur (perso) |
| Champs personnalisés libres sur contact | V1 = schéma fixe ; mapping Notion → champs connus |

---

## 2. Principes produit

1. **Contacts ≠ Collaborateurs** — un contact peut exister sans compte Wroket ; un collaborateur est toujours lié à un email et un statut d’invitation.
2. **Choix explicite du type d’import** — à la sélection d’une base Notion : « Projet » ou « Contacts » (avec suggestion auto).
3. **Idempotence** — re-sync sans doublons via `externalRef` (page id Notion).
4. **Miroir borné** — seuls les champs mappés depuis Notion sont écrasés au pull ; notes locales Wroket (si ajoutées en V1.1) restent intactes.
5. **Pas de suppression automatique** — contact absent du snapshot Notion = **orphelin signalé**, jamais supprimé (aligné `externalSyncService`).

---

## 3. Audit de dépendances (gate complétude)

| Fichier / zone | Rôle aujourd’hui | Impact V1 |
|----------------|------------------|-----------|
| `backend/src/services/notionApiService.ts` | Pull base → `SyncSnapshot` tâches | **+** `buildNotionContactsSnapshot`, `detectNotionDatabaseKind`, garde-fou projet |
| `backend/src/services/externalSyncService.ts` | Upsert projet/phases/tâches | Inchangé pour projets ; **ne pas** forcer Contacts dans ce moteur |
| `backend/src/services/externalRef.ts` | Identité externe Todo/Project/Phase | Réutiliser tel quel sur `Contact` |
| `backend/src/services/externalConnectionService.ts` | Tokens OAuth Notion | Inchangé |
| `backend/src/controllers/integrationsController.ts` | Routes sync projet Notion | **+** preview/confirm contacts sync |
| `backend/src/routes/integrationRoutes.ts` | Montage `/integrations` | **+** routes contacts |
| `backend/src/persistence.ts` | Domaines store | **+** domaine `contacts` |
| `backend/src/services/teamService.ts` | Collaborateurs, emails connus | **+** fusion suggestions ; pas de merge modèle |
| `backend/src/controllers/teamController.ts` | API collaborateurs | **+** ou nouveau `contactController` |
| `frontend/src/app/teams/page.tsx` | UI Collaborations | **+** section / carte Contacts |
| `frontend/src/app/migrate/notion/page.tsx` | Wizard import Notion | **+** choix type base, flux contacts |
| `frontend/src/app/settings/page.tsx` | Connexions applicatives | Lien « Importer des contacts » → migrate |
| `frontend/src/components/ContactEmailSuggestInput.tsx` | Autocomplétion email | **V1.1** enrichissement nom/entreprise |
| `frontend/src/lib/api/integrations.ts` | Client API intégrations | **+** endpoints contacts sync |
| `frontend/src/lib/i18n.ts` | Libellés | **+** clés contacts |
| `frontend/src/components/AppShell.tsx` | Recherche globale contacts emails | Optionnel V1.1 : afficher fiches Contacts |
| `ROADMAP.md` | Priorisation | Entrée Contacts + lien ce doc |

**Exemptions V1** : import ZIP (`notionImportService`), Monday, webhooks, RGPD export (slice dédiée — voir §10).

---

## 4. Modèle de données

### 4.1 Entité `Contact`

```ts
interface Contact {
  id: string;                    // UUID Wroket
  ownerUid: string;              // propriétaire (répertoire perso V1)
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;          // normalisé lowercase si présent
  phone: string | null;          // stockage libre, trim
  tags: string[];                // max 10, lowercase trim (comme todos)
  externalRef: ExternalRef | null;
  createdAt: string;             // ISO
  updatedAt: string;
  lastSyncedAt: string | null;   // redondant avec externalRef.lastSyncedAt — affichage UI
}
```

**Règles de validation**

- Au moins **un** des champs identifiants : `(firstName + lastName)` non vides, ou `email`, ou `phone`.
- `email` : format valide si renseigné (`assertValidEmailFormat`).
- `tags` : max 10, chaque tag ≤ 40 caractères.
- `firstName` / `lastName` : max 80 caractères chacun ; `company` max 120.

**Déduplication à l’import**

1. Priorité : `externalRef` (Notion page id).
2. Sinon : `email` normalisé (si présent des deux côtés).
3. Sinon : création (pas de fuzzy match nom en V1 — trop risqué).

### 4.2 Persistance

- Nouveau domaine Firestore / local : **`contacts`** — structure recommandée :
  - `Record<ownerUid, Contact[]>` ou shard par uid (comme `collaborators`).
- **Pas** de migration destructive au déploiement : domaine vide par défaut.
- Index en mémoire : par `ownerUid`, par `externalRefKey`, par `email` (owner-scoped).

### 4.3 Distinction Collaborateur

| | `Collaborator` | `Contact` |
|---|----------------|-----------|
| Stockage | `collaboratorsByUser` | `contacts` domain |
| Champs | email, status | fiche complète + tags |
| Permissions | invitation, partage tâches | lecture/écriture owner uniquement V1 |
| Lien | — | action UI « Inviter » → `inviteCollaborator(email)` si email présent |

---

## 5. Détection base Notion « People »

Heuristique **score** sur le schéma de la base (propriétés Notion), exécutée côté API à la liste / preview :

| Signal | Points |
|--------|--------|
| Propriété type `email` | +3 |
| Propriété type `phone_number` | +2 |
| Nom normalisé contient `people`, `person`, `contact`, `client`, `crm` | +2 |
| Propriété `company` / `organisation` / `organization` (text ou select) | +2 |
| Propriété `status` type status/select **et** pattern tâche (`done`, `in progress`, …) | −2 |
| Propriété `due` / `deadline` / `start` type date | −2 |
| Propriété `effort` / `priority` | −1 |

- **Score ≥ 4** → suggestion `kind: "contacts"`.
- **Score ≤ 0** → suggestion `kind: "project"`.
- Entre les deux → `kind: "ambiguous"` — l’utilisateur choisit.

Expose :

```ts
type NotionDatabaseKind = "project" | "contacts" | "ambiguous";

interface NotionDatabaseSummary {
  id: string;
  title: string;
  propertyNames: string[];
  suggestedKind: NotionDatabaseKind;
  kindScore: number;
}
```

**Garde-fou V0 (slice immédiate recommandée)** : si `suggestedKind === "contacts"` et l’utilisateur tente un sync **projet**, renvoyer `422` + `code: NOTION_DATABASE_KIND_MISMATCH` avec CTA « Importer comme contacts ».

---

## 6. Mapping Notion → Contact

### 6.1 Correspondance propriétés (convention + fallback)

| Champ Wroket | Types Notion acceptés | Clés recherchées (normalisées) |
|--------------|----------------------|--------------------------------|
| `firstName` / `lastName` | `title`, `rich_text` | Si une seule colonne `Name` / `Nom` : split premier token = prénom, reste = nom |
| `firstName` | `rich_text` | `first_name`, `prenom`, `prénom`, `given_name` |
| `lastName` | `rich_text` | `last_name`, `nom`, `family_name`, `surname` |
| `email` | `email` | `email`, `e-mail`, `mail` |
| `phone` | `phone_number` | `phone`, `telephone`, `téléphone`, `mobile`, `tel` |
| `company` | `rich_text`, `select` | `company`, `entreprise`, `organization`, `organisation`, `org` |
| `tags` | `multi_select` | `tags`, `labels`, `etiquettes`, `étiquettes`, `type`, `segment` |

Propriétés non mappées : **ignorées** en V1 (pas de custom fields contact).

### 6.2 Snapshot sync contacts

```ts
interface ContactSyncSnapshot {
  provider: "notion";
  connectionId: string;
  sourceDatabaseId: string;
  sourceLabel: string;
  contacts: ContactSyncSnapshotRow[];
}

interface ContactSyncSnapshotRow {
  externalId: string;       // Notion page id
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
}
```

### 6.3 Diff & apply (miroir borné)

Champs miroir (écrasés au update si présents dans le snapshot) :

`firstName`, `lastName`, `company`, `email`, `phone`, `tags`

**Jamais modifié** : `id`, `ownerUid`, `createdAt`, champs locaux futurs.

**Orphelins** : contacts avec `externalRef.externalParentId === databaseId` et page id absent du snapshot → listés dans `diff.orphans`, pas supprimés.

---

## 7. API (contrats V1)

### 7.1 CRUD Contacts

Préfixe proposé : `/contacts` (auth requise).

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/contacts` | Liste du owner (`?q=` recherche substring nom/email/entreprise, max 200) |
| `GET` | `/contacts/:id` | Détail |
| `POST` | `/contacts` | Création manuelle |
| `PATCH` | `/contacts/:id` | Édition (bloque écrasement champs miroir si `externalRef` ? — **non** : édition locale autorisée ; prochain sync Notion réécrase les champs miroir) |
| `DELETE` | `/contacts/:id` | Suppression (libère l’externalRef) |

### 7.2 Suggestions enrichies (V1.1 — optionnel slice 3)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/contacts/suggest?q=` | min 3 caractères ; retour `{ email, firstName, lastName, company }[]` |

En V1 minimal : étendre `GET /teams/contact-emails` ou nouveau endpoint — **ne pas** casser l’existant.

### 7.3 Sync Notion Contacts

Gate : `entitlements.integrations === true` (Small teams+), même que sync projet.

| Méthode | Route | Body | Réponse |
|---------|-------|------|---------|
| `POST` | `/integrations/notion/preview-contacts-sync` | `{ databaseId }` | `{ snapshot, diff, mappingWarnings[] }` |
| `POST` | `/integrations/notion/confirm-contacts-sync` | `{ databaseId }` | `{ created, updated, orphans, contacts[] }` |

Codes erreur :

| Code | Cas |
|------|-----|
| `NOTION_NOT_CONNECTED` | Pas de connexion OAuth |
| `NOTION_DATABASE_KIND_MISMATCH` | Base détectée People sur endpoint projet (garde-fou) |
| `NOTION_CONTACTS_KIND_MISMATCH` | Base détectée projet sur endpoint contacts |
| `NOTION_API_ERROR` | Erreur API Notion |
| `INTEGRATIONS_PLAN_REQUIRED` | Palier insuffisant |

### 7.4 Extension liste bases

`GET /integrations/notion/databases` — enrichir chaque entrée avec `suggestedKind` + `kindScore`.

---

## 8. UI / parcours utilisateur

### 8.1 Collaborations — nouvelle section Contacts

**Page** : `/teams` (existant) — ajouter une **3ᵉ carte** sur l’overview :

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Collaborateurs  │  │ Équipes         │  │ Contacts        │
│ invitations     │  │ workspaces      │  │ répertoire      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Vue Contacts** (`activeSection === "contacts"`) :

- Barre recherche + bouton **Ajouter**
- Table / liste : Nom complet, Entreprise, Email, Téléphone, Tags (chips), badge « Notion » si `externalRef`
- Clic ligne → panneau latéral ou modale édition
- Actions : Éditer, Supprimer, **Inviter comme collaborateur** (si email), **Synchroniser depuis Notion** (si intégrations actives)
- État vide : CTA « Importer depuis Notion » + « Ajouter un contact »

**i18n** : préfixe `contacts.*` + `teams.contactsCard*`.

### 8.2 Wizard `/migrate/notion`

Évolution du flux actuel :

1. Onglet **API** — après sélection de la base :
   - Bandeau si `suggestedKind === "contacts"` : « Cette base ressemble à un répertoire People — importer comme contacts ? »
   - Boutons : **Importer comme contacts** | **Importer comme projet** (secondaire, confirmation)
2. Nouveau sous-flux **Contacts** :
   - Aperçu diff (créations / mises à jour / orphelins)
   - Warnings mapping (ex. « Colonne téléphone introuvable »)
   - Confirmer → redirect `/teams?section=contacts` + toast succès
3. Onglet ZIP : inchangé V1 (reste projet) ; note d’aide « export People → utiliser la connexion API »

### 8.3 Paramètres → Intégrations

Lien secondaire sous Notion connecté : « Synchroniser des contacts » → `/migrate/notion?mode=contacts`.

---

## 9. Entitlements, quotas, coûts

| Action | Palier V1 |
|--------|-----------|
| CRUD Contacts manuel | **Tous les paliers** (comme collaborateurs) |
| Sync API Notion Contacts | **Small teams+** (`integrations`) |
| Détection / preview | **Small teams+** (aligné sync projet) |

**Quotas volume** : pas de plafond Free dédié en V1 (contacts légers). Limite technique anti-abus : **2 000 contacts / owner** ; sync batch max **1 000 pages** par base (aligné `MAX_PAGES` Notion).

**Firestore** : 1 doc ou tableau par user — acceptable Free Tier si < 2k contacts ; pas de shard V1.

---

## 10. RGPD & export

- **Export self-service** (`getMyExport`) : inclure `contacts[]` (sans tokens).
- **Suppression compte** : purger contacts du `ownerUid`.
- **Droit d’accès** : contacts strictement privés au owner en V1 — pas de partage équipe.

---

## 11. Plan de livraison par slices

### Slice 0 — Garde-fou People (1–2 j) ✅ livré 2026-06-14

- [x] `detectNotionDatabaseKind` dans `notionApiService`
- [x] Enrichir `listNotionDatabases` + UI migrate : bandeau suggestion
- [x] `422 NOTION_DATABASE_KIND_MISMATCH` sur confirm sync **projet** si kind = contacts
- [x] Tests unitaires heuristique (bases People / Tasks fixtures)

**Bénéfice user** : fin des imports People → tâches par erreur.

### Slice 0b — Robustesse import projet Notion (Tasks Tracker) ✅ livré 2026-06-14

- [x] Mapping natif `Effort level` / `Priority level` → champs Wroket `effort` / `priority`
- [x] Options `select` custom : schéma Notion DB + union runtime (plus d’échec `option invalide`)
- [x] Extension options sur re-sync (`ensureCustomFieldDefsOnProject`)
- [x] `mappingReport` dans preview-sync + bandeau UI `/migrate/notion`
- [x] Tests `notionApiMapping.test.ts` + re-sync select dans `externalSyncService.test.ts`

**Bénéfice user** : sync Tasks Tracker Notion sans toast « Effort level : option invalide ».

### Slice 1 — Fondation Contacts (2–3 j) ✅ livré 2026-06-14

- [x] Domaine `contacts` + `contactService` (CRUD, dédup)
- [x] Routes `/contacts` + tests service
- [x] UI `/teams` section Contacts (liste + CRUD manuel)
- [x] i18n FR/EN

### Slice 2 — Sync Notion Contacts (2–3 j) ✅ livré 2026-06-14

- [x] `buildNotionContactsSnapshot` + `contactSyncService` (diff/apply)
- [x] `preview-contacts-sync` / `confirm-contacts-sync`
- [x] Flux `/migrate/notion` mode contacts
- [x] Tests : idempotence, orphelins, mapping colonnes

### Slice 3 — Polish (1–2 j, optionnel V1)

- [x] `GET /contacts/suggest` + enrichir `ContactEmailSuggestInput` (nom + entreprise)
- [x] Action « Inviter comme collaborateur » depuis fiche contact
- [x] Entrée recherche globale AppShell (contacts nom/email + bases)
- [ ] Checklist E2E § Contacts (validation manuelle restante)

**Estimation totale V1** : ~6–10 j développeur selon polish.

---

## 12. Checklist E2E minimale (gate « done »)

### Nominal

- [ ] Créer un contact manuel depuis `/teams` → Contacts
- [ ] Connecter Notion (Settings) → choisir base People → preview diff → confirm
- [ ] Re-sync même base → 0 doublon, champs mis à jour
- [ ] Contact avec email → « Inviter comme collaborateur » → entrée dans liste collaborateurs

### Permissions / palier

- [ ] Compte Free : CRUD manuel OK ; sync API → message upgrade Small teams
- [ ] Compte Small teams+ : sync OK

### Erreurs

- [ ] Base projet importée comme contacts → warning ou mismatch explicite
- [ ] Base People importée comme projet → `422` + CTA contacts
- [ ] Notion déconnecté → `NOTION_NOT_CONNECTED` message actionnable

### Régression

- [ ] Sync projet Notion (base tâches) inchangé
- [ ] Collaborateurs / équipes inchangés
- [ ] `ContactEmailSuggestInput` existant fonctionne (emails collaborateurs)

---

## 13. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Heuristique People faux positif/négatif | Choix utilisateur explicite ; score affiché en debug UI optionnel |
| Édition locale écrasée au sync | Badge « Géré par Notion » sur fiche + tooltip (pattern `TaskEditModal`) |
| Scope creep CRM | Schéma fixe V1 ; pas de champs custom contact |
| Confusion Contacts / Collaborateurs | Libellés distincts, cartes séparées, doc aide |
| Coût Firestore | Cap 2k / user ; pas de sync auto planifiée V1 |

---

## 14. Évolutions V2 (hors V1)

- Contacts **par équipe** (`teamId` sur Contact)
- Import ZIP People (CSV export)
- Liaison contact ↔ tâche / projet (stakeholder)
- Sync planifiée (webhook Notion si dispo)
- Champs custom contact + mapping UI avancé

---

## 15. Fichiers à créer (implémentation)

```
backend/src/services/contactService.ts
backend/src/services/contactSyncService.ts
backend/src/controllers/contactController.ts
backend/src/routes/contactRoutes.ts
backend/src/services/contactSyncService.test.ts
backend/src/services/notionContactsDetection.test.ts

frontend/src/lib/api/contacts.ts
frontend/src/app/teams/_components/ContactsSection.tsx   (optionnel extraction)
```

## 16. Fichiers à modifier (implémentation)

```
backend/src/persistence.ts
backend/src/app.ts
backend/src/services/notionApiService.ts
backend/src/controllers/integrationsController.ts
backend/src/routes/integrationRoutes.ts
frontend/src/app/teams/page.tsx
frontend/src/app/migrate/notion/page.tsx
frontend/src/lib/api/integrations.ts
frontend/src/lib/api/index.ts
frontend/src/lib/i18n.ts
ROADMAP.md
```

---

## 17. Robustesse import Notion (projets) — Slice 0b

### Diagnostic

Lors d’un sync API sur une base **Tasks Tracker** Notion, l’erreur `Champ « Effort level » : option invalide` provenait de :

1. **Colonne non réservée** — `Effort level` (`effort_level`) n’était pas dans les candidats natifs → mappée en champ personnalisé `select`.
2. **Options incomplètes** — seule la première valeur vue par page alimentait `def.options` → les autres pages échouaient à `validateCustomFieldValues`.

### Correctifs livrés

| Zone | Changement |
|------|------------|
| `notionApiService.ts` | Candidats `effort_level`, `priority_level` ; `buildSchemaSelectOptions` ; `registerSelectCustomFieldDef` ; `mappingReport` |
| `notionImportService.ts` | Alias CSV + `mapNotionEffort` (`Low`→`light`, `High`→`heavy`) |
| `externalSyncService.ts` | Extension options `select` existantes au re-sync |
| `integrationsController.ts` | `mappingReport` dans preview |
| `migrate/notion/page.tsx` | Bandeau correspondance colonnes ; bouton confirm aligné sur `diff.summary` |

### Règles mapping natif (complément §6)

| Champ Wroket | Candidats API normalisés |
|--------------|------------------------|
| `effort` | `effort_level`, `effort`, `charge`, `size`, `taille`, … |
| `priority` | `priority_level`, `priority`, `priorite`, … |
| `deadline` (échéance) | `due_date`, `due`, `deadline`, `échéance`, … |
| `description` | `description`, `notes`, `body`, … → **commentaire miroir** (`mirroredFrom: notion-description`) |

Colonnes `select` / `status` non réservées → champs personnalisés avec **union** schéma Notion + valeurs pages (max 20 options).

### Checklist E2E import projet

- [ ] Base **Tasks Tracker** → preview → confirm sans `option invalide`
- [ ] Tâches avec `effort` natif (pas de custom « Effort level »)
- [ ] Re-sync `merge` / `create_new` idempotent
- [ ] Colonne `select` custom multi-valeurs → toutes options sur le projet

---

*Ce document fait foi pour la V1 Contacts jusqu’à mise à jour explicite. En cas de tension avec `data-safety.mdc` : pas de wipe contacts au deploy ; migrations nommées uniquement.*
