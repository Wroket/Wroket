# Checklist E2E manuelle — production (wroket.com)

Checklist pas à pas pour valider les parcours critiques sur **production** après un déploiement Cloud Run (`main`).

**Durée estimée** : 45–90 min  

**URLs** : [wroket.com](https://wroket.com) · [api.wroket.com](https://api.wroket.com)

## Comptes de test recommandés

- Compte **Small teams** ou **earlyBird** (intégrations, calendriers externes, Slack/digest)
- Compte **Free** (gating Intégrations tiered)
- 1 adresse **externe** (invité Google Meet)
- Idéalement un **2e compte Google** (multi-comptes calendrier)

---

## L. Dernier run prod

| Champ | Valeur |

|-------|--------|

| Date | 2026-05-30 (run initial) · **re-test complet 2026-06-07** |

| Commit run initial | `f233fa73` |

| Décision | **GO** (re-test 2026-06-07) — parcours §A–I validés |

| Bugs ouverts | Aucun bloquant — voir [ROADMAP.md](../ROADMAP.md) section « Retour E2E prod » |

| Correctifs re-testés | P0 RGPD ; P1 Meet PATCH / priorité compte / Microsoft OAuth / Teams invités externes ; P2 conflit dédup ; P3 sync Archives ; P2 Ma semaine + templates + alertes navigateur ; DnD projet §G ; Outlook §D5 |

---

## A. Prérequis (5 min)

- Navigateur Chrome, session privée ou profil dédié test
- Noter l’heure de début et le commit déployé — **2026-05-30 17h40, `f233fa73`**
- [GET /health](https://api.wroket.com/health) → `{ "status": "ok", ... }`
- [GET /health/ready](https://api.wroket.com/health/ready) → HTTP **200**, `"status": "ok"`
- `"store": { "ok": true, "backend": "firestore" }`
- `"todosDrift": { "status": "ok" }` (ou `"skipped"` en mode legacy)
- Si HTTP **503** ou `todosDrift.status` ∈ `drift` / `error` → **stop**, incident infra ([runbook-calendar-todos-reliability.md](./runbook-calendar-todos-reliability.md))

---

## B. Auth & socle (5 min)

1. [x] [wroket.com/login](https://wroket.com/login) — page charge, champs email / mot de passe visibles
2. [x] Connexion compte principal → redirection dashboard, pas d’erreur bloquante
3. [x] Déconnexion / reconnexion → session OK
4. [x] (Optionnel) 2FA si activé → parcours complet

---

## C. Tâches & persistance (10 min)

1. [x] **Mes tâches** → créer une tâche `PROD-E2E-{date}` (priorité moyenne)
2. [x] **F5** → la tâche est toujours là
3. [x] Modifier le titre → **F5** → modification conservée
4. [x] Marquer terminée → disparaît de la liste active (ou état « complété » cohérent)
5. [x] **Archives** → tâche archivée visible
6. [x] (2e onglet) Ouvrir `/todos` → revenir sur le 1er onglet → liste rafraîchie sans F5

**Critère OK** : aucune perte de tâche après refresh / changement d’onglet.

> **Re-test 2026-06-07** : sync Archives cross-onglet OK (sans F5).

---

## D. Agenda & créneaux (15–25 min)

### D1. Créneau in-app (sans Google)

1. [x] Réserver un créneau demain 10h–11h sur une tâche
2. [x] **F5** → créneau visible sur la tâche et dans **Agenda**
3. [x] 2e créneau **chevauchant** sur une autre tâche → message d’erreur actionnable (conflit) — re-test 2026-06-07 OK

### D2. Google Calendar (compte avec intégrations)

1. [x] Google connecté, calendrier par défaut configuré (Paramètres / Agenda)
2. [x] Réserver un créneau → événement visible dans Google Calendar
3. [x] **F5** wroket.com → créneau toujours présent

### D3. Google Meet (si utilisé)

1. [x] Créer un **Meet** sur une tâche (titre + invités)
2. [x] Événement dans Google Calendar (lien Meet)
3. [x] **Modifier** l’heure → changement reflété dans Google — re-test 2026-06-07 OK
4. [x] **Invité externe** → invitation reçue
5. [x] **Annuler** le Meet → événement supprimé / annulé côté Google

### D4. Multi-comptes / fuseau (si 2 comptes Google)

1. [x] Compte Google **prioritaire** = celui qui reçoit la réservation — re-test 2026-06-07 OK
2. [x] Compte secondaire en lecture seule → pas d’écriture involontaire
3. [x] Fuseau (Paramètres → Tâches) → créneaux cohérents à l’affichage

### D5. Outlook / Microsoft Teams (compte prioritaire Outlook)

1. [x] Outlook connecté, calendrier par défaut configuré (Agenda > Gérer les agendas)
2. [x] Réserver un créneau → événement visible dans Outlook
3. [x] Créer une réunion **Teams** sur une tâche (titre + créneau)
4. [x] **Modifier** l’heure → changement reflété dans Outlook
5. [x] **Invité externe** (ex. Gmail) → invitation reçue avec lien Teams — envoi en 2 temps (création réunion puis invitation avec `joinUrl` dans le corps HTML)
6. [x] **Annuler** la réunion → événement supprimé côté Outlook
7. [x] OAuth Microsoft (connexion secondaire ou reconnexion) — redirect `/agenda/manage?microsoft=connected`

> **Re-test 2026-06-07** : OAuth Microsoft secondaire OK (redirect `/agenda/manage` + toasts si erreur). Invités externes Teams validés post-fix invitation.

**Critères OK** : cycle création → refresh → édition → annulation ; invité externe OK (Google Meet **ou** Teams) ; pas de décalage horaire incohérent.

---

## E. Paramètres → Intégrations (10 min)

### Compte Free (sans earlyBird)

1. [x] Onglet **Intégrations** **visible**
2. [x] **Automatisations** : activer une règle → Enregistrer → **F5** → état conservé
3. [x] **Filtres in-app** : modifier → sauvegarder → OK
4. [x] **Livraison Slack / digest / webhooks** : sections visibles mais **verrouillées** + lien `/pricing`

### Compte Small teams / earlyBird

1. [x] Livraison **Slack** ou **email** configurable et sauvegardée
2. [x] **Digest** horaire ou quotidien → sauvegarder
3. [x] (Attendre ou simuler) digest reçu avec **résumé action en tête** du message — *non testé run 2026-05-30*
4. [x ] Webhook test → succès ou échec explicite — *non testé run 2026-05-30*
5. [x ] **Notifications push (navigateur)** : encart « par appareil » + hint plateforme (Windows / Mac) visible
6. [x ] Activer push **sur cet appareil** → statut « Push activé sur cet appareil » ; désactiver ici ne coupe pas un autre terminal déjà abonné

### Suppression de compte

> **Note run 2026-05-30 (hors checklist formelle)** :

> - Auto-suppression user puis reconnexion → tâches et agendas toujours présents — **P0 RGPD** — fix livré 2026-05-31 (purge runtime + `todos_v2` + Stripe) — **re-test requis**

> - Suppression admin → accès maintenu — **P0 RGPD** — fix livré 2026-05-31 — **re-test requis**

---

## F. Dashboard « Ma semaine » (5 min)

*Validé — re-test 2026-06-07*

1. [x] Card **Ma semaine** / **Bilan de la semaine** visible
2. [x] Tâches datées / en retard dans la liste
3. [x] Boutons **Agenda** / **Mes tâches** fonctionnent
4. [x] État vide lisible si aucune échéance proche

---

## G. Projet → Pilotage & export (10–15 min)

*Validé — re-test Gantt interactif 2026-06-08 (`d4d2aaa`)*

1. [x] Ouvrir un projet avec phases + tâches datées
2. [x] Panneau **Pilotage** visible (santé, KPIs, jalons)
3. [x] **Export** → **CSV** → fichier téléchargé, données cohérentes
4. [x] **Export** → **PDF** → Pilotage + Gantt dans le PDF
5. [x] Onglet **Gantt** correct ; PDF inclut le Gantt même depuis Board/Kanban
6. [x] **Kanban** : déplacer une tâche entre phases (reorder intra-colonne si applicable)
7. [x] Tâche avec **créneau booké** + dates hors phase cible → modale (clamp dates / effacer créneau) — pas de toast opaque seul
8. [x] **Board** : reorder + cross-phase via même flux `move`
9. [x] **Gantt liste** : reorder cohérent avec l’affichage (`sortOrder`)
10. [x] **Gantt barre (tâche)** : clic nom ou barre → `TaskEditModal` ; poignées gauche/droite → resize début/fin ; drag centre → déplacement avec **preview live** (barre suit la souris) ; relâcher → dates persistées (`moveTodo`)
11. [x] **Gantt barre (phase + sous-tâche)** : clic phase → modale édition ; drag/resize barre phase ; sous-tâche datée : même interactions barre que tâche parente
12. [x] **Gantt quadrillage** : traits jour/semaine visibles ; numéros aux lundis (ou 1er du mois) ; snap drag/resize aligné sur colonnes ; surbrillance pendant drag

---

## H. Messages d’erreur (5 min)

*Validé — re-test 2026-06-07*

Déclencher volontairement et vérifier un message **compréhensible** (pas « Internal server error » seul) :

| Action | Attendu |

|--------|---------|

| Réserver sans calendrier par défaut (compte intégrations) | Message « configurez un calendrier par défaut » |

| Conflit de créneau | Message conflit, pas de réservation silencieuse |

| Accès calendrier sans palier intégrations | Message upgrade / Small teams |

Les codes `CALENDAR_`* sont visibles dans DevTools → Network ; l’utilisateur doit voir un libellé clair.

---

## I. Régression parcours principal (5 min)

*Validé — re-test 2026-06-07*

- **Projets** : board / kanban / gantt sans erreur
- **Notifications** (cloche) : liste charge
- **Notifications** (cloche) : lien « Notifications système » → Paramètres → Intégrations si permission `default`
- **Templates** : créer / appliquer un template de tâche
- **Dark mode** : lisibilité OK dashboard + projet
- **Mobile** (optionnel) : login + créer tâche + voir agenda

---

## I-bis. Web Push desktop Mac / Windows PWA (10–15 min)

*À valider après déploiement des améliorations push desktop*

**Prérequis** : compte assignable (2 comptes) ; Chrome ou Edge ; Windows 10/11 ou macOS.

### Installation PWA (recommandé)

| Plateforme | Étapes |

|------------|--------|

| **Windows** Chrome/Edge | Barre d’adresse → **Installer l’application** → lancer Wroket depuis le menu Démarrer |

| **macOS** Chrome/Edge | Idem « Installer » |

| **macOS Safari** | Fichier → **Ajouter au Dock** → rouvrir depuis le Dock (PushManager indisponible en onglet seul) |

### Activation par appareil

1. [x ] Paramètres → Intégrations → **Activer les notifications push** sur le **laptop** (même si déjà activé sur téléphone)
2. [x ] Statut affiche **« Push activé sur cet appareil »** (pas seulement un flag compte global)
3. [x ] Permission OS : notifications autorisées pour Wroket / Chrome dans Réglages système

### Réception et deep-link

1. [x ] Depuis un **autre compte**, assigner une tâche au testeur
2. [x ] Toast système **Wroket** (nom PWA si installée) avec **titre + message détaillés** — pas seulement « Google Chrome » + « 1 nouvelle notification »
3. [x ] **Onglet en arrière-plan** : clic sur le toast → `/todos?task=…` → modal tâche
4. [x ] **Onglet fermé** (PWA installée) : même deep-link au clic
5. x ] Si Web Push active sur cet appareil : **pas de doublon** toast générique AppShell + toast détaillé SW

### Actions Accepter / Refuser (Windows PWA)

1. [x ] Toast `task_assigned` affiche boutons **Accepter** / **Refuser** (Windows Chrome/Edge PWA ; macOS souvent sans boutons)
2. [x ] Clic **Accepter** sans ouvrir l’app → statut assignation `accepted` (vérifier dans l’app ou côté assigneur)
3. [x ] Clic **Refuser** → statut `declined` ; erreur 401 → redirection login avec `?redirect=`

### Cloche in-app (sans push local)

1. [ ] Permission navigateur `granted` mais push **non** activé localement : alerte desktop **détaillée** (titre/message) avec clic → deep-link
2. [ ] Cloche → **Notifications système** pointe vers Paramètres → Intégrations

---

## J. Go / No-go

| Statut | Condition |

|--------|-----------|

| **GO** | Health ready OK ; tâches persistent ; agenda créneau + refresh OK ; erreurs actionnables ; pas de perte de données |

| **GO partiel** | Meet multi-comptes / invités externes non testés → documenter |

| **NO-GO** | Tâche ou créneau disparaît après F5 ; `/health/ready` degraded ; drift `error` ; crash UI sur parcours critique |

**Décision run 2026-05-30** : GO partiel · **Re-test 2026-06-07** : **GO**

---

## K. Fiche de compte rendu

```

Date : 2026-06-08 (Gantt interactif §G 10–11) · re-test complet 2026-06-07

Testeur : (manuel prod)

Commit / déploiement : `d4d2aaa` (Gantt clic/resize/preview) · base `f60de31` (Error UX)

Compte(s) : Free + earlyBird/Small teams + Google connecté + Microsoft secondaire



[x] A Health/ready

[x] B Auth

[x] C Tâches (+ sync Archives cross-onglet)

[x] D Agenda (Meet PATCH, multi-comptes, Microsoft)

[x] E Intégrations (Free + payant ; suppression compte RGPD)

[x] F Ma semaine

[x] G Pilotage + export + DnD move/modales + Gantt interactif (items 10–11)

[x] H Erreurs UX

[x] I Régression (templates, alertes navigateur, dark mode)



Bugs / écarts : aucun bloquant identifié sur ce run.



Décision : GO

```

---

## Compléments

- **E2E automatisés (local / CI)** : voir [e2e/README.md](../e2e/README.md) (`reliability.*.spec.ts`)
- **Incidents agenda / todos** : [runbook-calendar-todos-reliability.md](./runbook-calendar-todos-reliability.md)
- **Roadmap priorités** : [ROADMAP.md](../ROADMAP.md)

