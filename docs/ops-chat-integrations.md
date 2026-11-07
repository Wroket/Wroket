# Ops chat integrations — checklist propriétaire (une fois)

Source de vérité pour brancher **Slack+ / Teams+ / Google Chat+** en prod multi-clients.  
Public cible : [chat-integrations-clients.md](./chat-integrations-clients.md).

Tu configures **une app Wroket par plateforme**. Les clients ne font que **Connecter** dans Paramètres + installer l’app dans leur espace.

---

## 1. Slack — [api.slack.com/apps](https://api.slack.com/apps)

**Prod déjà :** `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` montés (`cloudbuild.yaml`).  
Redirect env : `https://api.wroket.com/integrations/slack/callback`.

### Console Slack App

- [ ] Ouvrir l’app Wroket (réf. code : `A0ASUUQ8DQE` dans `slackOAuthService.ts`)
- [ ] **OAuth & Permissions → Redirect URLs** :
  - `https://api.wroket.com/integrations/slack/callback`
  - (dev) `http://localhost:3001/integrations/slack/callback`
- [ ] **Bot Token Scopes** :
  - `chat:write`
  - `channels:read`
  - `groups:read`
  - `incoming-webhook`
  - `users:read`
  - `users:read.email`
- [ ] **Interactivity & Shortcuts** → Request URL :
  - `https://api.wroket.com/integrations/slack/interactions`
- [ ] **Slash Commands** → commande `/wroket` → Request URL :
  - `https://api.wroket.com/integrations/slack/commands`
- [x] **Manage Distribution** : public distribution **active** (app `A0ASUUQ8DQE`, confirmé 2026-08-13 — bouton « Deactivate Public Distribution » visible)
- [ ] Si scopes modifiés : dans Wroket → **Reconnecter** Slack

### Smoke

- [x] Paramètres → Connecter Slack → choisir un canal — **2026-11-07** (Profil 5 NomPrenom + Profil 3 Test1/bebroudeur + Professionnel → `#notifications-wroket`)
- [x] **Envoyer un test** — messages « Test Wroket — connexion Slack OK ✅ » (16:43 ×2, 17:03, 18:17 Professionnel, 18:26 Profil 3 toast ; retest Professionnel 20:01–20:02 UTC+1 → API `slack/test` 200 ×3 ; retest 20:21 Professionnel + 20:24 NomPrenom toast « Message de test envoyé. » → `#notifications-wroket`)
- [ ] Cliquer un bouton (accept/decline/complete) sur une notif OAuth
- [x] `/wroket help` — Professionnel 18:19 (éphémère Commandes /wroket)
- [x] `/wroket my-week` — Profil 5 (semaine vide) + Profil 3 (17:04 « Ma semaine (1) ») + Professionnel 18:19 « Ma semaine (4) » retards

Détail technique : [slack-plus.md](./slack-plus.md)

---

## 2. Azure / Entra / Teams

**Déjà fait (partiel) :** bot `wroket-teams`, endpoint messaging, App ID `e75f60be-547f-40fe-b910-5feb59a600bc`, OAuth Teams + redirect callback.

**Bloquant multi-clients :** bot encore **Client unique** → passer **Multilocataire**.  
*Note 2026-11-07 :* portal Azure demande le mot de passe Microsoft (`francois@broudeur.com` / login.live) — **bloqué sans auth interactive** ; reprendre Multilocataire dès session Azure ouverte.

### Entra — inscription **Wroket** (`e75f60be-547f-40fe-b910-5feb59a600bc`)

- [ ] **Authentification → URI Web** :
  - `https://api.wroket.com/integrations/teams/callback`
  - (dev) `http://localhost:3001/integrations/teams/callback`
  - (+ SSO / calendrier déjà documentés dans [microsoft-azure.md](./microsoft-azure.md))
- [ ] **Types de comptes** : **Comptes dans un annuaire d’organisation (multilocataire)**  
  Optionnel : + comptes Microsoft personnels (SSO) — les canaux Teams restent surtout M365.
- [ ] **Jetons ID** cochés (si SSO Microsoft)

### Azure Bot `wroket-teams`

- [ ] **Configuration** → type de bot → **Multilocataire** (plus Client unique) — *bloqué 2026-11-07 : login Azure (`francois.broudeur@hotmail.fr`) non complété (autofill / mot de passe)*
- [ ] Messaging endpoint : `https://api.wroket.com/integrations/teams/interactions`
- [ ] **Canaux** → Microsoft Teams → activer → **Appliquer**
- [ ] **Profil de bot** → icône : `docs/assets/azure/wroket-bot-color-192.png` (outline 32px : `wroket-bot-outline-32.png`)

### App Teams (package)

- [ ] Zip prêt : [`docs/assets/azure/wroket-teams-app.zip`](./assets/azure/wroket-teams-app.zip)
- [ ] Tester avec compte **org M365** (`@wroket.com` ou sandbox) : Apps → Upload custom app → ajouter au canal
- [ ] `@Wroket hello` puis Wroket → **Envoyer un test**
- [ ] Prod clients : sideload / publish to org (Marketplace = plus tard)

### GCP Teams (option propre)

Réutiliser `MICROSOFT_CLIENT_*` fonctionne pour OAuth. Option dédiée :

```bash
# Après avoir les valeurs App ID + secret client Entra :
gcloud secrets create TEAMS_BOT_APP_ID --replication-policy=automatic --project=involuted-reach-490718-h4
echo -n "e75f60be-547f-40fe-b910-5feb59a600bc" | gcloud secrets versions add TEAMS_BOT_APP_ID --data-file=-
gcloud secrets create TEAMS_BOT_APP_PASSWORD --replication-policy=automatic --project=involuted-reach-490718-h4
echo -n "<CLIENT_SECRET_VALUE>" | gcloud secrets versions add TEAMS_BOT_APP_PASSWORD --data-file=-
# IAM Secret Accessor pour wroket-run@…
# Puis ajouter TEAMS_BOT_APP_ID / TEAMS_BOT_APP_PASSWORD à --set-secrets dans cloudbuild.yaml
```

**Fait 2026-11-07 :** secrets `TEAMS_BOT_APP_ID` / `TEAMS_BOT_APP_PASSWORD` créés (password = copie `MICROSOFT_CLIENT_SECRET`), IAM `wroket-run`, montés sur Cloud Run (`wroket-api-00451-vkh` via `--update-secrets`) + noms ajoutés dans `cloudbuild.yaml` pour les prochains deploys.

**Code :** replies inbound via Bot Connector — déployer `main` après merge (voir §4).

Détail : [teams-plus.md](./teams-plus.md), [microsoft-azure.md](./microsoft-azure.md)

---

## 3. Google Chat — Cloud Console (`involuted-reach-490718-h4`)

Env déjà : `GOOGLE_CHAT_REDIRECT_URI`. Fallback OAuth : `GOOGLE_CLIENT_*`.

- [x] Activer **Google Chat API** — **2026-11-07** (`chat.googleapis.com` Enabled, projet `involuted-reach-490718-h4`)
- [x] Configurer l’app Chat (Configuration) — **2026-11-07** (Professionnel / `francois@broudeur.com`) :
  - App name `Wroket`, avatar `https://wroket.com/wroket-icon.png`, description `PMO tasks and planning for teams`
  - Workspace add-on **coché** (irréversible si décoché — laisser)
  - Interactive ON, Join spaces **coché**
  - Common HTTP endpoint : `https://api.wroket.com/integrations/google-chat/interactions`
  - Visibility Broudeur : `francois@broudeur.com`
  - Service account : `service-846885741813@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`
  - **Pas de Verification Token** dans l’UI add-on → auth = **OIDC Bearer** (audience = HTTP endpoint, email = SA)
- [x] OAuth client (existant) — redirect `https://api.wroket.com/integrations/google-chat/callback` — **2026-11-07** consent Chat scopes OK
- [x] Scopes Chat (spaces + messages) accordés — Professionnel `francois@broudeur.com` **2026-11-07** 18:30 toast « Google Chat connecté »
- [ ] App installable hors domaine Wroket (autres Workspace)
- [x] Env Cloud Run (plain, pas Secret Manager) — via `cloudbuild.yaml` :
  - `GOOGLE_CHAT_PROJECT_NUMBER=846885741813`
  - `GOOGLE_CHAT_SERVICE_ACCOUNT_EMAIL=service-846885741813@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`
  - `GOOGLE_CHAT_HTTP_ENDPOINT=https://api.wroket.com/integrations/google-chat/interactions`
- [x] Connexion Wroket : Professionnel `francois@broudeur.com` → **Connecté · Site FTB - Aug 19** (espace déjà sélectionné) — **2026-11-07** 18:30
- [x] **Envoyer un test** depuis Connexions — Professionnel **2026-11-07** 20:05 UTC+1 → API `google-chat/test` **200** ; message « Test Wroket — connexion Google Chat OK ✅ » visible dans l’espace **Site FTB - Aug 19** (chat.google.com)
- [ ] Smoke E2E restant : `@Wroket overdue` (OIDC inbound) — **2026-11-07** : aucun POST Cloud Logging sur `/interactions` (seulement GET 404 historiques) ; env OIDC Cloud Run OK. Fix code : normaliser payload **Workspace add-on** + réponse `DataActions` + GET health + logs OIDC (à déployer puis retester `@Wroket help` / `overdue`)

Sans Workspace : Chat+ non testable (Gmail seul hors cible).

Détail : [google-chat-plus.md](./google-chat-plus.md)

---

## 4. GCP / deploy (après secrets console)

Ordre :

1. Créer secrets Secret Manager + IAM
2. Ajouter les **noms** à `--set-secrets` dans [`cloudbuild.yaml`](../cloudbuild.yaml) (liste complète, ne rien omettre)
3. Push `main` → Cloud Build → `wroket-api`
4. Smoke E2E par canal

**Ne pas** ajouter `TEAMS_BOT_*` / `GOOGLE_CHAT_*` à `--set-secrets` avant que les secrets existent (deploy échoue).

---

## 5. Ordre recommandé

| # | Où | Action |
|---|-----|--------|
| 1 | Slack | URLs + distribution + smoke |
| 2 | Entra + Azure Bot | Multilocataire + canal Teams + zip |
| 3 | Git | Deploy Connector reply (`main`) |
| 4 | Google | Chat API + token + redirect + secrets |
| 5 | GCP | Monter secrets dédiés seulement après création |

**Pas maintenant :** Discord ops, bot time tracking, clone Gryzzly.

---

## Endpoints prod (rappel)

| Canal | OAuth callback | Inbound |
|-------|----------------|---------|
| Slack | `/integrations/slack/callback` | `/integrations/slack/interactions`, `/integrations/slack/commands` |
| Teams | `/integrations/teams/callback` | `/integrations/teams/interactions` |
| Google Chat | `/integrations/google-chat/callback` | `/integrations/google-chat/interactions` |

Base : `https://api.wroket.com`
