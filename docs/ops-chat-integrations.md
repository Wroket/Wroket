# Ops chat integrations — checklist propriétaire (une fois)

Source de vérité pour brancher **Slack+ / Teams+ / Google Chat+ / Discord+** en prod multi-clients.  
Public cible : [chat-integrations-clients.md](./chat-integrations-clients.md).  
Priorité : [chat-channel-priority.md](./chat-channel-priority.md) — **Slack golden path** → Teams sideload/deep link → Chat privé → Discord niche (ops autorisée).  
**Différé :** Google Marketplace public, Microsoft Teams Store / Partner Center.

Tu configures **une app Wroket par plateforme**. Les clients font **Connecter** dans Paramètres + installer l’app dans leur espace (sauf Slack où le canal se choisit à l’OAuth).

---

## 1. Slack — [api.slack.com/apps](https://api.slack.com/apps)

**Prod déjà :** `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` montés (`cloudbuild.yaml`).  
Redirect env : `https://api.wroket.com/integrations/slack/callback`.

### Console Slack App

- [x] Ouvrir l’app Wroket (réf. code : `A0ASUUQ8DQE` dans `slackOAuthService.ts`) — **2026-11-08**
- [x] **OAuth & Permissions → Redirect URLs** :
  - `https://api.wroket.com/integrations/slack/callback` — **confirmé 2026-11-08** (Edit/Delete + App Manifest)
  - (dev) `http://localhost:3001/integrations/slack/callback` — optionnel, non présent en console
- [x] **Bot Token Scopes** — **confirmés App Manifest 2026-11-08** :
  - `chat:write`
  - `channels:read`
  - `groups:read`
  - `incoming-webhook`
  - `users:read`
  - `users:read.email`
  - (+ `commands`)
- [x] **Interactivity & Shortcuts** → Request URL :
  - `https://api.wroket.com/integrations/slack/interactions` — **App Manifest `settings.interactivity` is_enabled + request_url 2026-11-08** (UI sticky Save faux dirty ; unsigned POST → 401)
- [x] **Slash Commands** → commande `/wroket` → Request URL :
  - `https://api.wroket.com/integrations/slack/commands` — **App Manifest + commande listée 2026-11-08** (unsigned POST → 401)
- [x] **Manage Distribution** : public distribution **active** (app `A0ASUUQ8DQE`, confirmé 2026-08-13 — bouton « Deactivate Public Distribution » visible)
- [ ] Si scopes modifiés : dans Wroket → **Reconnecter** Slack

### Smoke

- [x] Paramètres → Connecter Slack → choisir un canal — **2026-11-07** (Profil 5 NomPrenom + Profil 3 Test1/bebroudeur + Professionnel → `#notifications-wroket`)
- [x] **Envoyer un test** — messages « Test Wroket — connexion Slack OK ✅ » (16:43 ×2, 17:03, 18:17 Professionnel, 18:26 Profil 3 toast ; retest Professionnel 20:01–20:02 UTC+1 → API `slack/test` 200 ×3 ; retest 20:21 Professionnel + 20:24 NomPrenom toast « Message de test envoyé. » → `#notifications-wroket`)
- [x] Cliquer un bouton (accept/decline/complete) sur une notif OAuth — **2026-11-08** Professionnel / `#notifications-wroket` : Accepter → `✅ Tâche « Smoke Slack boutons E2E » acceptée` (tentative antérieure mismatch `email canal ≠ destinataire` si Slack user ≠ destinataire)
- [x] `/wroket help` — Professionnel 18:19 (éphémère Commandes /wroket)
- [x] `/wroket my-week` — Profil 5 (semaine vide) + Profil 3 (17:04 « Ma semaine (1) ») + Professionnel 18:19 « Ma semaine (4) » retards

Détail technique : [slack-plus.md](./slack-plus.md)

---

## 2. Azure / Entra / Teams

**Déjà fait (partiel) :** bot `wroket-teams`, endpoint messaging, App ID `e75f60be-547f-40fe-b910-5feb59a600bc`, OAuth Teams + redirect callback.

**Type de bot (2026-11-08) :** Azure Bot `wroket-teams` reste **Client unique** — UI grisée ; création Multilocataire Azure Bot dépréciée côté Microsoft (après 2025-07-31). Entra app `e75f60be-…` reste **multilocataire + MSA** pour OAuth. Canaux Teams / Direct Line / Web Chat = **Healthy** ; endpoint = `https://api.wroket.com/integrations/teams/interactions`. Pour les replies Connector en SingleTenant : env `TEAMS_BOT_TENANT_ID=4d7ec8e5-e09d-439d-8954-0f90454b1b28` (home tenant).

### Entra — inscription **Wroket** (`e75f60be-547f-40fe-b910-5feb59a600bc`)

- [x] **Authentification → URI Web** :
  - `https://api.wroket.com/integrations/teams/callback`
  - (dev) `http://localhost:3001/integrations/teams/callback`
  - (+ SSO / calendrier déjà documentés dans [microsoft-azure.md](./microsoft-azure.md))
  — **validé propriétaire 2026-11-13**
- [x] **Types de comptes** : **Comptes dans un annuaire d’organisation (multilocataire)** — **validé propriétaire 2026-11-13**  
  Optionnel : + comptes Microsoft personnels (SSO) — les canaux Teams restent surtout M365.
- [x] **Jetons ID** cochés (si SSO Microsoft) — **validé propriétaire 2026-11-13**

### Azure Bot `wroket-teams`

- [x] **Configuration** → type de bot = **Client unique** (accepté — Multilocataire Azure Bot indisponible / déprécié)
- [x] Messaging endpoint : `https://api.wroket.com/integrations/teams/interactions`
- [x] **Canaux** → Microsoft Teams / Direct Line / Web Chat = Healthy (2026-11-08)
- [x] **Profil de bot** → icône : `docs/assets/azure/wroket-bot-color-192.png` (outline 32px : `wroket-bot-outline-32.png`) — **validé propriétaire 2026-11-13**
- [x] Smoke Web Chat après connector `from=recipient` + authority SingleTenant (2026-11-08) — reply visible (identité Wroket absente en Web Chat = attendu)
- [x] Smoke Teams 1:1 / canal org (sideload zip + deep link `users=28:APP_ID`) — **validé propriétaire 2026-11-13**

### App Teams (package) — parcours pragmatique (pas Store)

- [x] Zip : [`docs/assets/azure/wroket-teams-app.zip`](./assets/azure/wroket-teams-app.zip) + lien Paramètres
- [x] Tester org M365 : Upload custom app → canal → `@Wroket` → Wroket **Envoyer un test** — **validé propriétaire 2026-11-13**
- [x] Deep link Paramètres « Ouvrir dans Teams » → mémoriser conversation — **validé propriétaire 2026-11-13**
- [ ] **Marketplace / Partner Center = différé** (priorité produit 2026-11-08)

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
  - Visibility Broudeur : **domaine entier** (case « specific people » **décochée** + Save) — **2026-11-08** 12:48 UTC+1 (précédemment limité à `francois@broudeur.com`)
  - Service account : `service-846885741813@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`
  - **Pas de Verification Token** dans l’UI add-on → auth = **OIDC Bearer** (audience = HTTP endpoint, email = SA)
- [x] OAuth client (existant) — redirect `https://api.wroket.com/integrations/google-chat/callback` — **2026-11-07** consent Chat scopes OK
- [x] Scopes Chat (spaces + messages) accordés — Professionnel `francois@broudeur.com` **2026-11-07** 18:30 toast « Google Chat connecté »
- [x] **Reconnecter** après passage à `chat.messages.create` (2026-11-08) — scopes create-only (évite CASA) — **validé propriétaire 2026-11-13**
- [x] Marketplace listing **Private** (domaine Broudeur) — publié + install Individuel **2026-11-07** ; **Visibility Marketplace verrouillée Private** (irréversible dans ce projet GCP)
- [ ] App installable hors domaine Broudeur (autres Workspace) — **bloqué** : Marketplace Public exige **nouveau projet GCP** + review Google (ne peut pas basculer Private→Public sur `involuted-reach-490718-h4`)
- [x] Env Cloud Run (plain, pas Secret Manager) — via `cloudbuild.yaml` :
  - `GOOGLE_CHAT_PROJECT_NUMBER=846885741813`
  - `GOOGLE_CHAT_SERVICE_ACCOUNT_EMAIL=service-846885741813@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`
  - `GOOGLE_CHAT_HTTP_ENDPOINT=https://api.wroket.com/integrations/google-chat/interactions`
- [x] Connexion Wroket : Professionnel `francois@broudeur.com` → **Connecté · Site FTB - Aug 19** (espace déjà sélectionné) — **2026-11-07** 18:30
- [x] **Envoyer un test** depuis Connexions — Professionnel **2026-11-07** 20:05 UTC+1 → API `google-chat/test` **200** ; message « Test Wroket — connexion Google Chat OK ✅ » visible dans l’espace **Site FTB - Aug 19** (chat.google.com)
- [x] Smoke E2E : `@Wroket help` + `@Wroket overdue` (OIDC inbound) — **2026-11-07** 23:45–23:46 UTC+1 : Marketplace private listing publié + install Individuel ; POSTs `Google-gsuiteaddons` **200** sur `/interactions` ; réponses visibles dans **Wroket notifs** (help + overdue)

Sans Workspace : Chat+ non testable (Gmail seul hors cible).

Détail : [google-chat-plus.md](./google-chat-plus.md)

---

## 4. GCP / deploy (après secrets console)

Ordre :

1. Créer secrets Secret Manager + IAM
2. Ajouter les **noms** à `--set-secrets` dans [`cloudbuild.yaml`](../cloudbuild.yaml) (liste complète, ne rien omettre)
3. Push `main` → Cloud Build → `wroket-api`
4. Smoke E2E par canal

**Ne pas** ajouter `TEAMS_BOT_*` / `DISCORD_*` / `GOOGLE_CHAT_VERIFICATION_TOKEN` à `--set-secrets` avant que les secrets existent (deploy échoue).

---

## 5. Discord — [discord.com/developers/applications](https://discord.com/developers/applications)

Détail : [discord-plus.md](./discord-plus.md). Code prêt ; **secrets Cloud Run = reste ops**.

### Console Discord Application

- [x] **New Application** → `Wroket` (`1569120606555742218`) — **2026-11-08**
- [x] **Bot** → Reset Token → Secret Manager `DISCORD_BOT_TOKEN` — **2026-11-08**
- [x] **OAuth2 → Redirects** — `https://api.wroket.com/integrations/discord/callback` — **2026-11-08**
  - (dev) `http://localhost:3001/integrations/discord/callback` — optionnel
- [x] Client ID / Client Secret → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — **2026-11-08**
- [x] **General Information** → Public Key → `DISCORD_PUBLIC_KEY` — **2026-11-08**
- [x] **Interactions Endpoint URL** :
  - `https://api.wroket.com/integrations/discord/interactions` — **enregistré 2026-11-08** (validation Discord OK)
- [x] Register slash `/wroket` (option `text`) — command id `1569122634661371994` — **2026-11-08**

### GCP

- [x] Créer les 4 secrets + IAM `wroket-run` Secret Accessor — **2026-11-08**
- [x] Ajouter à `--set-secrets` dans [`cloudbuild.yaml`](../cloudbuild.yaml) + montage immédiat Cloud Run `wroket-api-00475-rp7` — **2026-11-08**
- [x] `DISCORD_REDIRECT_URI` déjà en plain env prod

### Smoke

- [x] Paramètres → Connecter Discord → serveur **Wroket** — **2026-11-09** (`discord=connected`)
- [x] Salon texte auto + Test message OK — **2026-11-09** (`#aide-aux-devoirs`)
- [x] Liaison compte pour `/wroket` — ID Discord collé manuellement (auto-link OAuth au prochain Reconnect) — **2026-11-09**
- [x] Envoyer un test → message dans le salon — **2026-11-09**
- [x] `/wroket help` + liste tâches — **2026-11-09** (`#général`)
- [x] `/wroket complete` (smoke-btn-test + Smoke Slack boutons E2E) — **2026-11-09**

---

## 6. Ordre recommandé

| # | Où | Action |
|---|-----|--------|
| 1 | Slack | URLs + distribution + smoke |
| 2 | Entra + Azure Bot | Canal Teams + zip / deep link |
| 3 | Google | Chat API + scopes create + smoke |
| 4 | Discord | Portal + secrets + slash + smoke |
| 5 | GCP | Monter secrets dédiés seulement après création |

**Pas maintenant :** bot time tracking, clone Gryzzly, stores publics.

---

## Endpoints prod (rappel)

| Canal | OAuth callback | Inbound |
|-------|----------------|---------|
| Slack | `/integrations/slack/callback` | `/integrations/slack/interactions`, `/integrations/slack/commands` |
| Teams | `/integrations/teams/callback` | `/integrations/teams/interactions` |
| Google Chat | `/integrations/google-chat/callback` | `/integrations/google-chat/interactions` |
| Discord | `/integrations/discord/callback` | `/integrations/discord/interactions` |

Base : `https://api.wroket.com`
