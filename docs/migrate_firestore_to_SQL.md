# Migration Firestore → SQL (Wroket)

Document de préparation : étapes, ordre recommandé et points d’attention. Il ne remplace pas une analyse métier détaillée ni un plan d’exécution daté ; il sert de grille pour piloter le chantier.

---

## 1. Recommandation : PostgreSQL (Cloud SQL sur GCP)

**Choix recommandé : PostgreSQL**, hébergé sur **Google Cloud SQL** (région alignée sur le reste du projet, p. ex. `europe-west1`), accessible depuis Cloud Run via **connecteur Cloud SQL** (Unix socket / Private IP selon config).

**Pourquoi Postgres plutôt que MySQL / autre**

| Critère | Postgres |
|--------|----------|
| Écosystème GCP / Cloud Run | Très bien supporté (Cloud SQL, Auth Proxy, IAM DB auth possible) |
| Modèle actuel Wroket | Données largement **JSON imbriqué** (un gros blob par domaine + shards todos) ; **JSONB** reste pertinent pour les **autres domaines** en phase 1 ; pour les **todos**, la **cible** est relationnelle (voir §1.1) |
| Cohérence / transactions | ACID, transactions multi-lignes utiles pour remplacer des écritures batch Firestore cohérentes |
| Requêtes futures | Index GIN sur JSONB, puis migration vers tables relationnelles sans changer de moteur |
| Concurrence lecture/écriture | Adapté à une API stateless avec pool de connexions |

**Alternatives à documenter si contraintes entreprise**

- **Cloud SQL MySQL** : faisable si l’équipe impose MySQL ; JSON moins riche que JSONB pour requêtes complexes.
- **AlloyDB** : si besoin de perf extrême ou HA renforcée — coût et complexité souvent disproportionnés pour la taille actuelle du modèle.
- **Spanner** : forte cohérence globale et scale horizontal ; **sur-dimensionné** tant que le modèle reste un monolithe API + une base régionale.

### 1.1 Cible schéma pour les todos : **table relationnelle (une ligne par tâche)**

Objectif projet : service SQL **performant**, **exploitable** (index, jointures, contraintes) et **isolation claire des données par utilisateur**. L’approche retenue est donc **une table `todos` (ou équivalent)** avec :

| Élément | Rôle |
|--------|------|
| **Une ligne par tâche** | Colonnes typées pour les champs métier (titre, statuts, dates, `project_id`, etc.) ; PK sur `id` (UUID, aligné sur le modèle actuel). |
| **`user_id` (propriétaire)** | Colonne **NOT NULL** sur le propriétaire du store de la tâche ; **index** (souvent composite `(user_id, …)` pour listes et filtres). Toute lecture/écriture métier passe par un filtre explicite `user_id = …` (sauf cas assignation / accès projet déjà gérés en app). |
| **FK / contraintes** | Vers `projects`, phases si modélisées, etc. — à définir selon granularité du reste de la migration. |
| **RLS (optionnel)** | **Row Level Security** PostgreSQL sur `user_id` (ex. via `current_setting('app.current_user_uid')`) en complément du filtre applicatif — défense en profondeur si une requête oublie le `WHERE`. |

**Ce qui n’est pas la cible durable** :

- **128 lignes JSONB** miroir Firestore : utile **uniquement** comme **pont d’ETL** ou phase transitoire (faible écart avec `persistence.ts` actuel), pas comme modèle final — plusieurs utilisateurs partagent la même ligne physique, peu d’index par colonne métier.
- **Une ligne par utilisateur avec un JSONB de toutes ses tâches** : meilleure isolation qu’un shard partagé, mais **moins** adapté qu’une ligne par tâche pour index, jointures, intégrité et requêtes fines.

L’ETL transforme donc le merge `todos[userId][todoId]` (shards + legacy) en **inserts** ligne à ligne dans `todos` avec `user_id` renseigné. Les phases B / D / F ci‑dessous partent de cette cible sauf mention d’une **phase transitoire** explicitement limitée dans le temps.

---

## 2. État des lieux Firestore dans Wroket (référence code)

### 2.1 Une seule collection logique

- Collection **`store`**, documents identifiés par **ID fixe** (pas de requêtes `where` / `orderBy` sur Firestore pour l’app métier — uniquement `get()` par chemin connu).
- Enveloppe document : **`{ data: <payload> }`** (le payload métier est dans `data`).

### 2.2 Domaines persistés (`DOMAINS` dans `backend/src/persistence.ts`)

Documents : `users`, `notifications`, `collaborators`, `teams`, `projects`, `sessions`, `webhooks`, `inviteLog`, `comments`, `notes`, `activityLog`, `attachments`, `pendingCommentMentions`, `pendingTwoFactor`.

### 2.3 Todos : sharding

- **`TODO_SHARD_COUNT = 128`** documents `store/todos_0` … `store/todos_127`.
- Répartition utilisateur : **`todoShardIndex(userId)`** (FNV-1a sur l’UID, modulo 128) — **ne doit pas changer** tant que des données existent (équivalent d’une clé de partition).
- Document legacy **`store/todos`** : encore lu au chargement pour compléter / réconcilier avec les shards (titres vides, etc.).

#### 2.3.1 Précision importante : ce n’est **pas** « un shard par utilisateur »

Dans Firestore, on n’a **pas** une allocation dynamique d’un document par user. On a **toujours au plus 128 documents** todos, quel que soit le nombre d’utilisateurs.

- Chaque doc `todos_k` stocke une carte **`userId → { todoId → tâche }`** pour **tous** les utilisateurs dont `todoShardIndex(uid) === k`.
- Plusieurs utilisateurs **partagent** le même document shard ; le nombre 128 est une constante de partitionnement, pas le nombre d’utilisateurs.

### 2.4 Persistance runtime

- Debounce **500 ms** sur marquage « dirty » ; **`flushNow()`** force écriture immédiate (SIGTERM, chemins critiques, et **flush après mutations todos** pour fiabiliser les réponses API).
- Batch Firestore avec limite d’ops par commit (chunking dans `persistence.ts`).

### 2.5 Chiffrement / legacy

- **`CRYPTO_KEK_BASE64`** : surtout pertinent pour scripts de migration historique (`migrateStripEncryption`, etc.) ; le runtime strippe **`encV1`** sur hydrate. Prévoir **même contrainte de secrets** si des données chiffrées résiduelles existent encore au moment de la migration SQL.

### 2.6 Scripts déjà présents (à réutiliser comme inspiration)

- `migrate:todos-shards`, `migrate:strip-encryption`, `reconcile:todo-titles-from-restore` — montrent les chemins de données et les cas limites (legacy vs shards, restauration).

---

## 3. Stratégie de migration (vue d’ensemble)

1. **Ne pas** « big bang » remplacer Firestore par SQL en un seul déploiement sans filet.
2. Approches possibles (à trancher selon risque / charge équipe) :
   - **Strangler** : nouvelle couche `Repository` SQL derrière les services ; Firestore en lecture seule puis coupure.
   - **Dual-write** (court terme) : écriture Firestore + SQL, lecture depuis une source « source of truth » choisie ; comparateur / job de réconciliation.
   - **ETL one-shot** : export Firestore → import SQL + bascule lecture/écriture (simple sur le papier, **risqué** sans période de validation).

Recommandation pragmatique pour Wroket : **introduire une abstraction de persistance**, migrer **domaine par domaine** (ex. `sessions` puis `notes` puis …), garder **Firestore comme backup** ou **lecture** jusqu’à validation, puis **cutover** todos en dernier (volume + sharding + chemins API nombreux).

---

## 4. Étapes détaillées

### Phase A — Audit et cible

| # | Étape | Livrable |
|---|--------|----------|
| A1 | Lister tous les appels à `getStore()`, `scheduleSave`, `scheduleTodoShardPersist`, `flushNow` | Matrice domaine → fichiers |
| A2 | Pour chaque domaine, documenter la **forme** des objets (types TS, champs optionnels) | Schéma cible ou spec JSON Schema |
| A3 | Mesurer **tailles** approximatives par doc Firestore (users, projects, plus gros shard todo) | Décision « table dédiée » vs « JSONB par domaine » |
| A4 | Identifier les **invariants** métier (unicité email, clés de session, FK logiques projet/tâche) | Contraintes SQL + index uniques |

### Phase B — Schéma SQL initial

| # | Étape | Détail |
|---|--------|--------|
| B1 | Créer schéma **minimum** : une table `store_domains` (`name` PK, `payload JSONB`) **ou** une table par domaine | Permet migration mécanique rapide pour domaines non encore normalisés |
| B2 | **Todos** : table relationnelle **`todos`** (une ligne par tâche, `user_id` indexé) conforme au **§1.1**. Optionnel : table **`todo_shards`** (128 JSONB) **seulement** comme filet d’ETL / dual-write de courte durée, puis suppression une fois la bascule validée |
| B3 | Ajouter colonnes **`updated_at`**, **`version`** si optimistic locking | Utile pour API concurrente et jobs |
| B4 | Migrations versionnées (Flyway, Liquibase, ou migrations Drizzle/Knex) | Reproductible CI/CD |
| B5 | Politiques **RLS** sur `todos` (et tables user-scoped) si l’équipe valide le surcoût ops | Optionnel ; filtre applicatif `user_id` reste la base |

### Phase C — Connectivité Cloud Run ↔ Cloud SQL

| # | Étape | Point d’attention |
|---|--------|-------------------|
| C1 | Activer Cloud SQL, utilisateur DB, base | Secrets hors Git (`DATABASE_URL` ou vars séparées) |
| C2 | **Cloud SQL Auth Proxy** ou connecteur natif Cloud Run | Pas d’IP publique ouverte inutilement |
| C3 | **Pool de connexions** (pg-bouncer en sidecar, ou pooler managé, ou `pg` avec limites strictes) | Cloud Run scale horizontal → risque d’explosion de connexions |
| C4 | Timeouts et retries côté client SQL | Alignés sur timeouts HTTP API |

### Phase D — Pipeline de données (ETL)

| # | Étape | Détail |
|---|--------|--------|
| D1 | Export Firestore (Admin SDK ou script dédié) par document `store/*` | Vérifier cohérence avec chargement actuel (`data` wrapper) |
| D2 | Aplatir `todos_0..127` + legacy `todos` → **lignes `INSERT` dans `todos`** avec `user_id` + champs | Même logique de merge que `mergeLegacyTodoFieldsWhereShardEmpty` avant insert ; pas de JSONB shard comme état final |
| D3 | Job de **vérification** : compter utilisateurs, todos, projets, etc. Firestore vs SQL | Rapport avant cutover |
| D4 | Test de restauration **depuis SQL** sur environnement isolé | Drill de reprise après incident |

### Phase E — Application

| # | Étape | Détail |
|---|--------|--------|
| E1 | Introduire couche **`PersistenceAdapter`** : `load()`, `schedule*`, `flushNow()` implémentés par Firestore **ou** SQL | Point central actuel : `persistence.ts` |
| E2 | Remplacer progressivement ; garder **feature flag** `USE_SQL_STORE` | Rollback sans redeploy schéma |
| E3 | Adapter **health/readiness** : ping SQL (ex. `SELECT 1`) au lieu ou en complément de `doc("users").get()` | Même contrat `/health/ready` |
| E4 | **Shutdown** : `flushNow()` équivalent — commit explicite transaction SQL | Pas de perte silencieuse au SIGTERM |
| E5 | Réviser **RGPD** / suppression compte : transactions couvrant toutes les tables concernées | Aujourd’hui multi `scheduleSave` + `flushNow` |

### Phase F — Cutover et post-migration

| # | Étape | Détail |
|---|--------|--------|
| F1 | Fenêtre de bascule + communication | Latence API peut changer (pool, RTT SQL) |
| F2 | Après stabilité : **désactiver écritures Firestore** ; archiver export final | Preuve audit |
| F3 | Plan **rollback** : réactiver Firestore + dernier export connu | SLA défini à l’avance |
| F4 | Normaliser les **autres** domaines encore en JSONB (`projects`, etc.) ; les **todos** sont déjà visés **relationnels** dès la cible §1.1 | Réduire dette et activer contraintes référentielles partout |

---

## 5. Points d’attention (ponts critiques)

### 5.1 Modèle de données

- **Nested maps** (ex. `users[uid]`, `projects[id]`, `todos[userId][todoId]`) : en SQL, clarifier **clés primaires** (`user_id`, `todo_id`, etc.) et éviter les collisions.
- **Références croisées** (commentaires par `todoId`, pièces jointes, activité) : aujourd’hui cohérence **application** ; en SQL, opportunité d’ajouter **FK** et **ON DELETE** là où c’est pertinent.

#### 5.1.1 Synthèse : alignement avec la cible **§1.1**

La **cible Wroket** pour les todos est la **table relationnelle** (une ligne par tâche, `user_id`, index, FK possibles, RLS optionnel). Les autres lignes du tableau restent utiles pour comprendre les **alternatives** et les **phases transitoires**.

| Approche Postgres | Rôle | Statut pour Wroket |
|-------------------|------|---------------------|
| **Table `todos` relationnelle** (1 ligne / tâche + `user_id`) | Perf SQL, isolation par utilisateur au niveau ligne, RGPD / `DELETE` ciblés | **Recommandé — cible** (§1.1) |
| **Une ligne par utilisateur** (JSONB des tâches) | Isolation « une row par compte » | **Non retenu** comme cible (moins bon pour index / jointures par tâche) |
| **128 lignes JSONB** (miroir shards) | ETL ou dual-write **temporaire** | **Pont uniquement** si besoin ; pas l’état final |

**Allocation** : avec la cible relationnelle, le volume de lignes **suit** le nombre de tâches (et d’utilisateurs actifs), ce qui est **normal** et **souhaitable** pour des index B-tree sur colonnes métier. Les 128 blobs Firestore ne se « recopient » pas en permanence dans Postgres : on les **aplati** en inserts dans `todos`.

### 5.2 Performance et limites

- Firestore : gros documents ; Postgres : limite **taille de ligne** et perf JSONB. Prévoir **archivage** ou découpage (ex. `activity_log` volumineux).
- **Connexions** : le principal piège Cloud Run + Postgres sans pooler.

### 5.3 Sécurité et conformité

- Secrets : `DATABASE_URL`, mots de passe, **ne jamais** commiter ; alignement avec Secret Manager.
- **Chiffrement au repos** : Cloud SQL le gère ; chiffrement applicatif legacy (`encV1`) à traiter **avant** ou **pendant** l’ETL.
- **RGPD** : exports et effacements doivent rester **complets** sur toutes les tables concernées.

### 5.4 Opérations

- **Sauvegardes** Cloud SQL automatisées + test de restore.
- **Observabilité** : métriques latence SQL, erreurs pool, deadlocks.
- **Multi-instances** : sessions / `pendingTwoFactor` / jobs — vérifier que le modèle reste valide (pas d’hypothèse « une seule instance » si déjà le cas).

### 5.5 Développement local

- Docker Compose avec Postgres pour reproduire le schéma ; option **Firestore emulator** seulement si une phase hybride le nécessite.
- Parité `USE_LOCAL_STORE` : aujourd’hui fichier JSON ; équivalent **dump SQL** ou **SQLite** pour dev offline (décision équipe).

### 5.6 Tests

- Tests d’intégration sur **vraie** Postgres (CI service container).
- Jeux de données issus d’un **export anonymisé** pour valider l’ETL.

---

## 6. Checklist rapide avant « go » production

- [ ] Schéma SQL validé + migrations automatisées  
- [ ] Stratégie pool + limites Cloud Run documentée  
- [ ] ETL + rapports de cohérence chiffrés/archivés  
- [ ] Healthcheck et graceful shutdown validés sur SQL  
- [ ] Plan rollback et propriétaire désigné  
- [ ] Données sensibles / RGPD couverts par le nouveau modèle  
- [ ] Schéma `todos` : `user_id` + index ; politiques RLS si retenues  

---

## 7. Références code utiles

| Sujet | Fichier principal |
|--------|---------------------|
| Firestore / debounce / shards / `DOMAINS` | `backend/src/persistence.ts` |
| Arrêt propre | `backend/src/server.ts` |
| Todos + persistance | `backend/src/services/todoService.ts` |
| Multi-domaines + flush | `backend/src/services/rgpdService.ts` |
| Scripts migration | `backend/src/scripts/*.ts` |

---

*Document généré pour préparer le chantier ; à affiner avec contraintes budget, RPO/RTO et choix ORM (Drizzle, Prisma, Knex, etc.).*
