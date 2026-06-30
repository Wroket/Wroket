---
name: wroket-reliability-audit
description: >-
  Audit exhaustif fiabilité + optimisation Wroket (toutes features) : parcours
  UI→API→persistance→ops, sécurité, coût GCP, i18n, multi-instance. Utiliser
  quand l'utilisateur demande une review globale, ultra-fiabilité, audit complet,
  optimisation application, ou /wroket-reliability-audit.
disable-model-invocation: true
---

# Audit fiabilité & optimisation — Wroket (toutes features)

## Objectif

Produire un **rapport actionnable** qui couvre **chaque domaine produit** sans exception : ce qui est fiable, ce qui ne l'est pas, pourquoi, et quoi corriger en priorité.

**Interdit** de conclure « ultra fiable » sans preuve (tests, checklist E2E, ou scénario reproductible documenté).

## Mode par défaut

- **Lecture seule** : audit + recommandations. Ne modifier le code que si l'utilisateur demande explicitement de corriger après le rapport.
- **Une session ≠ tout le repo** : parcourir la [matrice features](references/feature-matrix.md) domaine par domaine ; signaler les domaines non audités.

## Règles projet obligatoires (lire avant d'auditer)

| Règle | Fichier |
|-------|---------|
| E2E produit | [`.cursor/rules/product-e2e.mdc`](../../rules/product-e2e.mdc) |
| Gate complétude | [`.cursor/rules/feature-completeness-gate.mdc`](../../rules/feature-completeness-gate.mdc) |
| Données / Git | [`.cursor/rules/data-safety.mdc`](../../rules/data-safety.mdc) |
| Infra prod | [`.cursor/rules/architecture.mdc`](../../rules/architecture.mdc) |
| Contraintes UX récupérables | [`.cursor/rules/constraint-solutions-ux.mdc`](../../rules/constraint-solutions-ux.mdc) |

Checklists externes :

- E2E prod : [`docs/checklist-e2e-prod.md`](../../../docs/checklist-e2e-prod.md)
- Ops multi-instance : [`docs/cloud-run-ops.md`](../../../docs/cloud-run-ops.md)
- Runbook todos/calendrier : [`docs/runbook-calendar-todos-reliability.md`](../../../docs/runbook-calendar-todos-reliability.md)

Skills complémentaires (charger si le domaine le requiert) :

- DnD projet : [`.cursor/skills/project-dnd-constraints/SKILL.md`](../project-dnd-constraints/SKILL.md)
- Prod / main : [`.cursor/skills/prod/SKILL.md`](../prod/SKILL.md)

---

## Workflow en 6 phases

### Phase 0 — Cadrage (5 min)

1. Demander ou inférer le **périmètre** :
   - `full` — toute la matrice (plusieurs passes)
   - `domain:<id>` — un seul domaine (ex. `todos`, `calendar`, `billing`)
   - `diff` — uniquement changements branch / uncommitted
2. Noter **branche**, **commit**, **environnement** visé (local / prod).
3. Lancer si pertinent : `npm run build` + `npm test` dans `backend/` et `frontend/` ; noter échecs.

### Phase 1 — Inventaire dépendances (par domaine)

Pour **chaque** domaine audité, remplir le tableau (obligatoire avant verdict) :

| Couche | Fichiers / routes | Rôle | Risque si cassé |
|--------|-------------------|------|-----------------|
| UI | `frontend/src/app/...` | pages, modales, i18n | |
| API client | `frontend/src/lib/api/...` | contrats, erreurs | |
| Routes | `backend/src/routes/...` | auth middleware | |
| Controller | `backend/src/controllers/...` | validation entrée | |
| Service | `backend/src/services/...` | logique métier | |
| Persistance | Firestore / `todos_v2` / `store/*` | source de vérité | |
| Tests | `*.test.ts`, `e2e/` | couverture | |

Exemption explicite si un chemin admin, script ou flag spécial est hors scope.

### Phase 2 — Grille fiabilité (par domaine)

Pour chaque feature du domaine, évaluer **Oui / Partiel / Non / N/A** + preuve :

| Critère | Question |
|---------|----------|
| **Nominal E2E** | Action utilisateur → résultat visible sans contournement ? |
| **Permissions** | Non connecté, mauvais rôle, ressource d'un autre user → refus clair ? |
| **Erreurs UX** | Codes API (`422`, `409`, `403`…) → message actionnable FR+EN, pas toast seul si récupérable ? |
| **Persistance** | Survit F5, autre onglet, cold start API, **2e replica** Cloud Run ? |
| **Idempotence** | Double clic, retry réseau, import rejoué → pas de doublon / corruption ? |
| **Observabilité** | Logs structurés, `/health/ready`, drift, alertes admin si critique ? |
| **Coût GCP** | Lectures/écritures Firestore, RAM, instances — acceptable Free Tier / palier actuel ? |
| **Sécurité** | Auth, secrets hors Git, validation entrée, pas de fuite cross-tenant ? |
| **i18n** | Clés FR+EN sur messages utilisateur du parcours ? |
| **Régression** | Parcours lié (ex. assignation ↔ déléguées ↔ notifs) cohérent ? |

**Partiel** = comportement incomplet sur un écran, cache stale, ou E2E non exécutable localement.

### Phase 3 — Grille optimisation (par domaine)

Chercher des gains **sans** sacrifier la fiabilité :

| Axe | Signaux à traquer |
|-----|-------------------|
| **Perf API** | N+1, scan RAM global, `collection().get()` au boot, séquences HTTP frontend |
| **Perf UI** | Re-renders, listes non virtualisées, polling agressif |
| **Firestore** | Index manquants, docs > 700 Ko vers 1 MiB, flush bloqué |
| **Cloud Run** | RAM 256 Mi, cold start, `max-instances`, concurrence |
| **Code** | Duplication controller/service, chemins sync/async incohérents, dead code |
| **Tests** | Flux critique sans test ; tests flaky dates hardcodées |

Chaque optimisation proposée doit citer **bénéfice mesurable** et **risque de régression**.

### Phase 4 — Challenge obligatoire

Avant de finaliser le domaine, énoncer :

1. **Au moins une hypothèse fausse possible** (ex. « assignation OK » alors que lecture RAM-only).
2. **Alternative** : ne rien faire maintenant vs fix minimal vs refactor.
3. **Impact prod / données** : migration, flag, rollback.

Ne pas recommander de wipe store, reset Firestore, ou `max-instances=1` permanent comme « fix » sans runbook.

### Phase 5 — Rapport & priorités

Restituer dans cet ordre :

```markdown
# Audit fiabilité Wroket — [domaine ou full] — [date]

## Synthèse exécutive
- Domaines audités : …
- Domaines non audités : …
- Verdict global : Fiable / Dégradé / Critique (justifier)
- Top 3 P0 (bloquant user ou données)

## Findings par domaine
### [domain-id] Nom
| Feature | Fiabilité | Optimisation | P | Finding | Preuve / fichier |
...

## Checklist E2E restante
- [ ] scénarios manuels non rejouables ici

## Plan de remédiation suggéré
1. P0 — …
2. P1 — …
3. P2 — …
```

**Priorités** :

- **P0** — perte de données, sécurité, feature principale cassée en prod, flush/drift bloqué
- **P1** — incohérence multi-instance, erreur UX non actionnable, régression cross-écran
- **P2** — perf, dette, polish

Préférer un **Canvas** si le rapport dépasse ~30 lignes de findings.

### Phase 6 — Suite (si l'utilisateur demande les fixes)

1. Un **P0 ou P1 à la fois**, diff minimal.
2. Re-lancer build/tests touchés.
3. Mettre à jour la ligne du domaine dans le rapport.

---

## Ordre d'audit recommandé (full)

Par **impact utilisateur × risque infra** :

1. `infra-persistence` — flush, drift, multi-instance, health
2. `todos` — CRUD, assignation, archives, quotas
3. `projects` — Kanban, Gantt, DnD, templates, partage
4. `calendar` — slots, booking, conflits, Google/Microsoft
5. `auth-security` — login, 2FA, SSO, sessions, RGPD
6. `teams-collab` — équipes, notifications, mentions
7. `notes-attachments` — notes, fichiers, RGPD
8. `integrations` — Notion, Monday, sync externe
9. `billing` — Stripe, gating, portail
10. `push-pwa` — SW, notifications push
11. `admin-marketing` — admin ops, feedback, early bird
12. `i18n-a11y-seo` — transversal

Détail domaines → [`references/feature-matrix.md`](references/feature-matrix.md).

---

## Anti-patterns d'audit

- Valider une feature sur **un seul composant** (UI seule ou backend seul).
- Proposer refactor massif sans P0 traités.
- Ignorer `data-safety.mdc` pour « optimiser ».
- Lister 50 TODO sans priorisation.
- Marquer « done » sans tests ou scénario E2E explicite.

---

## Invocation

```
/wroket-reliability-audit
/wroket-reliability-audit domain:todos
/wroket-reliability-audit full
/wroket-reliability-audit diff
```
