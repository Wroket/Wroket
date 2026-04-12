# P0 — Volet 2 : Tests E2E (Playwright) + CI

Objectif : quelques parcours critiques automatisés (santé API, chargement app, login) et intégration dans GitHub Actions.

**État** : smoke **implémenté** — dossier [`e2e/`](../../e2e/), workflow [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml), commande racine `npm run test:e2e`. Voir [`e2e/README.md`](../../e2e/README.md).

---

## 1. Structure du projet E2E

| Qui | Actions |
|-----|---------|
| **Assistant** | Crée un dossier `e2e/` à la racine avec `package.json`, `@playwright/test`, `playwright.config.ts` (baseURL, timeouts, `webServer` ou pas — voir §3). |
| **Assistant** | Ajoute `e2e/.gitignore` pour `test-results/`, `playwright-report/`, traces si besoin. |
| **Toi** | Rien de bloquant ; valide la structure après PR. |

---

## 2. Premiers scénarios de test

| Qui | Actions |
|-----|---------|
| **Assistant** | Test **smoke API** : `request.get(`${API_URL}/health`)` → JSON `status: ok` (adapter selon [`healthService`](../../backend/src/services/healthService.ts)). |
| **Assistant** | Test **UI** : ouvrir `/login`, vérifier présence champs / titre (sans dépendre du contenu i18n fragile — sélecteurs `data-testid` si on en ajoute). |
| **Assistant** | Test **login** (si secrets fournis) : remplir email/mot de passe, soumettre, attendre redirection ou cookie ; nécessite **compte dédié** environnement test. |
| **Toi** | Crée un **utilisateur de test** (email + mot de passe) sur un environnement dédié (staging) ou accepte un compte jetable en local uniquement. |
| **Toi** | Dans **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions** : ajoute `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (et si besoin `E2E_BASE_URL`, `E2E_API_URL`). Ne commite jamais ces valeurs. |

---

## 3. Stratégie d’exécution (local vs CI)

### Option A — Stack complet dans la CI (plus lourd)

| Qui | Actions |
|-----|---------|
| **Assistant** | Dans `playwright.config.ts`, `webServer` : démarrer backend (`USE_LOCAL_STORE=true`, `PORT=3001`, `ALLOWED_ORIGINS` incluant `http://localhost:3000`) + frontend (`next dev` ou `next start` après build). |
| **Assistant** | Script npm à la racine ou dans `e2e/` : `npm run test:e2e`. |
| **Toi** | Vérifie que le **workflow** a assez de RAM/temps (timeout job 15–20 min si build Next). |

### Option B — CI contre URL staging (plus léger en CI)

| Qui | Actions |
|-----|---------|
| **Toi** | Déploie un environnement de **staging** (ou réutilise prod en lecture seule avec compte test faible privilège — déconseillé pour écritures). |
| **Toi** | Secret `E2E_BASE_URL=https://…` pointant vers le frontend staging. |
| **Assistant** | Job CI : `npx playwright test` sans `webServer`, uniquement `E2E_BASE_URL` + secrets login. |
| **Assistant** | Documente dans ce fichier ou README e2e quand utiliser A vs B. |

---

## 4. CORS et cookies (pièges fréquents)

| Qui | Actions |
|-----|---------|
| **Assistant** | Vérifie que `ALLOWED_ORIGINS` du backend inclut l’origine Playwright (`http://localhost:3000` en local). Voir [`app.ts` CORS](../../backend/src/app.ts). |
| **Assistant** | Si login par cookie : `storageState` Playwright pour réutiliser la session entre tests. |
| **Toi** | Si staging utilise un domaine différent, aligne `COOKIE_SECURE`, `FRONTEND_URL`, CORS comme en prod. |

---

## 5. Intégration GitHub Actions

| Qui | Actions |
|-----|---------|
| **Assistant** | Ajoute un job `e2e` dans [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) ou fichier dédié `.github/workflows/e2e.yml` (on PR + push main). |
| **Assistant** | Étapes typiques : checkout, setup Node, `npm ci` dans `e2e/`, `npx playwright install --with-deps`, lancer tests, uploader **artifact** `playwright-report` en cas d’échec. |
| **Toi** | Ajoute les **secrets** requis au repo (voir §2). |
| **Toi** | Si coût CI : limite le job e2e aux **PR** vers `main` ou exécution **quotidienne** (`schedule`) au lieu de chaque push. |

---

## 6. Synthèse des responsabilités

| Livrable | Toi | Assistant |
|----------|-----|-----------|
| Compte + secrets E2E | Création utilisateur test, secrets GitHub | — |
| Choix stratégie CI (A vs B) | Décision (staging vs full stack) | Recommandation dans PR |
| Dossier `e2e/`, config Playwright | Review | Implémentation |
| Tests smoke + login | — | Implémentation |
| Job GitHub Actions | Activation secrets | Workflow YAML |

---

## Checklist de fin de volet

- [ ] `e2e/` avec au moins **2 tests** (API health + page login).
- [ ] **Login E2E** (si secrets fournis) ou reporté explicitement en « suivant ».
- [ ] **CI** verte sur une branche de test.
- [ ] **Secrets** documentés (noms des variables, pas les valeurs).
