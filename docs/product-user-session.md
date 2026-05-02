# Session produit utilisateur — synthèse et plan d’action

Document de travail issu d’une revue produit (onboarding, friction, différenciation). Il complète le [ROADMAP](../ROADMAP.md) côté **expérience** ; il ne remplace pas les priorités techniques déjà tracées (fiabilité, billing, etc.).

**Dernière mise à jour** : 2026-05-01

---

## 1. Objectif de ce document

- Cadrer **ce que ressent un utilisateur** (premier jour, usage courant, comparaison implicite aux alternatives).
- Proposer un **plan d’action** priorisé, mesurable quand c’est possible, sans engager de charge de développement tant qu’une ligne n’est pas choisie dans le backlog.

---

## 2. Synthèse — Onboarding

### Ce qui existe

- Landing ([`frontend/src/app/page.tsx`](../frontend/src/app/page.tsx)) : promesse multi-piliers (Radar, agenda, notes, Kanban, collaboration, notifications).
- Tutoriel in-app ([`frontend/src/components/TutorialModal.tsx`](../frontend/src/components/TutorialModal.tsx)), persistance `wroket-tutorial-v2-seen`, réouverture depuis l’aide ([`AppShell`](../frontend/src/components/AppShell.tsx)).

### Hypothèses de friction

- **Écart landing ↔ premier pas** : plusieurs familles de fonctionnalités en marketing ; le chemin « je fais quoi en premier après connexion ? » peut rester flou.
- **Google Calendar** : fort levier pour la valeur « agenda réel » ; si la connexion tarde, le différenciateur agenda est sous-utilisé.
- **Happy path** : un parcours minimal explicite (« une tâche → planifier un créneau ») pourrait réduire la charge cognitive sans retirer les autres vues.

---

## 3. Synthèse — Friction (usage courant)

- **Densité UI** : barre d’actions par tâche ([`TaskIconToolbar`](../frontend/src/components/TaskIconToolbar.tsx)), multiples vues (liste, Radar, projets, agenda). Risque principal : **surcharge cognitive**, pas seulement lenteur.
- **Cohérence** : réunion, créneau, assignation doivent être **compris de la même façon** sur liste, cartes et agenda (aligné avec la complétude produit / tests E2E).
- **Refonte liste** (voir [refonte-ui-ideas](./refonte-ui-ideas.md)) : pertinent si elle **réduit** les coûts cognitifs (menu contextuel, tableau lisible) sans multiplier les modes.

---

## 4. Synthèse — Différenciation (vs marché)

| Axe | Lecture |
|-----|--------|
| Radar / quadrants | Usage courant (Eisenhower) ; plus-value = **lien** avec projets, deadlines, effort et reste du produit. |
| Agenda + Google + créneaux + Meet | Standard pour utilisateurs Google ; combo **tâche ↔ agenda ↔ réunion** orienté travail est un angle défendable. |
| Projets / Kanban / Gantt | Chevauche les outils « projet » ; positionnement réaliste : **solo / petite équipe**, pas suite enterprise complète. |
| Notes liées aux tâches | Différenciation si le lien note–tâche est **clair et utile** au quotidien. |

**Piste de positionnement (à valider)** : organiser par priorité (Radar), caler dans le calendrier réel (Google), faire collaborer sur le même objet — sans la complexité d’un gestionnaire de projet enterprise.

**Risque** : message trop généraliste ; il vaut mieux **un axe principal** en communication (ex. agenda + traction Google + radar pour indépendants / petites équipes).

---

## 5. Plan d’action

Les actions sont ordonnées par **impact utilisateur vs effort** indicatif. Ajuster selon capacité et ROADMAP.

### Phase A — Comprendre (faible coût, fort éclairage)

| # | Action | Résultat attendu | Effort |
|---|--------|-------------------|--------|
| A1 | Définir **3 questions** d’entretien utilisateur (première tâche, première planif, perception vs Todoist/Notion/agenda Google seul) | Script réutilisable | Très faible |
| A2 | Réaliser **3 à 5 entretiens** ou sessions observées (20–30 min) | Notes structurées (frictions réelles, pas seulement hypothèses) | Faible |
| A3 | Lister les **3 premiers écrans** après login et vérifier **un message / une action recommandée** sur chacun (même provisoire) | Cartographie friction jour 1 | Faible |

### Phase B — Réduire la friction sans refonte complète

| # | Action | Résultat attendu | Effort |
|---|--------|-------------------|--------|
| B1 | Rédiger un **happy path J1** en une phrase + lien ou checklist courte (doc ou tooltip) | Moins d’hésitation post-login | Faible |
| B2 | Vérifier que la **connexion Google Calendar** est mise en avant au bon moment (tutoriel, empty state agenda, ou rappel paramètres) | Taux de connexion agenda ↑ (à mesurer si instrumentation) | Moyen |
| B3 | Aligner **terminologie** Planifier / Radar / liste sur l’aide contextuelle et les écrans critiques | Moins d’erreurs de modèle mental | Faible à moyen |

### Phase C — Mesure et suivi (quand l’instrumentation est acceptable)

| # | Action | Résultat attendu | Effort |
|---|--------|-------------------|--------|
| C1 | Définir **2–4 événements** produit (ex. tutoriel terminé, compte Google agenda connecté, première tâche avec créneau) | Base pour funnel onboarding | Moyen (respect vie privée / consentement) |
| C2 | Rejouer la session **tous les 2–3 mois** ou après une grosse release UX | Itération continue | Faible |

### Phase D — Alignement roadmap

| # | Action | Résultat attendu | Effort |
|---|--------|-------------------|--------|
| D1 | Recouper ce plan avec les lots **UX-1 … UX-4** et **Now / Next** du [ROADMAP](../ROADMAP.md) | Pas de doublon ou conflit de priorités | Faible |
| D2 | Tracer la **refonte liste** ([refonte-ui-ideas](./refonte-ui-ideas.md)) comme suite logique **après** réduction des ambiguïtés onboarding | Refonte utile, pas décorative | Pilotage |

---

## 6. Prochaine revue

- Date cible de relecture : **à fixer** (suggestion : après Phase A ou après première livraison B1–B2).
- Responsable : **à désigner** (produit / fondateur).

---

## 7. Références internes

- [ROADMAP](../ROADMAP.md) — priorités et lots UX.
- [Refonte UI — idées](./refonte-ui-ideas.md) — pistes liste / menu contextuel / tableau.
- [Plan partie projet / PMO léger](./project-roadmap-pmo.md) — pilotage projet, jalons, lien tâches–plan.
- [`.cursorrules`](../.cursorrules) — critères techniques et produit (complétude, données).
