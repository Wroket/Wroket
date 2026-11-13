# Vérification OAuth Google (Agenda) — pack ops

Objectif : faire disparaître le bandeau **« This app isn’t verified »** sur la connexion Agenda Google, et lever le cap ~100 users OAuth.

**Scopes code** ([`backend/src/services/googleCalendarService.ts`](../backend/src/services/googleCalendarService.ts)) :

| Scope | Type Google |
|-------|-------------|
| `https://www.googleapis.com/auth/calendar.events` | Sensitive |
| `https://www.googleapis.com/auth/calendar.readonly` | Sensitive |

Ne **pas** élargir ces scopes. Ne pas confondre avec Google Chat+ Marketplace.

## Identité éditeur (pages légales)

Source unique : [`frontend/src/lib/legalEntity.ts`](../frontend/src/lib/legalEntity.ts).

| Champ | Valeur (2026-11-13) |
|-------|---------------------|
| Éditeur | François Broudeur (personne physique) |
| Immatriculation | **En cours** (pas encore de SIREN/RCS) |
| Adresse | 15 rue Léo Frankel, 75013 Paris, France |
| Tribunal | Paris |
| Privacy / DPO | `team@wroket.com` |
| Pages | `https://wroket.com/privacy` · `https://wroket.com/terms` |

**Risque Google** : sans SIREN / société enregistrée, la review peut demander un justificatif d’entité. Mettre à jour `LEGAL_ENTITY` dès immatriculation, redéployer, puis répondre au reviewer.

## Audit (2026-11-13)

### Code / URLs prod

| Élément | Attendu | Statut |
|---------|---------|--------|
| Scopes Calendar | `calendar.events` + `calendar.readonly` uniquement | OK |
| Privacy / Terms | URLs prod + Limited Use §4 | OK (placeholders retirés) |
| Homepage | `https://wroket.com` | OK |
| Redirect Agenda | `https://api.wroket.com/calendar/google/callback` (`GOOGLE_REDIRECT_URI` Cloud Run) | OK |
| Redirect SSO | `https://api.wroket.com/auth/google/callback` | OK (doc architecture) |
| Calendar API | `calendar-json.googleapis.com` enabled | OK (`gcloud services list`) |
| Projet GCP | `involuted-reach-490718-h4` / number `846885741813` / name `Wroket-com` | OK |

### Console Auth Platform

À cocher avec le compte **Owner** `francois@broudeur.com` (pas `bebroudeur@gmail.com`) :

Lien direct : [Auth Platform — overview](https://console.cloud.google.com/auth/overview?project=involuted-reach-490718-h4)

- [x] User type = **External** (observé 2026-11-13)
- [x] App name = **Wroket**
- [x] Support email = `wroket-admin@wroket.com` ; developer contact = `team@wroket.com`
- [x] Home = `https://wroket.com`
- [x] Privacy = `https://wroket.com/privacy`
- [x] Terms = `https://wroket.com/terms`
- [x] Authorized domains : `wroket.com`
- [x] Scopes = `calendar.readonly` + `calendar.events` (+ SSO `openid`/`email`/`profile`, `drive.file`)
- [x] Justification sensitive scopes collée (Data Access)
- [ ] Logo OAuth distinctif (voir issues ci-dessous)
- [ ] Brand verification **re**-soumise après fix
- [ ] Sensitive scope verification (`Prepare for verification` — bloqué tant que branding non OK)

CLI 2026-11-13 : `gcloud` OK en `francois@broudeur.com` ; l’API publique ne permet pas de lire/soumettre le consent screen (UI console uniquement). Utiliser Chrome **Professionnel** `francois@broudeur.com`.

### Branding verification issues (console 2026-11-13)

Panneau **View issues** (bloque `Prepare for verification`) :

1. **Privacy** — `https://wroket.com/privacy` « does not have sufficient content ».
   - Cause prod au moment de l’audit : placeholders `[À COMPLÉTER : raison sociale / SIREN / adresse]` encore live.
   - Fix code : `LEGAL_ENTITY` + privacy/terms (2026-11-13) — **à déployer** (push `main` → Cloud Run) avant de re-soumettre.
2. **Logo** — « does not uniquely identify your brand ».
   - Asset proposé : [`frontend/public/brand/wroket-oauth-consent.png`](../frontend/public/brand/wroket-oauth-consent.png) (512×512, mark + wordmark Wroket).
   - Action console : Branding → Change logo → upload → Save → View issues → « I have fixed the issues » → Proceed.

## Justification sensitive scopes (coller dans le dossier)

> Wroket is a task and project planner. Users optionally connect Google Calendar to (1) see free/busy on calendars they select (`calendar.readonly`) so Wroket can suggest conflict-free slots, and (2) create or update calendar events only when the user explicitly books or syncs a Wroket time slot (`calendar.events`). Connecting OAuth alone does not write any events. Data use complies with Google API Services User Data Policy Limited Use. Privacy: https://wroket.com/privacy — Terms: https://wroket.com/terms.

## Démo YouTube (souvent demandée)

2–3 min, compte test :

1. Wroket → connecter Google Agenda  
2. Consulter free/busy / suggestions  
3. Réserver un créneau → événement dans Google Calendar  
4. Déconnecter l’agenda dans Wroket  

Lien non listé OK.

## Soumission (action propriétaire)

1. Ouvrir [Verification / Auth Platform](https://console.cloud.google.com/auth/overview?project=involuted-reach-490718-h4) avec `francois@broudeur.com`
2. Vérifier URLs privacy/terms (après deploy des pages légales)
3. Submit **brand** puis **sensitive scopes** avec la justification ci-dessus + vidéo
4. Traiter les retours Google (3–10 jours ouvrés typiques)

### Post-go

- [ ] Reconnecter un compte test Agenda
- [ ] Confirmer absence du bandeau unverified
- [ ] Cocher ROADMAP « OAuth Google Agenda — vérification »

## Non-goals

- Extension Chrome  
- Google Chat Marketplace public  
- Scopes restricted / CASA  
