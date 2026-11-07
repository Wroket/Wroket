# E2E PERF multi-comptes — runbook

Protocole de seed / validation UI / cleanup pour rejouer la collab assign + notes + book **sans** versionner de données métier.

## Comptes (profils Chrome)

| Rôle | Compte | Profil Chrome typique |
|------|--------|------------------------|
| Organizer | `francois.broudeur@hotmail.fr` | Cursor glass-browser ou profil hotmail |
| Assignee A | `bebroudeur@gmail.com` | Profile 3 (Travail) |
| Assignee B | `nom.prenom1978@gmail.com` | Profile 5 |

Vérifier `/auth/me` (ou Paramètres) **avant** chaque scénario. Si un profil Google affiche encore hotmail : effacer les données de site `wroket.com`, puis SSO Google.

## Préfixe données

Tous les objets de test portent le préfixe **`PERF`** (ex. équipe `PERF retest YYYY-MM-DD`, tâches `PERF retest #N …`, notes `PERF retest note N`).

## Seed (organizer uniquement)

1. Ouvrir `https://wroket.com/notifications?__retest=1` (ou toute page app) **connecté en organizer**.
2. Coller le contenu de [`scripts/perf-retest-helpers.js`](../scripts/perf-retest-helpers.js) dans la console DevTools, **ou** :
   ```js
   // charge locale si servi ; sinon coller le fichier entier
   ```
3. Installer l’API helper puis lancer le seed :
   ```js
   window.__retest = window.__retest || {};
   Object.assign(window.__retest, PerfRetestHelpers.install());
   const report = await window.__retest.seedPerf({
     assigneeEmails: ["bebroudeur@gmail.com", "nom.prenom1978@gmail.com"],
     assignCounts: [6, 4],
     bookCount: 4,
     noteCount: 6,
   });
   console.table(report.latencies);
   ```
4. Critères seed : 0 erreur métier 4xx/5xx ; assign p50 &lt; 400 ms ; book force p50 &lt; 900 ms (indicatif).

## Validation UI (assignees)

Sur **chaque** Google (profil isolé) :

1. `/notes?shared=1` — inbox non vide ; status bar `N à moi · M reçues` (ou EN équivalent).
2. `/notifications` — `task_assigned` avec Accepter / Refuser.
3. `/todos` ou Accueil — Attribuées / Ma semaine cohérents.
4. Double-accept d’une même tâche : owner ne reçoit **qu’une** `task_accepted`.

### Automation — pièges connus

- Decrypt cookies Chrome v20 : **ne pas** s’appuyer dessus ; seed via session organizer déjà loguée.
- Google accountchooser : les clics synthétiques sélectionnent souvent du texte — préférer Tab/Enter ou zoom sur l’avatar.
- Lancer CDP (`--remote-debugging-port`) sur le **premier** process Chrome du profil organizer.

## Cleanup (obligatoire après GO / no-go)

Toujours depuis la session **organizer** :

```js
const cleaned = await window.__retest.cleanupPerf();
console.log(cleaned); // expect remain.todos===0, remain.notes===0, remain.team===null
```

Le cleanup :

1. DELETE slots bookés des todos `PERF *`
2. DELETE todos `PERF *` (purge aussi les notifs liées côté API)
3. DELETE notes `PERF *`
4. DELETE projets / équipe dont le nom contient `PERF retest`

Ne **jamais** committer `backend/data/`, dumps, ou exports utilisateurs.

## Go / no-go minimal

- Inbox notes A/B = partages entrants
- 1 notif `task_accepted` par accept (pas de doublon)
- Latences P50 dans les cibles indicatives
- `cleanupPerf()` → remain à zéro
