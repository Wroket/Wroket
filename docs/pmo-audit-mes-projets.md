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

## Validation live (2026-11-09)

Compte Hotmail Early Bird / Personal sur `wroket.com`. Projet test **PMO Live Validation** (`e0273ef3-1939-4c25-82a7-2d2f39a822f5`, template Software) puis archivé avec **PMO Audit Demo**.

### Scoreboard

| ID | Résultat | Evidence |
|----|----------|----------|
| A0 | **Pass** | `POST …/seed-template` ~**2621 ms** (vs ~58 s avant) |
| A1 | **Pass** | Pilotage : jalons datés, **No deadline = 0**, Gantt bars + dates |
| A2 | **Pass** | Liste : Live = **At risk** ; Audit Demo undated = **Undated** (pas faux On track) |
| A3 | **Pass** | `/projects/:id` → `?project=` ; CreateMenu / portfolio deep-links OK |
| A4 | **Pass** | Défaut **Steering/Pilotage** ; `?tab=board\|kanban\|gantt\|docs` ; settings accordion |
| A5 | **N/A** | Docs déjà alignées (skip live) |
| A6 | **Pass** | Schedule Board + Kanban + Gantt < 10 min ; **0 toast Error** |
| A7 | **Pass** | Badge ⛔ + modale **Task blocked** (Design architecture ← Define scope) |
| B1 | **Pass** | Steering pack : CSV daté + PDF + baseline (`Last snapshot … at-risk · 0%`) |
| B2 | **Partial** | Liste overdue UI prête ; **Overdue = 0** (API refuse deadline < today) — clic why-late non jouable |
| B3 | **N/A** | Hint RACI-lite hors scope Personal (pas de panneau Access équipe) |
| B4 | **Pass** | Create link → lecture `/share/project/…` → revoke → « Lien expiré ou révoqué » ; portal SoftLock visible |
| B5 | **N/A** | Digests Slack/MCP hors smoke (sauf hint MCP Settings) |
| B6 | **Go** | Dry-run comité : pack PDF/CSV + share lecture OK |
| C1 | **Partial** | Filtre at-risk portfolio **équipe** vide (Personal) ; liste Mes projets At risk → Pilotage OK |
| C2 | **Pass** | Last snapshot après pack |
| C3 | **Pass** | Tag `risk` → section **RISK / Define scope** sur Pilotage |
| C4 | **Pass** | Hint MCP visible ; agent N/A |
| C5 | **Pass** | Viewport 390×844 : Pilotage + Create link lisibles, pas d’overflow critique |

### Exit gates

- **Exit A (9/10 Projets)** : **oui** (A6 vert).
- **Exit B (trust MVP)** : **oui avec réserve** (B1+B4+B6 go ; B2 Partial).
- **Go/no-go comité** : **Go** — PDF + share suffisent pour un comité 10 min PME.

### Re-note axes /10 (post-live)

| Axe | Avant | Après live |
|-----|-------|------------|
| UI execution | 7.5 | **8** |
| UX portfolio / discoverabilité | 4.5 | **5.5** (liste santé OK ; portfolio team encore vide en Personal) |
| Backend capacité | 8 | **8** |
| Backend perf / vérité | 5 | **7.5** (seed + undated + No deadline 0) |
| Rituel PMO | 5 | **7.5** (pack + share + baseline) |

### Bugs / dettes constatés

| Sévérité | Repro | Note |
|----------|-------|------|
| P1 | Jalons doublons « Scoping » + « Scoping (Scoping) » (idem Design…) | Seed milestone + phase label |
| P1 | `?tab=list` tombe sur Pilotage (List = `board`) | Deep-link / a11y naming |
| P2 | Impossible de forcer overdue via PUT (échéance < aujourd’hui rejetée) | Bloque smoke B2 why-late |
| P2 | Clic List/header sticky intercepté en automation | Contournement URL `?tab=` |

### Cleanup

Projets **PMO Live Validation** et **PMO Audit Demo** archivés (récupérables Archive › Projects).

## Post-audit hardening (2026-11-09)

Livré sur `main` après le scoreboard ci-dessus (`f3728db`, `abcdf24`) :

| Lot | Contenu | Statut |
|-----|---------|--------|
| Pack A+B | Dedup jalons Pilotage, alias onglets, filtre at-risk liste | [x] |
| 1 | CTA at-risk + portfolio **perso** (`GET /projects/portfolio`) | [x] |
| 2 | Seed sans jalon = fin de phase | [x] |
| 3 | Pilotage « Bientôt dû » + seed overdue / due-soon | [x] |
| 4 | RACI si roster ≥ 2 ; `?health=at-risk` ; doc `wroket-deploy` europe-west9 | [x] |
| Fix | Toast desktop `dependency_blocked` (baseline AppShell + notif lue sans push) | [x] |

**Reste** : entretiens ICP (phase 0) ; residual Path-to-9 (collab editor live, CI e2e local). Path-to-9 Projets terrain + digests PMO + gate MCP = **faits 2026-11-13**. Non-goals inchangés (PPM / matrice RACI / RAID).
