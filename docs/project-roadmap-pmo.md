# Plan de développement — partie Projet (cible PMO léger)

Document de travail : feuille de route **produit** pour renforcer le module Projet, en ciblant en priorité des **coordinateurs de projet / PMO pragmatique** (PME, équipes delivery, contexte Google Workspace), et non un PMO enterprise (portfolio massif, intégrations lourdes type ERP).

Il complète le [ROADMAP](../ROADMAP.md) et s’aligne avec la [session produit utilisateur](./product-user-session.md) et les [idées refonte UI](./refonte-ui-ideas.md).

**Dernière mise à jour** : 2026-05-01 (partage lecture seule et exports steering)

---

## 1. Positionnement

**Promesse recherchée** : relier **plan de projet** (phases, jalons, visibilité) et **exécution quotidienne** (todos, deadlines, charge) dans un flux continu — compatible avec des équipes qui vivent déjà dans **Google Calendar** et veulent éviter un « work OS » trop lourd.

**Non-objectifs explicites (à arbitrer si la cible change)** : remplacer des suites type portfolio IT globale, couvrir la conformité ou les intégrations SAP sans décision produit dédiée.

---

## 2. Phase 0 — Cadrage (avant ou en parallèle des gros développements)

| Action | Livrable |
|--------|----------|
| Définir l’**ICP projet** (taille d’équipe, secteur, outils actuels, frustration « plan vs exécution ») | One-pager ICP |
| Mener **3 à 5 entretiens** utilisateurs ou internes | Notes de synthèse (frictions réelles) |
| Fixer **3 critères de succès** mesurables pour ce chantier (ex. « un comité peut voir le retard sans reconstruire un tableau externe ») | Critères affichés dans le backlog |

---

## 3. Phase 1 — Visibilité pilotage

**Objectif** : un **cadre projet** comprend l’état du projet sans reconfiguration constante.

**Pistes de livrables** :

- **Vue synthèse projet** (bandeau ou onglet) : phases et dates, indicateurs de **santé** (retard, répartition des tâches par statut, charge déjà calculée côté produit si disponible).
- **Prochains jalons** issus des phases / dates déjà modélisées.
- **Clarification terminologique** phase / livrable / tâche + aide contextuelle alignée avec [`ProjectDetailView`](../frontend/src/app/projects/_components/ProjectDetailView.tsx) et vues Board / Gantt / Kanban existantes.
- Réduction des **allers-retours** entre liste globale et vue projet (navigation, filtres « tâches de ce projet »).

**Definition of Done suggérée** : un utilisateur cible peut **exposer le statut du projet en environ une minute** depuis Wroket.

---

## 4. Phase 2 — Lien plan ↔ todos (cœur de la différenciation)

**Objectif** : rendre **traçable** la chaîne « retard / blocage » du terrain jusqu’au niveau projet.

**Pistes de livrables** :

- **Jalons** : au minimum libellé + date, reliés à une phase ou au projet ; visibilité sur la timeline / Gantt selon le modèle existant.
- **Roll-up** : signalement simple au niveau phase ou projet lorsque des tâches sont en retard ou bloquées (règle progressive : ex. « au moins une tâche en retard dans la phase »).
- **Dépendances légères** entre tâches (ou phases) en **itération ultérieure** : sans viser un moteur de planning type MS Project.

**Definition of Done suggérée** : la question « **pourquoi ce projet est en retard ?** » trouve une réponse **tâche → phase → jalon** dans l’app.

---

## 5. Phase 3 — Rituel PMO léger (reporting)

**Objectif** : supporter les **réunions de pilotage** sans duplicate massif dans des tableurs.

**Pistes de livrables** :

- **Export** structuré (CSV et/ou PDF) : projet, phases, tâches clés, dates, statuts.
- **Résumé partageable** adapté aux usages déjà présents dans le produit (copier-coller, lien lecture si pertinent).
- **Vue multi-projets minimaliste** (liste santé + échéances) si la charge le permet — sans viser un PPM complet.

**Definition of Done suggérée** : un PM peut **préparer un comité-rep** sans tout reconstruire dans Sheets à la main.

---

## 6. Partage lecture seule et exports « steering » (client, managers)

Objectif **PMO** : permettre au porteur de projet de donner de la **visibilité** à un **client** ou à des **managers** sans leur donner le contrôle opérationnel — aligné avec la promesse « pilotage + exécution ».

### 6.1 Partage de projet en lecture seule

- **Valeur** : socle de la visibilité externe ; à traiter comme **évolution produit + sécurité** (au-delà du partage intra-équipe déjà présent dans Wroket).
- **Modèles possibles** (à trancher en conception) :
  - **Lien signé** (token) : accès sans compte Wroket, révocation et **expiration** du lien pour limiter la fuite d’URL.
  - **Invité** avec compte restreint **read-only** sur un périmètre projet.
- **Périmètre affichable** : quelles tâches, commentaires, pièces jointes, noms ou emails — impact **RGPD** et **secrets commerciaux** ; prévoir des options de masquage progressives si besoin.
- **Ordre** : cadrer **qui lit quoi** avant d’industrialiser les exports riches (les KPIs affichés au client doivent refléter les **mêmes règles** que la vue partagée).

### 6.2 Exports pour réunions (KPIs d’avancement)

- **Besoin** : une **slide ou équivalent** à jour pour comité-rep / QBR — fort symbole utilisateur.
- **Phasing réaliste** :
  - **V1 (rapide à maintenir)** : **PDF** ou **HTML imprimable** avec synthèse projet + KPIs déjà calculables (jalons, avancement, retards, santé par phase), ou **export vers Google Sheets** avec graphiques que l’utilisateur insère dans Slides.
  - **V2 (chantier lourd)** : génération **.pptx** (templates, mise en page) ou intégration **Google Slides API** (OAuth, quotas, droits) — à n’ouvrir que si la **V1** ne suffit pas en retour terrain.
- **KPIs** : alignés sur les données produites en **phases 1–2** (sinon risque de métriques décoratives).

### 6.3 Non-régression produit

Tout partage externe ou export doit passer la grille [`feature-completeness-gate`](../.cursor/rules/feature-completeness-gate.mdc) : **révocation**, message d’erreur clair, cohérence UI, et [`data-safety`](../.cursor/rules/data-safety.mdc) pour les jetons, journaux d’accès si pertinent.

---

## 7. Phase 4 — Qualité et non-régression

À mener en parallèle ou juste après les phases 1–3 (et les chantiers **section 6** lorsqu’ils sont engagés) :

- Parcours **E2E** projet (création phase → tâche → signal de retard / santé).
- **Performances et lisibilité** sur les vues projet lourdes si le volume de données augmente.
- **Mobile** : lecture minimale du statut projet ; pas l’intégralité du pilotage avancé sur petit écran.

Respecter la règle [`feature-completeness-gate`](../.cursor/rules/feature-completeness-gate.mdc) et les contraintes [`data-safety`](../.cursor/rules/data-safety.mdc) pour toute évolution persistante.

---

## 8. Arbitrages à maintenir

- Ne pas diluer le produit en **concurrence directe** avec Notion (wiki) ou Monday (automations infinies) : l’angle reste **exécution + visibilité projet** et **alignement Google** là où c’est pertinent.
- Privilégier **une verticale complète** (ex. visibilité du retard de bout en bout) plutôt que de nombreuses fonctions partiellement intégrées.

---

## 9. Lien avec le ROADMAP technique

Ce plan **s’imbrique** avec les lots **UX-2** (parcours tâches) et les fonctionnalités projet déjà livrées (Board, Gantt, phases, temps par phase, etc.). Les phases 1–3 et la **section 6** (partage / exports) peuvent être traduites en entrées **Now / Next** du [ROADMAP](../ROADMAP.md) lors des arbitrages de sprint.

---

## 10. Références internes

- [ROADMAP](../ROADMAP.md)
- [Session produit utilisateur — plan d’action](./product-user-session.md)
- [Refonte UI — idées](./refonte-ui-ideas.md)
- [`.cursorrules`](../.cursorrules)
