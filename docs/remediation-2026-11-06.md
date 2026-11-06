# Plan de rémédiation — 6 novembre 2026

Constat d’un passage sur `wroket.com` avec le compte Early Bird `bebroudeur@gmail.com`.
Le geste de base (tâche, radar, créneau, agenda, recherche, projet) tient.
Deux fonctions nouvelles ne sont pas utilisables, et trois écrans mentent ou exposent trop.

Hors de ce plan : réécriture de la landing, guides, tarifs, aide intégrée, lot 2 OCR (OneDrive, PDF).

## Ordre

On ne traite pas tout en parallèle. Le 403 Vertex bloque Numériser et « Proposer une liste ».
Les correctifs d’interface (aperçus, cloche, langue, accueil) n’en dépendent pas et peuvent partir dans la même livraison de code, mais les flags OCR et schéma ne s’allument qu’après un appel Gemini réussi.

| Étape | Sujet | Bloque la suite |
|---|---|---|
| 0 | Données de test laissées sur le compte | Non |
| 1 | Vertex 403, puis flags | Oui pour Numériser |
| 2 | Aperçus de notes | Non |
| 3 | Cloche et invitation orpheline | Non |
| 4 | Une seule langue | Non |
| 5 | Accueil, radar, mobile | Non |
| 6 | Libellés d’abonnement | Non |
| 7 | Rejeu des trois JPEG | Après 1 |

## Étape 0 — Données de test

Créées pendant l’audit, à retirer à la main avant de rejouer les parcours :

- Tâche « Préparer le compte rendu early bird », échéance du 6 novembre, créneau Google le lundi 9 novembre 09:00–09:30.
- Projet « Audit early bird », phase « Revue ».
- Note « Revue OCR ».

Les six notes déjà présentes ne sont pas des données de test. Ne pas les ouvrir pour « vérifier », ne pas les réécrire.

## Étape 1 — Gemini répond, ensuite seulement on allume les flags

### Constat

`POST /notes/:id/task-suggestions` renvoie 502 `TASK_SUGGEST_PROVIDER_ERROR` en 91–118 ms.
Le journal dit `reason: "vertex HTTP 403"`. Le corps d’erreur Google est jeté dans `vertexSuggestions` (`backend/src/services/taskSuggestService.ts`, vers la ligne 157).
`GET /notes/ocr/config` et `GET /notes/diagram/config` répondent `enabled: false`. Le bouton Numériser n’est donc pas dans l’interface. Les JPEG du 6 novembre n’ont pas été envoyés.

Le même appel Vertex sert le schéma (`backend/src/services/diagramService.ts`). Allumer `DIAGRAM_ENABLED` avant de comprendre le 403 reproduirait l’échec sur chaque photo.

### Faire

1. Journaliser le statut et le champ `error.status` / `error.message` renvoyé par Vertex, sans le texte de la note et sans le prompt. Même traitement dans `diagramService.ts`.
2. Relancer une suggestion sur la note « Revue OCR » (ou une note jetable) et lire ce message.
3. Selon le message, une seule de ces corrections :
   - droit manquant : rôle `roles/aiplatform.user` sur le compte `wroket-run@involuted-reach-490718-h4.iam.gserviceaccount.com` ;
   - API Vertex non activée sur le projet ;
   - modèle `gemini-3-flash-preview` refusé sur `global` : changer `DIAGRAM_VERTEX_MODEL` / `TASK_SUGGEST_VERTEX_MODEL`, pas le code métier.
4. Quand une suggestion réelle revient (titres dans la langue de la note, rien n’est créé avant confirmation), poser les variables Cloud Run sans `--set-secrets` :
   - `TASK_SUGGEST_ENABLED=true` est déjà le cas ;
   - `OCR_ENABLED=true` ;
   - `DIAGRAM_ENABLED=true`.
   Laisser les quotas par défaut (OCR 20, schéma 5, suggestions 10). Ne pas élargir `OCR_BETA_EMAILS` tant que le smoke des trois photos n’est pas fait : si l’allowlist est vide, l’ouverture est générale. Pour le smoke, limiter à `francois@broudeur.com` et `bebroudeur@gmail.com` si ce second compte doit tester.

### Critère de fin

Une note de deux phrases produit une liste éditable en moins de 10 s. Un second appel sur une note sans action renvoie une liste vide, pas une 502. Le quota décrémente d’un sur le succès et revient au compteur précédent sur l’échec.

### Ne pas faire

Ne pas monter le timeout au-delà de 30 s. Ne pas passer `thinkingLevel` au-dessus de `LOW`. Ne pas logger le texte. Ne pas committer `.env`.

## Étape 2 — Les listes ne montrent plus le corps des notes

### Constat

La liste des notes affiche les 80 premiers caractères du contenu (`frontend/src/app/notes/page.tsx`, `stripHtml(note.content).slice(0, 80)`).
La recherche fait la même chose côté serveur (`backend/src/services/searchService.ts`, extrait de 80 caractères autour du mot).
Plusieurs notes de ce compte contiennent des secrets. Le titre suffit pour les retrouver.

### Faire

- Dans la liste : titre et date seulement. Garder « … » si le titre est vide.
- Dans la recherche : pour `type: "note"`, renvoyer le titre, pas `snippet` issu du contenu. La recherche continue de matcher le contenu, elle ne l’affiche plus.
- Les extraits de tâches (description) et de contacts (e-mail) restent.

### Critère de fin

Ouvrir `/notes` et chercher un mot qui n’est que dans le corps : la note apparaît par son titre, le corps n’est pas lisible dans la liste ni dans le menu de recherche.

## Étape 3 — La cloche et l’invitation disent la même chose

### Constat

`GET /notifications/count` vaut 1. `GET /notifications` contient une `team_invite` non lue du 11 août 2026.
`isNotificationDisplayable` garde toute invitation non lue, sans limite de temps (`backend/src/services/notificationDisplayPolicy.ts`).
La page Équipes, elle, n’a aucune invitation reçue : l’objet d’invitation n’existe plus, la notification oui.
Le panneau s’ouvre tout de suite sur l’état local, puis lance `refreshNotificationList` (`AppShell.tsx`, `openNotifPanel`). Le premier rendu est donc « Aucune notification » tant que la requête n’est pas revenue.

### Faire

1. Une invitation non lue dont l’invitation métier n’existe plus ne s’affiche pas et ne compte pas. Le filtre vit dans `isNotificationDisplayable`, avec le même prédicat pour la liste et le compteur.
2. Au clic sur la cloche, garder le badge et montrer un état « chargement » jusqu’au retour de la liste. Ne pas peindre « Aucune notification » sur un tableau encore vide si le chargement est en cours.
3. Ne pas marquer lue en masse l’historique du compte. Le correctif doit rendre cette invitation invisible parce qu’elle n’a plus d’action, pas parce qu’on l’a lue.

### Critère de fin

Sur ce compte, le badge passe à 0 et le panneau ne parle plus d’une invitation introuvable. Une invitation encore valide, si on en crée une de test, apparaît dans la cloche et dans Équipes. Fermer le panneau avant la fin du chargement ne laisse pas un « aucune » figé.

## Étape 4 — Une langue par session

### Constat

L’interface suit la langue du navigateur. Les dates de notes sont forcées en `fr-FR` (`formatDate` dans `frontend/src/app/notes/page.tsx`). Le titre par défaut est la chaîne `"Sans titre"` dans `frontend/src/lib/useOfflineNotes.ts`, alors que `notes.untitled` existe déjà en français et en anglais. `searchService.ts` retombe aussi sur `"Sans titre"`.

### Faire

- `formatDate` utilise la locale du contexte (`fr-FR` ou `en-US`), comme `DatabasesSection.tsx`.
- Le titre par défaut et le repli de recherche passent par `notes.untitled` selon la langue de l’utilisateur, pas une chaîne française en dur. Côté API, si la langue n’est pas connue, renvoyer un titre vide et laisser le client traduire.

### Critère de fin

En anglais : dates « Nov 6, 8:51 PM » (ou équivalent `en-US`) et titre « Untitled ». En français : « 06 nov. » et « Sans titre ». Pas de mélange sur le même écran.

## Étape 5 — Accueil, radar, mobile

### Constat

`frontend/src/app/dashboard/page.tsx` affiche encore « Connecter mon agenda » quand un compte Google ou Microsoft est déjà lié (bloc `hasExternalCalendar`, lien secondaire). Le bouton principal, lui, passe bien à « Gérer mes tâches ».
Sur bureau, le quadrant « DO » du radar est coupé par la colonne « Ma semaine » (`EisenhowerRadar.tsx`, grille en `overflow-hidden`). Sur 390 px les quatre libellés tiennent, mais le bouton rond de `frontend/src/components/v2/CreateMenu.tsx` recouvre le titre « Ma semaine », et le badge Early Bird se réduit en « EB ».

### Faire

- Retirer le lien « Connecter mon agenda » quand `hasExternalCalendar` est vrai. Garder un accès dans Agenda → Gérer les agendas.
- Laisser les quatre libellés du radar visibles à côté de « Ma semaine », sans les tronquer.
- Décaler le bouton « + » mobile pour qu’il ne couvre pas le titre de section. Garder le mot « Early Bird » ou le placer seulement dans le menu compte, plutôt qu’un « EB » seul.

### Critère de fin

Compte avec Google déjà connecté : le bandeau d’accueil ne propose plus de connecter l’agenda. Bureau et 390 px : les quatre quadrants se lisent, le bouton « + » ne masque pas « Ma semaine ».

## Étape 6 — Abonnement lisible

### Constat

Le panneau Abonnement dit « Current plan: Free » et « Technical tier: free », puis liste `free → first → small → large`. Le badge Early Bird et les capacités (intégrations, reporting) sont justes, le vocabulaire technique ne l’est pas pour un utilisateur.

### Faire

Garder le palier commercial Free et le badge Early Bird. Retirer le bloc « Name mapping » de l’écran. Les identifiants techniques restent dans l’admin s’ils y sont déjà.

### Critère de fin

Un Early Bird lit « Free » et « Early Bird », voit les capacités cochées, et ne voit pas `first` ni `small`.

## Étape 7 — Smoke des trois photos

Uniquement après l’étape 1, sur le compte de test, avec les fichiers du 6 novembre :

| Fichier | Attendu |
|---|---|
| `testOCR.jpg` | Texte proche de « Actions à mener », quatre lignes numérotées, peu de retouche |
| `schema.jpg` | Boîtes Notes écrites, Wroket, Scan, Import, Affichage dans notes, et les flèches |
| `testschema2.jpg` | Même schéma, photo plus large |

Rien n’est enregistré tant que l’utilisateur ne confirme pas. L’image n’est jointe que si la case est cochée. Si le schéma dépasse 4 s au 95e percentile sur ces trois photos, on le note, on n’ouvre pas plus large.

## Hors plan, volontairement

- Landing, SEO, guides, tarifs, aide.
- Commandes « prépare mon comité » / « planifie ma semaine ».
- Kanban, Gantt, bases, import CSV, 2FA, commentaires : non cassés sur ce passage, pas de chantier ouvert.
- Rafales de relectures après création d’une tâche (environ 12 appels) et double appel `day-reorder` : dette de performance, pas le prochain correctif.

## Risque

L’étape 1 touche un droit IAM de production. On lit d’abord le corps 403. On n’accorde `roles/aiplatform.user` que si le message dit un refus de permission. Un 403 « modèle indisponible » se règle par la variable de modèle, pas par un rôle plus large.
