# Tests E2E (Playwright) — smoke

## Prérequis

- Backend sur **port 3001** (ex. `backend/.env` avec `PORT=3001`) et `USE_LOCAL_STORE=true` en local.
- Frontend Next sur **port 3000** (défaut).
- Ou : laisser Playwright lancer **`npm run dev`** avec **`cwd`** = `backend/` et `frontend/` (deux processus ; `backend/.env` est bien chargé — depuis la racine avec `--prefix`, le port/API peut être faux). Premier démarrage ~1–2 min.

## Commandes

Depuis la **racine du monorepo** (`Wroket`) :

```bash
npm install --prefix e2e
npm run install:browsers --prefix e2e
npm run test:e2e
```

Tu peux aussi lancer les E2E depuis **`backend/`** ou **`frontend/`** : `npm run test:e2e` (le script délègue vers `e2e/`).

Sans lancer le stack automatiquement (tu as déjà `npm run dev` dans un autre terminal) :

```bash
set E2E_SKIP_WEBSERVER=1
npm run test:e2e
```

(PowerShell : `$env:E2E_SKIP_WEBSERVER="1"`)

## Variables d’environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `E2E_BASE_URL` | `http://localhost:3000` | Base du frontend (aligné sur Next `localhost`) |
| `E2E_API_BASE_URL` | `http://localhost:3001` | Base de l’API (smoke `/health`) |
| `E2E_SKIP_WEBSERVER` | — | `1` pour ne pas exécuter `npm run dev` (**recommandé** si le démarrage auto time out) |
| `E2E_WEBSERVER_TIMEOUT_MS` | `420000` local / `360000` CI | Délai max d’attente du `webServer` (ms) |

### Si `Timed out waiting ... from config.webServer`

Le premier lancement peut compiler Next longtemps. Soit :

1. **Augmenter le délai** : `$env:E2E_WEBSERVER_TIMEOUT_MS="600000"` puis `npm run test:e2e`, ou  
2. **Mieux** : lancer le stack à la main dans un terminal (`cd C:\Wroket` puis `npm run dev`), attendre que les deux serveurs soient prêts, puis dans un autre terminal :

```powershell
$env:E2E_SKIP_WEBSERVER="1"
npm run test:e2e
```

(avec le préfixe `../e2e` depuis `backend` ou depuis la racine.)

## Fichiers

- `tests/smoke.api.spec.ts` — `GET /health`
- `tests/smoke.ui.spec.ts` — page `/login`
