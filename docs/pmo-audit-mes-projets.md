# Audit PMO — Consolidation Mes projets

Document d’archive du diagnostic (2026-11-09). Plan d’exécution : `.cursor/plans/audit_pmo_mes_projets_*.plan.md`.

## Verdict

Socle PMO delivery **déjà riche** (Board/Kanban/Gantt, Pilotage, jalons, deps, share, portal, portfolio, digests, MCP). Les écarts de confiance sont **sous-exposition**, **vérité santé/dates**, **perf seed** et **rituel comité** — pas l’absence d’un PPM.

| Axe | Score /10 |
|-----|-----------|
| UI execution | 7.5 |
| UX portfolio / discoverabilité | 4.5 |
| Backend capacité | 8 |
| Backend perf / vérité | 5 |
| Rituel PMO | 5 |

## Root causes clés

1. **Seed O(n²)** : `createTodo` → `persistTodos` → resync full owner à chaque insert (~58 s pour template Software 54 todos).
2. **Santé** : undated = `on-track` ; liste ignore les slots (drift vs Pilotage).
3. **IA** : Pilotage/share dans accordion fermé par défaut.
4. **Deep-links** : `/projects/:id` sans route ; canonique = `?project=`.

## Phases

- **A** Stabiliser (seed, dates templates, santé, deep-links, tab Pilotage, docs, Path-to-9, deps UI)
- **B** Rituel (pack comité, why-late, RACI-lite, share smoke, digests)
- **C** Différenciateurs (portfolio home, baseline-light, risk tag, agentic)

## Non-goals

PPM enterprise, registre RAID complet, matrice RACI, EVM, clone Notion/Monday.

## Digests hebdo (B5)

Slash / MCP : `/wroket my-week`, `team-risk`, `overdue` (`pmoDigestService`). Smoke ops Slack+/Teams à rejouer après secrets ; ritual manager = digests + tab Pilotage + pack comité.

## Phase 0 lite (B6)

Dry-run interne recommandé : créer projet template → Pack comité → share link → revue 10 min. Go/no-go « PDF+share suffisent pour comité ? » à noter ici après 3 passages.
