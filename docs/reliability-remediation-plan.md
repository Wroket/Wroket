# Plan de remédiation fiabilité Wroket

**Date audit** : 2026-06-30  
**Périmètre** : 12 domaines ([`.cursor/skills/wroket-reliability-audit/`](../.cursor/skills/wroket-reliability-audit/))  
**Branche auditée** : `main` @ `ef1a2fe` (+ diff non commité patch multi-instance)

## Verdict global

**Critique / Dégradé** — flush prod historique + lectures RAM vs Firestore incohérentes en multi-instance (todos, projects, calendar, teams). Auth/RGPD globalement solide.

## Vagues de remédiation

```
Vague 0 (bloquants prod) → Vague 1 (multi-instance) → Vague 2 (ACL/entitlements)
  → Vague 3 (métier transverse) → Vague 4 (polish/scale)
```

---

## Vague 0 — Bloquants production (S1)

| # | Action | Fichiers | Critère sortie |
|---|--------|----------|----------------|
| 0.1 | Résoudre flush `store/*` prod (doc > 1 MiB, logs `flush_exhausted`) | `persistence.ts`, GCP Logging | flush=0, 7j sans alerte |
| 0.2 | Déployer `firestore.indexes.json` **avant** code | GCP + repo root | indexes READY |
| 0.3 | Commit/deploy patch todos multi-instance | `todoService.ts`, `todoDocStore.ts`, controllers | assignation E2E OK |
| 0.4 | Env explicites Cloud Run | `cloudbuild.yaml` : `TODOS_READ_SOURCE=firestore`, `TODOS_BOOT_HYDRATION=lazy` | — |
| 0.5 | **Drift monitor lazy-safe** (bloque 0.3) | `todosDriftMonitor.ts` | `/health/ready` 200 avec lazy boot |

---

## Vague 1 — Multi-instance todos + projects (S2–S4)

| # | P | Action | Fichiers |
|---|---|--------|----------|
| 1.1 | P0 | `getTodoV2ById` + `findTodoForUser` async Firestore fallback | `todoDocStore.ts`, `todoService.ts` |
| 1.2 | P0 | `listArchivedTodos` hydrate/query + race frontend | `todoService.ts`, `todoController.ts`, `todos/page.tsx` |
| 1.3 | P0 | `archiveTodosByProjectId` sans skip `!inMem` | `todoService.ts` |
| 1.4 | P0 | Conversion phase : `listProjectTodos` avant patches, pas de skip silencieux | `phaseConversionService.ts`, `applyTodoPatchesForPhaseConversion` |
| 1.5 | P1 | Reconnect listeners `store/*` (pattern v2) | `persistence.ts` |
| 1.6 | P1 | Team dashboard/reporting : async todo reads | `teamController.ts` |
| 1.7 | — | Tests : conversion cross-owner, archives lazy, findTodo cold | `*.test.ts` |

**Critère sortie** : checklist [`cloud-run-ops.md`](cloud-run-ops.md) multi-instance complète.

---

## Vague 2 — ACL & entitlements (S5)

| # | P | Action |
|---|---|--------|
| 2.1 | P1 | `canAccessTodo` : inclure `canAccessProject` pour tâches projet |
| 2.2 | P1 | `moveTodo` : autoriser `canEditProjectContent` **ou** UI readonly viewer + DnD off |
| 2.3 | P1 | Aligner UI milestones/share sur `canEditProjectContent` vs `canManageProject` |
| 2.4 | P1 | Unifier `getEffectiveEntitlementsForUid` : `/auth/me`, sync OAuth, webhooks, settings UI |

---

## Vague 3 — Métier transverse (S6–S7)

| # | P | Domaine | Action |
|---|---|---------|--------|
| 3.1 | P1 | Calendar | `ensureOwnerHydrated` sur book/slots/meet ; DRY `findSlotConflicts` |
| 3.2 | P1 | Calendar | MS event fetch `.catch` ; booking rollback si persist échoue |
| 3.3 | P1 | Notes | Quota Free dans `syncNotes` |
| 3.4 | P2 | Attachments | Upload transactionnel metadata/blob |
| 3.5 | P2 | Projects | `POST /projects/:id/apply-template` batch |
| 3.6 | P1 | Admin | Ops UI : `dirtyDomainsCount`, `dirtyShardsCount` |

---

## Vague 4 — Polish & scale (S8+)

- i18n : `apiErrors.ts` (`DEPENDENCY_*`, `TASK_*`, rate limits)
- Push/PWA : locale web push, manifest, offline bilingue
- Tests : marketing, feedback, early-bird, apiErrors contract
- Perf : portfolio N+1, sonde taille `store/users`
- Infra : RAM 512Mi si OOM, PITR Firestore, max-instances=2 après 7j stable
- SEO : `robots.ts` ↔ `sitemap.ts`
- E2E : rejouer [`checklist-e2e-prod.md`](checklist-e2e-prod.md) §A–I

---

## Registre P0 (à fermer en priorité)

1. Flush exhausted prod
2. Drift monitor + lazy boot → readiness 503
3. `listArchivedTodos` RAM-only
4. `findTodoForUser` RAM-only
5. `listProjectTodos` RAM-only (prod main)
6. Conversion phase skip todos hors RAM
7. Indexes Firestore non déployés

## Validation finale

- [x] P0 code : drift lazy-safe, findTodo Firestore, archives, archive project, phase conversion, indexes dans repo
- [x] cloudbuild : `TODOS_READ_SOURCE=firestore`, `TODOS_BOOT_HYDRATION=lazy`
- [x] Tests backend : 207/207 passent
- [ ] Déployer indexes Firestore prod (voir commandes ci-dessous — **pas** `--file`)

### Déployer les indexes `todos_v2` (PowerShell)

`gcloud` ne supporte **pas** `--file=firestore.indexes.json`. Sous **PowerShell**, quoter chaque `--field-config` (sinon les virgules sont mal parsées) :

```powershell
gcloud firestore indexes composite create --project=involuted-reach-490718-h4 --collection-group=todos_v2 --query-scope=collection "--field-config=field-path=assignedTo,order=ascending" "--field-config=field-path=status,order=ascending" --async

gcloud firestore indexes composite create --project=involuted-reach-490718-h4 --collection-group=todos_v2 --query-scope=collection "--field-config=field-path=projectId,order=ascending" "--field-config=field-path=createdAt,order=descending" --async
```

Vérifier : `gcloud firestore indexes composite list --project=involuted-reach-490718-h4` — attendre `state: READY` (souvent 5–15 min).
- [ ] Rejouer checklist E2E prod
- [ ] max-instances=2 validé 7j post-deploy

## Reporté (P2 / ops manuel)

- Upload attachments transactionnel GCS + metadata (3.4)
- `POST /projects/:id/apply-template` batch (3.5)
- RAM 512Mi / PITR Firestore (infra manuelle)
- Push/PWA locale complète (4)

## Références

- Skill audit : `.cursor/skills/wroket-reliability-audit/`
- Runbook : `docs/runbook-calendar-todos-reliability.md`
- Ops : `docs/cloud-run-ops.md`
