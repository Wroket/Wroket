# Persistance — invariants zéro-perte

Objectif : **aucune écriture** (1 ou 2 instances Cloud Run, déploiement chevauché, hydratation lazy) ne doit pouvoir supprimer ou écraser des tâches / users / notes faute de RAM partielle ou de snapshot stale.

## Principes

1. **La RAM est un cache**, jamais la source de vérité pour décider d’un delete.
2. **Toute suppression Firestore = liste d’ids explicites** (ou scope métier nommé : retention, RGPD) — jamais « ce que je n’ai pas en mémoire ».
3. **Toute mutation = upsert ciblé** (doc tâche / clés touchées), pas réécriture aveugle d’un owner entier depuis un subset.
4. **Snapshots** mettent à jour le cache ; un domaine **dirty** local ignore le snapshot distant jusqu’au flush (`store.invalidation.skipped_dirty`).
5. **Cible long terme** : domaines chauds = 1 document Firestore par entité (comme `todos_v2`), avec `updatedAt` / version.

## todos_v2 (prod)

| Opération | API | Comportement |
|-----------|-----|--------------|
| Upsert 1 tâche | `syncTodoV2` / `persistTodoMutation` | Écrit uniquement ce doc |
| Upsert N tâches | `syncOwnerTodosV2` / `persistTodoMutations` | Upsert uniquement les docs fournis — **ne delete jamais** les absents |
| Delete | `deleteTodosV2ByIds(ids, reason)` | Delete explicite + log `todos_v2.delete` |
| RGPD owner | `deleteAllTodosV2ForOwner` | Scope owner entier, conscient |

Landmine historique retiré (2026-11) : passe « stale delete » dans `syncOwnerTodosV2` qui effaçait les docs absents de la RAM lazy.

## Multi-instance `store/*`

- `registerDomainReloader(domain, fn)` + `_applyDomainSnapshot` → recharge les Maps service.
- Wire au boot (`server.ts`) : users, sessions, timeSessions, share links, portals, OKR, automations.
- `getUserFromRequestCookies` : fallback `getStore().sessions` / `users` si Map pas encore rechargée.

## Interdit

- Scripts backfill / `syncAllTodosToConfiguredStores` en prod sans hydratation complète owner.
- `set({ merge: true })` sur le blob `{ data }` comme « correctif » multi-instance.
- Wipe / reset Firestore au déploiement.

## Suite (lot C)

Migrer sessions → users → projects → notes → timeSessions vers collections 1-doc-1-entité (dual-read, PITR, `RUN_MIGRATION` opt-in). Voir plan *Fix multi-instance persistence*.
