# Cadrage V1 — Monday Docs → Documents Wroket

Document de travail pour importer / synchroniser (pull) les **Monday Workdocs** vers les **Documents** Wroket (`/notes`), en complément de l’import **boards → projets** déjà livré.

**Dernière mise à jour** : 2026-06-15  
**Statut** : S1–S4 implémentés (2026-06-15) — validation E2E prod/local restante  
**Liens** : [ROADMAP § Monday-Like](../ROADMAP.md#monday-like-priorité-acquisition-pmo-léger) · [mondayApiService](../backend/src/services/mondayApiService.ts) · [noteService](../backend/src/services/noteService.ts) · [contacts-notion-v1.md](contacts-notion-v1.md) (pattern sync dédié)

---

## 1. Problème & opportunité

### Constats

- L’import Monday **API + CSV** ne couvre que les **tableaux (boards)** → projets Wroket (phases, tâches, sous-tâches).
- Les **Monday Docs** (Workdocs : specs, CR, wiki d’équipe) restent hors périmètre ; les utilisateurs qui migrent depuis Monday s’attendent à retrouver aussi leur documentation.
- Wroket stocke déjà des **documents** riches (HTML contenteditable, dossiers, tags) sous **Données › Documents** ; l’onglet **Docs** sur un projet liste les notes avec `projectId`.
- Le moteur `externalSyncService` est **spécialisé projets** ; les Contacts et les Bases ont des sync dédiées (`contactSyncService`, `dataSyncService`). Les Docs Monday doivent suivre le même modèle — **pas** forcer un `SyncSnapshot` projet.

### Objectif V1

Permettre à un utilisateur **Small teams+** connecté à Monday de :

1. **Lister** ses Workdocs accessibles (par workspace).
2. **Prévisualiser** le diff (création / mise à jour titre+contenu / orphelins signalés).
3. **Importer ou re-synchroniser** un ou plusieurs docs vers **Documents Wroket**, de façon **idempotente** (`externalRef` Monday).

### Non-objectifs V1

| Exclu | Raison |
|-------|--------|
| Push Wroket → Monday | Pull uni-directionnel (aligné boards / Notion) |
| Clone pixel-perfect de l’éditeur Monday | Widgets, embeds board, apps Monday non portables |
| Import des **updates** / commentaires du doc Monday | Hors scope ; contenu principal uniquement |
| Pièces jointes / images inline Monday | Slice V1.1 si `assets:read` + stockage Wroket |
| Docs attachés à un **item** Monday (colonne Doc) en auto-lien tâche | Complexité mapping item↔tâche ; V1 = doc autonome ou lien projet **manuel** |
| Import ZIP / export manuel Monday Docs | V1 = **API OAuth** uniquement |
| Sync temps réel / webhooks Monday | Signing secret non utilisé aujourd’hui |
| Workforms, dashboards, CRM Monday | ROADMAP non-objectifs Monday Work OS |

---

## 2. Principes produit

1. **Boards ≠ Docs** — deux onglets distincts dans `/migrate/monday` : « Projet (board) » (existant) et « Documents (docs) » (nouveau).
2. **Destination = Documents Wroket** — pas de nouveau type d’entité ; réutiliser `Note` avec `externalRef`.
3. **Miroir borné** — au re-sync, seuls **titre** et **contenu** issus de Monday sont écrasés ; épinglage, tags locaux, partage équipe, dossier (si modifié localement après import) restent sous contrôle utilisateur (cf. §6).
4. **Idempotence** — clé `monday:{docId}` (id interne Monday `docs.id`, pas seulement `object_id` URL).
5. **Orphelins jamais supprimés** — doc absent du snapshot = signalé dans le preview, jamais archivé automatiquement.
6. **Reconnect OAuth** — ajout du scope `docs:read` oblige une **reconnexion** Monday (comme pour `boards:read`).

---

## 3. API Monday (référence technique)

### Scopes OAuth

| Scope | Usage V1 |
|-------|----------|
| `boards:read` | Déjà requis (import projets) |
| `docs:read` | **Nouveau** — lister docs + exporter contenu |

Configurer dans Monday Dev Center → **OAuth & Permissions** : cocher `docs:read` en plus de `boards:read`.  
Côté Wroket : étendre `MONDAY_OAUTH_SCOPES` (ex. `boards:read docs:read` — **liste exacte = scopes cochés Monday**).

### Endpoints GraphQL utilisés

```graphql
# Liste (pagination limit/page, filtre workspace_ids optionnel)
query {
  docs(limit: 50, workspace_ids: [123]) {
    id
    object_id
    name
    workspace_id
    updated_at
    url
  }
}

# Export contenu → markdown (API 2025-10+)
query ($docId: ID!) {
  export_markdown_from_doc(docId: $docId) {
    success
    markdown
    error
  }
}
```

**Alternative rejetée V1** : parser les `blocks` (format delta JSON) — plus fragile et coûteux en complexité API que `export_markdown_from_doc`.

### Contraintes API

- **Complexité** : un export par document ; limiter batch (ex. 20 docs / preview).
- **Version API** : header `API-Version: 2025-10` (ou plus récent) si requis pour `export_markdown_from_doc`.
- **Rate limit** : réutiliser pattern rate-limit preview existant (`mondayPreviewLimiter`).

---

## 4. Mapping Monday → Wroket

| Monday | Wroket `Note` |
|--------|----------------|
| `docs.name` | `title` |
| `export_markdown_from_doc.markdown` | `content` (HTML — voir §5) |
| `docs.id` | `externalRef.externalId` |
| — | `externalRef.provider` = `"monday"` |
| — | `externalRef.connectionId` = connexion OAuth |
| Workspace (optionnel) | `folder` = `Monday` ou `Monday / {workspaceName}` |
| Lien projet (optionnel UI) | `projectId` si l’utilisateur rattache à un projet Wroket déjà importé |

**Contenu** : l’éditeur Wroket attend du **HTML** (`contenteditable`). Le markdown exporté Monday doit être converti à l’import (voir §5).

---

## 5. Conversion Markdown → HTML (décision technique)

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **A — Lib légère** (`marked` ou équivalent) | Rendu correct titres/listes | Nouvelle dépendance backend (validation humaine) |
| **B — HTML minimal maison** | Zéro dépendance | Listes/tableaux/code mal rendus |
| **C — Stocker le markdown brut** | Fidèle à la source | Casse l’éditeur actuel (HTML) ; refactor UI |

**Recommandation V1** : **Option A** avec allowlist HTML sanitisée (titres, p, ul/ol, strong, em, code, blockquote, a) — aligné risque XSS notes existant.

**Fallback** : si `export_markdown_from_doc` échoue, note créée avec titre + bandeau « contenu non exportable » + lien `docs.url` en HTML.

---

## 6. Modèle de données

### Extension `Note`

```ts
interface Note {
  // … champs existants …
  externalRef?: ExternalRef | null;  // NOUVEAU — même forme que Contact / Todo
}
```

- Persistance : `store/notes` (pas de nouveau domaine Firestore).
- Hydratation : `normalizeExternalRef` dans `noteService` (comme `contactService`).
- Index recherche : inchangé (titre + contenu déjà indexés).

### Snapshot dédié (pas `SyncSnapshot`)

```ts
interface MondayDocSnapshot {
  provider: "monday";
  connectionId: string;
  docs: Array<{
    externalId: string;       // docs.id
    objectId: string;         // docs.object_id (URL)
    title: string;
    markdown: string;
    workspaceId: string | null;
    workspaceName: string | null;
    sourceUrl: string | null;
    updatedAt: string | null;
  }>;
}
```

### Moteur `mondayDocSyncService` (nouveau)

Inspiré de `contactSyncService.ts` :

- `computeMondayDocSyncDiff(ownerUid, snapshot, opts?)` → creates / updates / orphans
- `applyMondayDocSyncDiff(ownerUid, snapshot, opts?)` → upsert notes
- Champs miroir : `title`, `content` uniquement
- `importMode` : `merge` | `create_new` (suffixe `:copy-{uuid}` sur externalId)

---

## 7. API backend (proposition)

Préfixe : `/integrations/monday/docs` (auth + entitlement `integrations`).

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/integrations/monday/docs` | Liste docs Monday (query `workspaceId?`) |
| POST | `/integrations/monday/docs/preview-sync` | Body `{ docIds: string[], projectId?, folder?, importMode? }` |
| POST | `/integrations/monday/docs/confirm-sync` | Applique le diff |

**Pas de route publique** : callback OAuth inchangé.

### Fichiers impactés (audit dépendances)

| Fichier / zone | Rôle | Impact V1 |
|----------------|------|-----------|
| `backend/src/services/mondayOAuthService.ts` | OAuth scopes | **+** `docs:read` dans `MONDAY_OAUTH_SCOPES` |
| `backend/src/services/mondayApiService.ts` | GraphQL boards | **+** `listMondayDocs`, `exportMondayDocMarkdown` |
| `backend/src/services/mondayDocSyncService.ts` | — | **Nouveau** diff/apply |
| `backend/src/services/mondayDocSyncService.test.ts` | — | Tests diff/idempotence |
| `backend/src/services/noteService.ts` | CRUD notes | **+** `externalRef`, findByExternalRef |
| `backend/src/services/externalRef.ts` | Types provider | Inchangé (`monday` déjà présent) |
| `backend/src/controllers/integrationsController.ts` | Monday handlers | **+** list/preview/confirm docs |
| `backend/src/routes/integrationRoutes.ts` | Routes | **+** 3 routes docs |
| `backend/src/controllers/noteController.ts` | API notes | Lecture `externalRef` exposée si besoin UI |
| `backend/src/services/rgpdService.ts` | Export RGPD | Inclure `externalRef` notes |
| `frontend/src/app/migrate/monday/page.tsx` | Wizard Monday | **+** onglet / section Documents |
| `frontend/src/lib/api/mondayImport.ts` | Client API | **+** listDocs, preview/confirm doc sync |
| `frontend/src/lib/i18n.ts` | Libellés | **+** clés migrate.monday.docs* |
| `frontend/src/app/notes/page.tsx` | Éditeur | Optionnel : badge « Sync Monday » si externalRef |
| `frontend/src/app/projects/_components/ProjectDocsTab.tsx` | Docs projet | Optionnel V1 : filtre notes importées Monday |
| `cloudbuild.yaml` | Secrets | Inchangé (mêmes `MONDAY_*`) |
| `ROADMAP.md` | Priorisation | Entrée + lien ce doc |

**Exemptions V1** : `externalSyncService`, import CSV Monday, webhooks, `ProjectShareLinksPanel`.

---

## 8. UX — `/migrate/monday`

### Structure proposée

```
[ Sync via API ] [ CSV board ] [ Documents ]   ← 3e onglet

Documents Monday
├── Workspace (select, optionnel — défaut : tous accessibles)
├── Liste docs (checkboxes multi-select)
├── Dossier Wroket (défaut : "Monday")
├── Rattacher au projet (select optionnel — projets owner)
├── Mode : Fusionner | Créer nouvelles copies
├── [Aperçu] → diff créations / mises à jour / orphelins
└── [Confirmer l'import]
```

### Messages d’erreur actionnables

| Code | UX |
|------|-----|
| `MONDAY_DOCS_SCOPE_MISSING` | « Reconnectez Monday — permission Documents requise » + lien Paramètres |
| `MONDAY_DOC_EXPORT_FAILED` | Doc listé mais contenu partiel ; lien source Monday |
| `MONDAY_API_ERROR` | Toast + requestId |

### i18n FR/EN obligatoire (gate E2E).

---

## 9. Entitlements & quotas

| Règle | Valeur |
|-------|--------|
| Connexion Monday + sync docs | **Small teams+** (`integrations` entitlement) — identique boards |
| Quota notes Free | Existant (`FREE_TIER_MAX_PERSONAL_NOTES`) — import partiel + modale upgrade si dépassement (pattern import projet) |
| Coût import | Gratuit (pas de quota dédié migration — cf. `docs/plan-quotas.md`) |

---

## 10. Sécurité & données

- Tokens Monday : déjà dans `externalConnectionService` (chiffré local / Secret Manager prod).
- Contenu doc : traité comme note utilisateur (RGPD export `/auth/my-export`).
- Pas de logging du markdown complet en prod (titre + docId seulement).
- Sanitisation HTML post-conversion markdown.

---

## 11. Slices d’implémentation (ordre recommandé)

| Slice | Livrable | Estimation |
|-------|----------|------------|
| **S1** | `Note.externalRef` + persistence + tests régression notes | 0,5 j |
| **S2** | `mondayApiService` : list docs + export markdown + scope OAuth | 1 j |
| **S3** | `mondayDocSyncService` + routes preview/confirm + tests | 1 j |
| **S4** | UI onglet Documents `/migrate/monday` + i18n | 1 j |
| **S5** | E2E manuel checklist + doc utilisateur Paramètres | 0,5 j |

**Total indicatif** : ~4 j développeur.

### Checklist E2E V1 (done = tout coché)

- [ ] Monday Dev : scopes `boards:read` + `docs:read` ; reconnect OAuth prod + local
- [ ] Liste docs non vide (compte test avec Workdocs)
- [ ] Preview : création note dans dossier `Monday`
- [ ] Re-sync : modification titre Monday → update Wroket ; tags locaux préservés
- [ ] Idempotence : double confirm sans doublon
- [ ] Free tier : dépassement quota notes → message actionnable
- [ ] RGPD export contient notes avec `externalRef.monday`
- [ ] Régression : import board Monday inchangé

---

## 12. Risques résiduels

| Risque | Mitigation |
|--------|------------|
| `invalid_scope` si désalignement Monday Dev / `MONDAY_OAUTH_SCOPES` | Doc + message reconnect ; scopes configurables via env |
| Export markdown incomplet (widgets Monday) | Avertissement dans preview `mappingReport.warnings` |
| Complexité API / timeouts sur gros docs | Limite taille markdown (ex. 500 Ko) ; troncature avec mention |
| Utilisateur édite note puis re-sync | Écrasement titre+contenu — **comportement attendu** (miroir borné) ; afficher dans l’aide import |

---

## 13. Alignement roadmap

- Complète **Monday-Like** au-delà de l’import board (déjà fonctionnel hors roadmap cochée).
- Alimente la future **Wiki projet** (ROADMAP : onglet Docs + `projectId`) via rattachement optionnel à l’import.
- Reste distinct de **Notion pages → Documents** (chantier séparé si pages Notion hors bases).

### Prochaine action

Valider ce cadrage → implémenter **S1** (`Note.externalRef`) en première PR reviewable.
