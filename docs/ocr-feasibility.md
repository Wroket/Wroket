# OCR « photo vers note » — étude de faisabilité

*Statut : POC validé (2026-11-05), derrière feature flag (`OCR_ENABLED`).*

## 1. Objectif utilisateur

Transformer une photo (tableau blanc, carnet manuscrit, document imprimé, capture d'écran) en **texte éditable** dans une note Wroket, sans retaper. Le texte est **toujours prévisualisé et modifiable** avant insertion ; rien n'est persisté sans action explicite.

Bénéfice attendu : capture de réunion en quelques secondes, notes manuscrites recherchables, moins de friction entre papier et outil.

## 2. Verdict

**Faisable, risque faible, coût quasi nul**, via Google Cloud Vision `DOCUMENT_TEXT_DETECTION` sur l'endpoint UE `eu-vision.googleapis.com`, appelé depuis `wroket-api` (Cloud Run) :

| Critère | Résultat |
|---|---|
| Dépendance npm | Aucune (REST `fetch` + jeton du serveur de métadonnées) |
| Mémoire Cloud Run 256Mi | Suffisante : image normalisée côté navigateur (JPEG ≤ 2000 px, < 1 Mo typique) |
| Coût | 1000 unités/mois gratuites, puis 1,50 USD / 1000 |
| Données | Projet GCP existant, contrat de traitement GCP déjà en place ; requêtes synchrones non conservées |
| Langues | Détection automatique, plus de 100 langues imprimées |

## 3. Options OCR comparées

| Option | Qualité (imprimé / manuscrit) | Coût | Données | Verdict |
|---|---|---|---|---|
| **Google Cloud Vision** | Très bonne / bonne | Free tier 1000/mois | UE, sous DPA GCP | **Retenu pour le POC** |
| tesseract.js (navigateur) | Correcte / faible | Gratuit | Reste sur l'appareil | Repli possible « confidentialité stricte » ; 10–15 Mo à télécharger, lent sur mobile |
| Tesseract serveur | Correcte / faible | Gratuit | Interne | Non viable à 256Mi (binaire natif, image Docker alourdie) |
| Document AI | Excellente (PDF multipages, formulaires) | Pas de vrai free tier | UE | Surdimensionné pour le POC |
| LLM multimodal (Gemini) | Excellente + structuration | Tokens | Relève du gate IA ([ai-opportunities.md](ai-opportunities.md)) | Étape suivante (extraction de tâches), opt-in |

## 4. Sources d'import de la photo

Toutes les sources produisent une image dans le navigateur, normalisée puis envoyée à `POST /notes/:noteId/ocr`. **Le backend ne reçoit jamais de jeton Drive ou Dropbox.**

| Source | Mécanisme | Lot |
|---|---|---|
| Fichier (laptop / mobile) | `<input type="file" accept="image/*">` ; sur mobile le sélecteur natif expose aussi iCloud, Drive, Dropbox, OneDrive installés | POC |
| Caméra (mobile) | `<input capture="environment">` (appareil photo natif) | POC |
| Glisser-déposer | Zone de dépôt de la modale OCR | POC |
| Coller | Événement `paste` (capture d'écran) dans la modale OCR | POC |
| Pièce jointe image existante | `POST /notes/:noteId/attachments/:attachmentId/ocr` (note ou tâche liée) | POC |
| **Google Drive** | Google Identity Services (scope `drive.file`, jeton en mémoire) + Google Picker + `drive/v3/files/{id}?alt=media` | POC |
| **Dropbox** | Dropbox Chooser (`dropins.js`, `linkType: "direct"`), sans OAuth | POC |
| OneDrive (perso / pro) | File Picker v8 ; nécessite `@azure/msal-browser` ou un flux OAuth Wroket `Files.Read` | **Lot 2** |
| Box, iCloud web | Couverts par le sélecteur natif mobile | Non prévu |

En attendant le lot 2, OneDrive reste accessible via le sélecteur natif du téléphone ou un dossier synchronisé sur laptop.

Scope `drive.file` : **non sensible** (accès limité aux fichiers choisis par l'utilisateur), donc pas de vérification Google requise. Les scripts Google et Dropbox ne sont chargés qu'à l'ouverture de la modale OCR.

## 5. Langues

- **Détection automatique par défaut** (aucun `languageHints`). Vision couvre plus de 100 langues imprimées, y compris arabe, hébreu, cyrillique, chinois, japonais, coréen, hindi.
- **Manuscrit** : couverture plus restreinte (langues latines principales, cyrillique, CJK, etc. — liste officielle : <https://cloud.google.com/vision/docs/languages>). Le sélecteur de langue améliore les résultats.
- **Indice de langue facultatif** dans la modale (`languageHint`, code BCP-47 court validé côté API), relance possible sans réimporter.
- **Langue détectée** affichée dans l'aperçu (`detectedLanguages`).
- **Sens d'écriture** : insertion en paragraphes `dir="auto"` (RTL correct pour l'arabe et l'hébreu).
- L'interface Wroket reste FR / EN : « toutes les langues » concerne le texte reconnu.

## 6. Architecture du POC

```
Navigateur                                   wroket-api (Cloud Run)                Google
──────────                                   ──────────────────────                ──────
Source (fichier/caméra/drop/coller/Drive/Dropbox)
  → imageNormalize (recadrage zone claire, contraste gris, JPEG ≤ 2000px)
  → POST /notes/:id/ocr (multipart, languageHint, source)
                                             requireAuth → accès note (canViewNote)
                                             → flag + allowlist → quota (20/j/uid)
                                             → ocrService.recognize ─────────────→ eu-vision.googleapis.com
                                             ← { text, detectedLanguages, code? } ←
  ← Modale d'aperçu éditable → Insérer / Copier / Annuler
```

Fichiers principaux :

- Backend : `services/ocrService.ts` (providers `vision` / `mock`), `services/gcpAccessToken.ts`, `controllers/noteOcrController.ts`, routes dans `routes/noteRoutes.ts`.
- Frontend : `lib/imageNormalize.ts`, `lib/cloudPickers/googleDrivePicker.ts`, `lib/cloudPickers/dropboxChooser.ts`, `components/ocr/ImageSourceMenu.tsx`, `components/ocr/NoteOcrDialog.tsx`, intégration dans `app/notes/page.tsx`, `components/NoteToolbar.tsx`, `components/NoteAttachmentsPanel.tsx`.

API :

| Endpoint | Rôle |
|---|---|
| `GET /notes/ocr/config` | `{ enabled, dailyLimit, remaining }` pour l'utilisateur courant |
| `POST /notes/:noteId/ocr` | Fichier `file` (jpeg/png/webp/gif ≤ 5 Mo), `languageHint?`, `source?` |
| `POST /notes/:noteId/attachments/:attachmentId/ocr` | PJ image de la note ou de sa tâche liée ; body `{ languageHint? }` |

Codes d'erreur :

| Code | HTTP | Message utilisateur (action) |
|---|---|---|
| `OCR_DISABLED` | 503 | Fonction non activée pour ce compte |
| `OCR_UNSUPPORTED_TYPE` | 422 | Utiliser une image JPEG, PNG, WebP ou GIF |
| `OCR_INVALID_LANGUAGE` | 422 | Choisir une langue dans la liste |
| `OCR_NO_TEXT` | 200, `text: ""` | Réessayer avec une photo plus nette ou choisir la langue |
| `OCR_QUOTA_EXCEEDED` | 429 | Limite quotidienne atteinte, réessayer demain |
| `OCR_PROVIDER_ERROR` | 502 | Service momentanément indisponible, réessayer |
| `PICKER_DOWNLOAD_FAILED` (navigateur) | — | Réessayer ou importer depuis l'appareil |
| `IMAGE_DECODE_FAILED` (navigateur) | — | Format non lisible (HEIC) : capture d'écran ou conversion JPEG |

## 7. RGPD et sécurité

- **Traitement** : Google Cloud Vision, endpoint UE, sous-traitant déjà couvert par le DPA GCP du projet. Requêtes synchrones : images non conservées par Google.
- **Wroket ne persiste rien** : ni l'image (sauf case « Joindre l'image à la note », décochée par défaut), ni le texte (sauf insertion puis sauvegarde normale de la note).
- **Logs** : `requestId`, `uid`, source, taille, durée, langue détectée. **Jamais le texte extrait.**
- **Drive** : scope `drive.file`, jeton d'accès en mémoire uniquement (jamais stocké ni envoyé à l'API Wroket). **Dropbox** : lien direct éphémère, pas d'OAuth.
- **Contrôle d'accès** : l'appel OCR exige la lecture de la note (`canViewNote`) ; le bouton n'est visible que si l'utilisateur peut éditer.
- **CSP** élargie aux seuls domaines officiels Google (`apis.google.com`, `accounts.google.com/gsi/client`, `docs.google.com`, `drive.google.com`, `www.googleapis.com`, `content.googleapis.com`, `*.googleusercontent.com`) et Dropbox (`www.dropbox.com`, `dl.dropboxusercontent.com`).
- **À faire avant ouverture générale** : ajouter une ligne « Reconnaissance de texte (Google Cloud Vision, UE) » dans la politique de confidentialité.

## 8. Coûts

| Volume mensuel | Coût Vision |
|---|---|
| ≤ 1000 images | 0 USD |
| 5000 images | 6 USD |
| 20 000 images | 28,50 USD |

Le quota POC (20 OCR / jour / utilisateur) borne le risque. Picker API, Drive API et Dropbox Chooser sont gratuits.

## 9. Configuration et mise en service (propriétaire)

1. `gcloud services enable vision.googleapis.com drive.googleapis.com picker.googleapis.com --project=involuted-reach-490718-h4`
2. Vérifier que `wroket-run` a `roles/serviceusage.serviceUsageConsumer`.
3. Activer le flag (non écrasé par Cloud Build) :
   `gcloud run services update wroket-api --region=europe-west1 --update-env-vars "^##^OCR_ENABLED=true##OCR_BETA_EMAILS=francois@broudeur.com;team@wroket.com"`
4. **Google Drive** :
   - créer une clé API restreinte aux référents `https://wroket.com/*`, `https://www.wroket.com/*` et à l'API Google Picker ;
   - ajouter le scope `drive.file` dans Google Auth Platform → Data Access ;
   - renseigner les substitutions du trigger Cloud Build `_GOOGLE_CLIENT_ID` (client « Wroket Web ») et `_GOOGLE_PICKER_API_KEY`.
5. **Dropbox** : créer une app (Chooser) avec les domaines `wroket.com` et `www.wroket.com`, renseigner `_DROPBOX_APP_KEY`.
6. Les sources Drive / Dropbox sont masquées tant que leur clé publique est absente : le POC fonctionne sans elles.

Développement local : `OCR_ENABLED=true` et `OCR_PROVIDER=mock` (réponse factice), ou `OCR_PROVIDER=vision` + `OCR_DEV_ACCESS_TOKEN=$(gcloud auth print-access-token)`.

## 10. Critères go / no-go (après 2 semaines de beta)

- **Qualité** : ≥ 80 % de textes exploitables (peu ou pas de retouche) sur l'échantillon de smoke test.
- **Latence** : p95 < 4 s entre l'envoi et l'aperçu.
- **Coût** : reste dans le free tier ou < 10 USD / mois.
- **Usage** : au moins un usage répété par la moitié des beta-testeurs.

Smoke test (≈ 12 photos) : tableau blanc, carnet manuscrit, document imprimé, ticket, langue non latine (arabe ou japonais), source Drive, source Dropbox, capture collée, PJ existante, photo HEIC (iPhone), photo floue (attendu : `OCR_NO_TEXT` ou texte partiel), quota atteint.

### Mesure du 2026-11-06 (logs Cloud Run, 60 jours)

Source : `wroket-api`, messages `[ocr] recognized` et `[ocr] provider failure`. Le texte reconnu n'est pas dans les logs.

| Critère | Constat | Seuil |
|---|---|---|
| Latence | 23 lectures, 0 échec. p50 238 ms, p95 384 ms, max 390 ms | Tenu |
| Coût | 23 images sur le mois, sous les 1000 unités gratuites (0 USD) | Tenu |
| Usage | 1 compte, un seul jour (5 nov., 17:28–21:35 UTC). Caméra 15, fichier 7, pièce jointe 1 | Pas tenu |
| Qualité | Pas de note sur l'échantillon de 12 photos. Les logs ne permettent pas de juger la retouche | Pas mesuré |

**Verdict : pas d'ouverture générale.** La latence et le coût ne bloquent pas. L'usage n'a pas deux semaines, et la qualité n'a pas été notée. Le flag et l'allowlist restent en place. Drive, Dropbox, collage, HEIC, photo floue, langue non latine et quota atteint ne figurent pas dans ces 23 lectures.

## 11. Limites connues du POC

- Quota en mémoire par instance (max 2) : à migrer dans Firestore avant ouverture large.
- HEIC : dépend du navigateur (Safari décode, Chrome desktop pas toujours) → message actionnable.
- Glisser-déposer et coller fonctionnent **dans la modale OCR** ; le comportement natif de l'éditeur n'est pas modifié.
- `TaskNoteModal` expose l'OCR pour le propriétaire de la note. Une note partagée en lecture seule ne l'expose pas.
- PDF non pris en charge dans le POC.
- Validation E2E réelle uniquement après déploiement (serveur de métadonnées, clés liées au domaine).

## 12. Suite (lot 2 et au-delà)

1. **OneDrive** (File Picker v8, décision MSAL vs OAuth Wroket).
2. **PDF ≤ 5 pages** via `files:annotate` synchrone.
3. **Recherche** dans le texte des pièces jointes (index du texte extrait, opt-in).
4. **Outil MCP** `ocr_note_attachment`.
5. **Extraction de tâches** depuis le texte reconnu, via le gate IA (opt-in, suggestions validées par l'utilisateur).
6. Quota partagé (Firestore) et compteur affiché dans Paramètres.
