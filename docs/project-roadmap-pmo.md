# Plan de développement — partie Projet (cible PMO léger)

Document de travail : feuille de route **produit** pour renforcer le module Projet, en ciblant en priorité des **coordinateurs de projet / PMO pragmatique** (PME, équipes delivery, contexte Google Workspace), et non un PMO enterprise (portfolio massif, intégrations lourdes type ERP).

Il complète le [ROADMAP](../ROADMAP.md) et s’aligne avec la [session produit utilisateur](./product-user-session.md) et les [idées refonte UI](./refonte-ui-ideas.md).

**Dernière mise à jour** : 2026-06-08 (alignement 3 priorités produit)

---

## Synthèse d’avancement

| Phase | Statut | Commentaire |
|-------|--------|-------------|
| **0 — Cadrage** | 🔴 Non fait | Discovery produit ; plan d’actions dans [product-user-session.md](./product-user-session.md) (A1–A3) |
| **1 — Visibilité pilotage** | 🟢 ~85 % | Panneau Pilotage + vues Board/Kanban/Gantt interactif livrés ; aide terminologique et navigation à peaufiner |
| **2 — Lien plan ↔ todos** | 🟡 ~50 % | Roll-up retard/santé OK ; jalons = fins de phase ; dépendances non livrées |
| **3 — Rituel PMO (reporting)** | 🟡 V1 OK | Export CSV + PDF steering ; pas de multi-projets ni lien partageable |
| **§6 — Partage externe** | 🔴 Non démarré | Aligné `[ ]` ROADMAP : liens partageables, client portal |
| **4 — Qualité E2E** | 🟡 En cours | Parcours projet validé prod ([checklist §G](./checklist-e2e-prod.md)) ; quadrillage Gantt §G.12 à valider |

**Priorité sprint globale** (arbitrage 2026-06-08) : **trois chantiers parallèles** — voir [§12 Alignement 3 priorités](#12-alignement-3-priorités-produit). Séquence technique recommandée : **socle import + dépendances** → **PMO partage/portfolio** → **Notion-Like profondeur** → **Monday-Like**.

**Références code livrées** :
- [`ProjectSteeringPanel.tsx`](../frontend/src/app/projects/_components/ProjectSteeringPanel.tsx) + [`projectSteering.ts`](../frontend/src/lib/projectSteering.ts) — KPIs, santé, jalons (fins de phase), roll-up
- [`steeringPdfExport.ts`](../frontend/src/lib/steeringPdfExport.ts) — export PDF (panneau + capture Gantt)
- [`ProjectDetailView.tsx`](../frontend/src/app/projects/_components/ProjectDetailView.tsx) — intégration pilotage, exports, vues projet
- [`GanttChart.tsx`](../frontend/src/app/projects/_components/GanttChart.tsx) — timeline interactive (édition, drag, resize, quadrillage)

---

## 1. Positionnement

**Promesse recherchée** : relier **plan de projet** (phases, jalons, visibilité) et **exécution quotidienne** (todos, deadlines, charge) dans un flux continu — compatible avec des équipes qui vivent déjà dans **Google Calendar** et veulent éviter un « work OS » trop lourd.

**Non-objectifs explicites (à arbitrer si la cible change)** : remplacer des suites type portfolio IT globale, couvrir la conformité ou les intégrations SAP sans décision produit dédiée.

---

## 2. Phase 0 — Cadrage (avant ou en parallèle des gros développements)

| Action | Livrable | Statut |
|--------|----------|--------|
| Définir l’**ICP projet** (taille d’équipe, secteur, outils actuels, frustration « plan vs exécution ») | One-pager ICP | [ ] |
| Mener **3 à 5 entretiens** utilisateurs ou internes | Notes de synthèse (frictions réelles) | [ ] |
| Fixer **3 critères de succès** mesurables pour ce chantier (ex. « un comité peut voir le retard sans reconstruire un tableau externe ») | Critères affichés dans le backlog | [ ] |

> Piste : le critère « comité sans tableur externe » est **partiellement atteignable** aujourd’hui via export PDF steering (à valider terrain).

---

## 3. Phase 1 — Visibilité pilotage

**Objectif** : un **cadre projet** comprend l’état du projet sans reconfiguration constante.

**Definition of Done suggérée** : un utilisateur cible peut **exposer le statut du projet en environ une minute** depuis Wroket.

### Livrables

- [x] **Vue synthèse projet** — panneau **Pilotage** : santé (`on-track` / `at-risk` / `overdue` / `done`), KPIs (actives, retard, à risque, sans échéance, % complété), roll-up par phase
- [x] **Prochains jalons** — dérivés des **dates de fin de phase** (`upcomingMilestones` dans `projectSteering.ts`)
- [x] **Vues projet** — Board, Kanban, Gantt avec phases, DnD tâches, modales contraintes (`moveTodo`)
- [x] **Gantt interactif** — clic édition, drag/resize avec preview, phases et sous-tâches datées (E2E prod 2026-06-08, checklist §G.10–11)
- [x] **Gantt quadrillage** — grille jour/semaine, en-tête lundis, surbrillance drag (code livré 2026-06-08 ; validation prod checklist §G.12 en attente)
- [ ] **Clarification terminologique** phase / livrable / tâche — aide contextuelle dédiée alignée sur `ProjectDetailView` (i18n partiel, pas de module d’aide PMO)
- [ ] **Navigation liste ↔ projet** — réduction des allers-retours (filtres « tâches de ce projet » depuis `/todos` : existant mais perfectible)

---

## 4. Phase 2 — Lien plan ↔ todos (cœur de la différenciation)

**Objectif** : rendre **traçable** la chaîne « retard / blocage » du terrain jusqu’au niveau projet.

**Definition of Done suggérée** : la question « **pourquoi ce projet est en retard ?** » trouve une réponse **tâche → phase → jalon** dans l’app.

### Livrables

- [x] **Roll-up retard** — au moins une tâche en retard dans une phase → santé phase/projet dégradée ; liste `topOverdue` dans le panneau Pilotage
- [x] **Chaîne tâche → phase** — `phaseId`, dates phase, barres Gantt, roll-up `PhaseSteeringRow`
- [~] **Jalons** — **approximation actuelle** : fin de phase = jalon (pas d’entité jalon indépendante libellé + date)
- [ ] **Jalons dédiés** — libellé + date, reliés phase ou projet, visibles timeline/Gantt
- [ ] **Dépendances légères** entre tâches (ou phases) — voir ROADMAP `[ ]` Dépendances tâches (`blockedByTodoIds`, P3 Notion-Like)

---

## 5. Phase 3 — Rituel PMO léger (reporting)

**Objectif** : supporter les **réunions de pilotage** sans duplicate massif dans des tableurs.

**Definition of Done suggérée** : un PM peut **préparer un comité-rep** sans tout reconstruire dans Sheets à la main.

### Livrables

- [x] **Export CSV steering** — snapshot projet (KPIs, phases, retards, jalons) via `steeringSnapshotToCsv`
- [x] **Export PDF steering (V1)** — panneau Pilotage + capture Gantt (`downloadSteeringPdf`) ; E2E checklist §G.3–5
- [ ] **Export Google Sheets** — insertion graphiques dans Slides (non priorisé)
- [ ] **Résumé partageable** — lien lecture ou copier-coller structuré hors export fichier
- [ ] **Vue multi-projets minimaliste** — liste santé + échéances équipe (ROADMAP `[ ]` Vues portfolio & templates)

> **V1 reporting** considérée **livrée** pour usage interne (équipe connectée). La DoD « comité sans Sheets » reste à **valider terrain** (phase 0).

---

## 6. Partage lecture seule et exports « steering » (client, managers)

Objectif **PMO** : permettre au porteur de projet de donner de la **visibilité** à un **client** ou à des **managers** sans leur donner le contrôle opérationnel.

### 6.1 Partage de projet en lecture seule

- [x] **Partage intra-équipe** — accès projet via équipe / RBAC (existant ; hors périmètre « client externe »)
- [ ] **Lien signé** (token) — accès sans compte, révocation, expiration (ROADMAP `[ ]` Liens partageables lecture seule, P2 Next)
- [ ] **Invité read-only** — compte restreint sur périmètre projet
- [ ] **Périmètre affichable + masquage** — tâches, commentaires, PJ, emails (RGPD / secrets commerciaux)
- [ ] **Client portal** — vue externe structurée (ROADMAP `[ ]` Fonctionnalités Premium)

**Ordre produit** : cadrer **qui lit quoi** (§6.1) **avant** d’enrichir les exports V2 — les KPIs client doivent refléter les mêmes règles que la vue partagée.

### 6.2 Exports pour réunions (KPIs d’avancement)

- [x] **V1 PDF / imprimable** — synthèse + KPIs calculés (jalons phase, avancement, retards, santé par phase) + Gantt
- [ ] **V1 Google Sheets** — export avec graphiques pour Slides
- [ ] **V2 .pptx / Google Slides API** — à n’ouvrir que si V1 insuffisante en retour terrain

### 6.3 Non-régression produit

Tout partage externe ou export doit passer la grille [`feature-completeness-gate`](../.cursor/rules/feature-completeness-gate.mdc) : **révocation**, message d’erreur clair, cohérence UI, et [`data-safety`](../.cursor/rules/data-safety.mdc) pour les jetons, journaux d’accès si pertinent.

- [x] Exports steering actuels — erreurs toast (`toast.steeringPdfError`), pas de fuite de données hors périmètre utilisateur connecté
- [ ] Partage externe — non applicable tant que §6.1 non engagé

---

## 7. Phase 4 — Qualité et non-régression

- [x] **Parcours E2E projet** — création phase → tâche → pilotage → exports → Gantt interactif ([checklist §G](./checklist-e2e-prod.md), re-test 2026-06-08)
- [ ] **Quadrillage Gantt en prod** — checklist §G.12 à cocher post-deploy
- [ ] **Performances vues projet lourdes** — pas de chantier dédié documenté (volume phases/tâches élevé)
- [ ] **Mobile — lecture statut projet** — responsive général ; pas de parcours PMO mobile ciblé

Respecter [`feature-completeness-gate`](../.cursor/rules/feature-completeness-gate.mdc) et [`data-safety`](../.cursor/rules/data-safety.mdc) pour toute évolution persistante.

---

## 8. Arbitrages à maintenir

- Ne pas diluer le produit en **concurrence directe** avec Notion (wiki) ou Monday (automations infinies) : l’angle reste **exécution + visibilité projet** et **alignement Google / Microsoft** là où c’est pertinent.
- Privilégier **une verticale complète** (ex. visibilité du retard de bout en bout) plutôt que de nombreuses fonctions partiellement intégrées.

---

## 9. Lien avec le ROADMAP technique

| Entrée ROADMAP | Lien plan PMO | Statut |
|----------------|---------------|--------|
| Board / Kanban / Gantt / phases | Phase 1 | [x] |
| Gantt interactif + quadrillage | Phase 1 | [x] code / [ ] E2E §G.12 |
| Export steering CSV/PDF | Phase 3 + §6.2 V1 | [x] |
| Liens partageables lecture seule (P2 Next) | §6.1 | [ ] |
| Client portal (Premium) | §6.1 | [ ] |
| Dépendances tâches (P3) | Phase 2 | [ ] |
| Vues portfolio & templates (Monday-Like) | Phase 3 | [ ] |
| Import Notion ZIP (P2 Now) | Acquisition — hors plan PMO strict | [ ] en cours |

Ce plan peut être traduit en entrées **Now / Next** du [ROADMAP](../ROADMAP.md) lors des arbitrages de sprint.

---

## 10. Prochaines étapes recommandées (ordre)

> Remplacé par le plan unifié [§12](#12-alignement-3-priorités-produit) (3 priorités produit).

---

## 12. Alignement 3 priorités produit

Arbitrage **2026-06-08** : trois objectifs à mener de concert (pas en silo) :

| Priorité | Document / section | Reste à livrer (résumé) |
|----------|-------------------|-------------------------|
| **A — Terminer PMO** | Ce document (phases 0–4, §6) | Partage lecture seule §6.1, portfolio multi-projets, jalons dédiés, E2E §G.12, phase 0 terrain |
| **B — Notion-Like** | [ROADMAP § Acquisition](../ROADMAP.md#acquisition--migration-notion--monday) | Import ZIP, dépendances, wiki projet, time tracking, champs perso., marketing |
| **C — Monday-Like** | [ROADMAP § Acquisition](../ROADMAP.md#acquisition--migration-notion--monday) | Import board, colonnes/statuts, automations, dashboard équipe, portfolio/templates, marketing |

### Chevauchements (ne pas développer deux fois)

| Capacité | PMO | Notion-Like | Monday-Like |
|----------|-----|-------------|-------------|
| **Dépendances tâches** | Phase 2 | vague 2 | import colonne Dependencies |
| **Champs personnalisés** | — | vague 5 | colonnes custom |
| **Portfolio multi-projets** | Phase 3 | — | vues portfolio & templates |
| **Liens lecture seule** | §6.1 | — | visibilité managers/clients |
| **Orchestrateur import** | — | vague 1 (ZIP) | **prérequis** import Monday |

### Séquence d’exécution recommandée (vagues)

Chaque vague = livrable E2E testable ; les trois priorités avancent ensemble sur le **même socle**.

#### Vague 1 — Socle migration & plan (≈ 2–3 sprints)

- [ ] **Import Notion ZIP** (B) — `preview` + `confirm`, wizard, `/migrate/notion` ; pose l’orchestrateur import
- [ ] **Dépendances tâches** (A phase 2 + B vague 2) — `blockedByTodoIds`, cycles, modales, Gantt/Kanban ; **Small teams+**
- [ ] **E2E** — cocher checklist §G.12 (quadrillage Gantt) ; PMO phase 4

*DoD vague 1* : migrer un export Notion → projet Wroket ; voir blocages sur board/Gantt ; pilotage inchangé.

#### Vague 2 — Visibilité externe & portfolio (≈ 2 sprints)

- [ ] **Liens partageables lecture seule** (A §6.1 + ROADMAP P2) — token, expiration, révocation
- [ ] **Vue portfolio équipe** (A phase 3 + C) — santé, % complété, retard multi-projets
- [ ] **Marketing migration Notion** (B) — FAQ, checklist E2E import, post-import in-app

*DoD vague 2* : PM externe consulte un projet sans compte ; PMO voit la santé de N projets sur un écran.

#### Vague 3 — Profondeur Notion (≈ 2–3 sprints)

- [ ] **Wiki projet / docs liés** (B)
- [ ] **Time tracking MVP** (B + Premium)
- [ ] **Champs personnalisés** (B vague 5 + prérequis Monday colonnes)
- [ ] **Jalons dédiés** (A phase 2) — entité libellé + date, timeline/Gantt
- [ ] **Phase 0 PMO** (A) — 3–5 entretiens + critères de succès (peut démarrer dès vague 1 en parallèle)

#### Vague 4 — Monday & rituel équipe (≈ 2–3 sprints)

- [ ] **Import Monday board** (C) — après orchestrateur vague 1
- [ ] **Colonnes & statuts Monday** (C)
- [ ] **Automations légères** (C) — extension `automationService`
- [ ] **Dashboard équipe renforcé** (C)
- [ ] **Templates depuis board importé** (C)
- [ ] **Marketing migration Monday** (C)

#### Reporté (retour terrain)

- [ ] Exports V2 Slides/pptx (A §6.2)
- [ ] Client portal complet (ROADMAP Premium)
- [ ] Aide terminologique PMO dédiée (A phase 1, polish)

### Critères « PMO terminé »

Le plan PMO est considéré **clos** quand :

1. [x] Pilotage + exports CSV/PDF + Gantt interactif (fait)
2. [ ] Partage lecture seule opérationnel (§6.1)
3. [ ] Portfolio multi-projets équipe
4. [ ] Dépendances + chaîne retard tâche → phase → jalon
5. [ ] Phase 0 validée terrain (CSV/PDF suffisants pour comité ?)
6. [ ] E2E §G complet (dont §G.12)

---

## 11. Références internes

- [ROADMAP](../ROADMAP.md)
- [Checklist E2E prod — §G Pilotage](./checklist-e2e-prod.md)
- [Session produit utilisateur — plan d’action](./product-user-session.md)
- [Cohérence Radar vs PMO](./radar-coherence.md)
- [Refonte UI — idées](./refonte-ui-ideas.md)
- [Modèle tarifaire & exports steering](./pricing-model-etat.md)
