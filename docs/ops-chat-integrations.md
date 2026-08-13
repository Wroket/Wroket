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
- [ ] **Manage Distribution** : **pas** « Internal only » — distribution activée (tout workspace)
- [ ] Si scopes modifiés : dans Wroket → **Reconnecter** Slack

### Smoke

- [ ] Paramètres → Connecter Slack → choisir un canal
- [ ] **Envoyer un test**
- [ ] Cliquer un bouton (accept/decline/complete) sur une notif OAuth
- [ ] `/wroket help` puis `/wroket my-week`

Détail technique : [slack-plus.md](./slack-plus.md)

---

## 2. Azure / Entra / Teams

**Déjà fait (partiel) :** bot `wroket-teams`, endpoint messaging, App ID `e75f60be-547f-40fe-b910-5feb59a600bc`, OAuth Teams + redirect callback.

**Bloquant multi-clients :** bot encore **Client unique** → passer **Multilocataire**.

### Entra — inscription **Wroket** (`e75f60be-547f-40fe-b910-5feb59a600bc`)

- [ ] **Authentification → URI Web** :
  - `https://api.wroket.com/integrations/teams/callback`
  - (dev) `http://localhost:3001/integrations/teams/callback`
  - (+ SSO / calendrier déjà documentés dans [microsoft-azure.md](./microsoft-azure.md))
- [ ] **Types de comptes** : **Comptes dans un annuaire d’organisation (multilocataire)**  
  Optionnel : + comptes Microsoft personnels (SSO) — les canaux Teams restent surtout M365.
- [ ] **Jetons ID** cochés (si SSO Microsoft)

### Azure Bot `wroket-teams`

- [ ] **Configuration** → type de bot → **Multilocataire** (plus Client unique)
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

**Code :** replies inbound via Bot Connector — déployer `main` après merge (voir §4).

Détail : [teams-plus.md](./teams-plus.md), [microsoft-azure.md](./microsoft-azure.md)

---

## 3. Google Chat — Cloud Console (`involuted-reach-490718-h4`)

**Pas encore commencé.** Env déjà : `GOOGLE_CHAT_REDIRECT_URI`. Fallback OAuth : `GOOGLE_CLIENT_*`.

- [ ] Activer **Google Chat API**
- [ ] Configurer l’app Chat :
  - HTTP endpoint : `https://api.wroket.com/integrations/google-chat/interactions`
  - Copier le **Verification Token**
- [ ] OAuth client (existant ou dédié) — redirect :
  - `https://api.wroket.com/integrations/google-chat/callback`
- [ ] Scopes : `openid` `email` `profile` +  
  `https://www.googleapis.com/auth/chat.spaces` +  
  `https://www.googleapis.com/auth/chat.messages`
- [ ] App installable hors domaine Wroket (autres Workspace)
- [ ] Secret Manager :
  - `GOOGLE_CHAT_VERIFICATION_TOKEN`
  - (si client dédié) `GOOGLE_CHAT_CLIENT_ID` / `GOOGLE_CHAT_CLIENT_SECRET`
  - IAM `wroket-run` Secret Accessor
- [ ] Monter dans `cloudbuild.yaml` `--set-secrets` **seulement après** création
- [ ] Smoke : compte **Google Workspace** → Connecter → ajouter l’app à un espace → test + `@Wroket overdue`

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
