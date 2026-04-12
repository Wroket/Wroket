# P0 — Volet 4 : Tests unitaires ciblés

Objectif : compléter les E2E (volet 2) par des **tests rapides** sur la logique pure ou critique : helpers crypto, validation, parsing import, règles métier isolables — **sans** viser une couverture 100 % au premier passage.

Référence roadmap : après E2E sur parcours critiques, **tests unitaires ciblés** (backend puis frontend).

---

## 1. Outils

| Qui | Actions |
|-----|---------|
| **Assistant** | Backend : ajoute **Vitest** (ou Jest) dans [`backend/package.json`](../../backend/package.json) — scripts `test`, `test:watch`, config `vitest.config.ts` avec `environment: node`, alias vers `src/`. |
| **Assistant** | Frontend : Vitest + `@testing-library/react` **uniquement si** premiers tests sur utilitaires purs ; composants lourds (modales, DnD) peuvent attendre. |
| **Toi** | Valide le choix **Vitest** (moderne, ESM) vs Jest si tu as une préférence d’équipe. |

---

## 2. Cibles prioritaires (backend)

| Qui | Actions |
|-----|---------|
| **Assistant** | Identifier des modules **sans** I/O réseau pour démarrer : |
| | • Parsing / validation : ex. [`taskImportService`](../../backend/src/services/taskImportService.ts) (`parseTaskImportBuffer`, règles sur lignes). |
| | • Utilitaires erreurs, normalisation dates ISO si extraits. |
| | • Fonctions pures dans `reminderService`, `activityLogService` si testables sans mock Firestore lourd. |
| **Assistant** | Mock **Firestore** / `getStore` uniquement quand nécessaire — sinon privilégier fonctions extraites testables avec entrées/sorties claires. |
| **Toi** | Liste les **3–5 zones** à risque métier que tu veux verrouiller en priorité ; l’assistant les couvre en premier. |

---

## 3. Cibles prioritaires (frontend)

| Qui | Actions |
|-----|---------|
| **Assistant** | Commencer par **fonctions pures** : formatage dates, helpers dans `lib/`, parseurs légers — pas les pages complètes. |
| **Assistant** | Un composant **petit** sans router si besoin d’un premier test RTL (bouton, affichage conditionnel). |
| **Toi** | Éviter d’exiger couverture sur **TaskEditModal** ou Gantt en première itération (coût élevé). |

---

## 4. CI

| Qui | Actions |
|-----|---------|
| **Assistant** | Ajoute une étape dans [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) : après `tsc`, `npm test` dans `backend/` (et `frontend/` si tests ajoutés). |
| **Assistant** | Échec CI si un test unitaire échoue. |
| **Toi** | Surveiller le **temps de job** ; les tests unitaires doivent rester < 1–2 min au début. |

---

## 5. Synthèse des responsabilités

| Livrable | Toi | Assistant |
|----------|-----|-----------|
| Priorités métier à verrouiller | Liste courte (commentaire issue ou ce doc) | — |
| Setup Vitest backend (+ frontend optionnel) | — | package.json, config |
| Premiers fichiers `*.test.ts` | — | Implémentation |
| Job CI `npm test` | — | Workflow YAML |

---

## Checklist de fin de volet

- [ ] `npm test` passe en local dans **backend**.
- [ ] Au moins **5–10 tests** significatifs (pas uniquement snapshots vides).
- [ ] **CI** exécute les tests sur chaque PR / push `main`.
- [ ] (Optionnel) Premiers tests **frontend** sur utilitaires.
