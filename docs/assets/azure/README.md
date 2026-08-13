# Package app Microsoft Teams — Wroket

Fichiers pour sideload / upload custom app :

| Fichier | Rôle |
|---------|------|
| `wroket-teams-app.zip` | Package à uploader dans Teams |
| `teams-app/manifest.json` | Manifest (botId = App ID Entra Wroket) |
| `teams-app/color.png` | Icône 192×192 |
| `teams-app/outline.png` | Icône outline 32×32 |
| `wroket-bot-color-192.png` | Source icône Azure Bot Profile |
| `wroket-bot-outline-32.png` | Source outline |

## Installation test (org M365)

1. Azure Bot `wroket-teams` : type **Multilocataire** + canal **Microsoft Teams** activé  
2. Teams → Apps → Manage your apps → **Upload a custom app** → choisir `wroket-teams-app.zip`  
3. Ajouter à une équipe / canal  
4. `@Wroket hello`  
5. wroket.com → Paramètres → Intégrations → Teams → **Envoyer un test**

Compte perso sans org Teams : parcours canal impossible — utiliser `@wroket.com` ou sandbox M365.

Checklist complète : [ops-chat-integrations.md](../ops-chat-integrations.md) §2.
