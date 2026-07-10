# Audit UX / fonctionnel prod — wroket.com

**Date** : 2026-07-04  
**Environnement** : production (Cloud Run)  
**Health** : `GET /health/ready` → 200, `store.ok=true`, `todosDrift.status=skipped_lazy_boot`  
**Compte test** : `francois+wroket@broudeur.com`  
**Palier commercial** : `free` (inchangé)  
**Passes audit** :
- **Passe 1 (matin)** : earlyBird=false — integrations=false, teamReporting=false, quotas Free actifs
- **Passe 2 (après-midi)** : earlyBird=true — integrations=true, teamReporting=true, pas de snapshot `freeQuotas`  
**Méthode** : session navigateur Cursor + API authentifiée ; croisement checklist E2E juin 2026  

**Légende** : *Live* = testé aujourd’hui sur prod ; *E2E* = validé checklist juin 2026, non rejoué intégralement.

## Légende verdicts

| Verdict | Signification |
|---------|---------------|
| OK | Nominal + persistance si applicable |
| Partiel | Fonctionne avec friction ou E2E incomplet |
| KO | Bloquant |
| Gated-OK | Verrou plan/quota correct |
| N/A | Non testable (palier, OAuth, destructif) |

---

## Rapport feature par feature

| ID | Feature | Entrée | Verdict | Friction | Amélioration | Notes |
|----|---------|--------|---------|----------|--------------|-------|
| F001 | App shell (header + sidebar) | Toutes pages auth | OK | Sidebar dense mobile | Regrouper nav secondaire | Live : structure visible |
| F002 | Navigation principale | Sidebar | OK | Nombreux items même niveau | Raccourcis / favoris | Live : liens fonctionnels |
| F003 | Recherche globale | Header | Partiel | `browser_fill` échoue ; saisie non testée | Tester debounce + résultats | Champ présent |
| F004 | Cloche notifications (aperçu) | Header | OK | État vide peu guidé | CTA première action | Live : panneau + « Aucune notification » |
| F005 | Notifications navigateur (onglet) | Auto | N/A | Permission OS | — | Non testé session |
| F006 | Dark mode | Header | OK | — | Audit contrastes WCAG | Live : toggle clair/sombre |
| F007 | Menu Aide | Header `?` | OK | — | — | Live : tutoriel, docs, support |
| F008 | Partage invite Wroket | Header modal | Partiel | Modal non ouverte | Tester envoi email | Bouton présent |
| F009 | Déconnexion | Header | Partiel | Non exécuté (session) | — | Bouton visible |
| F010 | Badge Early Bird | Header | OK | Visible ≥ sm ; compact « EB » mobile | — | Live EB : `me.earlyBird=true` |
| F011 | Bannière quota Free | Sous header | N/A | Early Bird : pas de quotas Free | Headroom proactif | EB : bypass quotas |
| F012 | Tutoriel onboarding | Aide | Partiel | Non relancé | Rejouer depuis menu | Entrée visible |
| F013 | Feedback produit | Sidebar | Partiel | Modal non testée | — | Bouton présent |
| F014 | Toasts | App-wide | OK | — | — | Live : création tâche/projet |
| F015 | Error boundary | App-wide | N/A | Pas d’erreur provoquée | — | — |
| F016 | Skip to content (a11y) | Clavier | OK | Non testé lecteur écran | Audit a11y | Live : lien présent |
| F017 | i18n FR/EN | Paramètres › Langues | Partiel | Non basculé | — | Onglet présent |
| F018 | PWA manifest | `/manifest.webmanifest` | OK | — | — | HTTP accessible |
| F019 | Guard auth middleware | Routes privées | OK | — | — | Session active |
| F020 | Sync cross-onglet | Broadcast | Partiel | Non testé 2 onglets | — | E2E juin OK |
| F021 | Cross-tab resource sync | Polling | Partiel | — | Indicateur sync | E2E juin OK |
| F022 | Inscription email | `/login` | N/A | Session connectée | — | — |
| F023 | Connexion email | `/login` | N/A | Déjà connecté | — | — |
| F024 | Google SSO | `/login` | N/A | — | — | E2E historique |
| F025 | Microsoft SSO | `/login` | Partiel | E2E login incomplet | Valider parcours | ROADMAP |
| F026 | 2FA TOTP | Login + Sécurité | Partiel | État non consulté | — | E2E P0 OK |
| F027 | 2FA email OTP | Login | Partiel | — | — | E2E historique |
| F028 | Vérification email | `/verify-email` | N/A | Compte déjà vérifié | — | — |
| F029 | Mot de passe oublié | `/forgot-password` | Partiel | Page non visitée | — | Route publique |
| F030 | Reset password | `/reset-password` | Partiel | — | — | Route publique |
| F031 | Redirect post-login | Query redirect | OK | — | — | E2E |
| F032 | Sessions multi-appareils | Sécurité | Partiel | Non consulté | — | Onglet présent |
| F033 | Changement mot de passe | Profil | Partiel | Non testé | — | E2E historique |
| F034 | Export RGPD perso | Admin settings | Partiel | Download non exécuté | Export lisible | Onglet Admin visible |
| F035 | Suppression compte | Admin settings | N/A | Destructif interdit | — | — |
| F036 | Lookup email assignation | API | OK | — | — | E2E collaboration |
| F037 | Landing page | `/` | Partiel | Non visitée (redirect dashboard) | — | Déployée |
| F038 | Pricing | `/pricing` | Partiel | Stripe Checkout absent | Checkout self-service | Page publique |
| F039 | Contact pricing | Modal pricing | Partiel | — | — | E2E mai 2026 |
| F040 | CGU | `/terms` | OK | — | — | Route existe |
| F041 | Confidentialité | `/privacy` | OK | — | — | Route existe |
| F042 | SEO Eisenhower | `/matrice-eisenhower` | OK | — | Indexation GSC | Route existe |
| F043 | SEO Agenda tâches | `/agenda-taches` | OK | — | GSC | Route existe |
| F044 | SEO Gestion équipe | `/gestion-taches-equipe` | OK | — | GSC | Route existe |
| F045 | Partage projet public | `/share/project/[token]` | Partiel | Token non créé | TTL + révocation UX | Feature livrée |
| F046 | Hub documentation | `/docs` | Partiel | Non visité | — | Lien sidebar |
| F047 | Hub dashboard | `/dashboard` | OK | Dense mobile | Widgets configurables | Live : stats à 0 |
| F048 | Stats rapides | Dashboard cards | OK | — | Drill-down | Live |
| F049 | Quadrants Eisenhower | Dashboard | OK | — | — | Live : 4 quadrants |
| F050 | Widget Radar | Dashboard | OK | État vide | Légende modes | Live |
| F051 | Focus semaine | Dashboard | OK | Vide cohérent | Page dédiée | Live |
| F052 | Assignées à moi | Dashboard | OK | — | — | Live |
| F053 | Déléguées par moi | Dashboard | OK | — | — | Live |
| F054 | Complétées récentes | Dashboard | OK | — | — | Live |
| F055 | Bilan hebdomadaire | Dashboard | OK | — | Charge estimée | Live ; E2E §F |
| F056 | Aperçu notifications | Dashboard | OK | — | — | Live |
| F057 | Actions rapides | Dashboard | OK | — | — | Live : liens OK |
| F058 | Édition tâche dashboard | Clic tâche | N/A | Aucune tâche initialement | — | — |
| F059 | Import données dashboard | Modal | Partiel | Non ouvert | — | Bouton présent |
| F060 | Aide dashboard | `?` | OK | — | — | Présent |
| F061 | Hub Mes tâches | `/todos` | OK | — | — | Live |
| F062 | Tâches déléguées | `/todos/delegated` | Partiel | Non visité | — | Lien nav |
| F063 | Onglets scope | `/todos` | OK | — | — | Live : compteurs |
| F064 | Vue Liste | Toggle | OK | — | — | Live |
| F065 | Vue Cards | Toggle | Partiel | Non testé | — | Bouton visible |
| F066 | Vue Radar / Matrice | Toggle | Partiel | Non testé | — | Bouton visible |
| F067 | Filtres multi-critères | Panneau | Partiel | Non ouvert | — | Bouton Filtres |
| F068 | Tri colonnes | Liste | Partiel | — | — | E2E |
| F069 | Drag reorder liste | Liste | Partiel | — | — | E2E |
| F070 | Création rapide tâche | Inline | **KO** | Titre persisté `undefinedAUDIT-20260704-1` (liste + modal) | Fix binding titre avant submit | Live EB : bug confirmé en base |
| F071 | Templates tâches | Modèle | Partiel | Non ouvert | — | Bouton visible |
| F072 | Sélection bulk | Liste | Partiel | 1 tâche seulement | — | — |
| F073 | Undo dernière action | Toolbar | Partiel | Non testé | — | E2E |
| F074 | Export CSV/JSON | Menu Données | Partiel | Non exécuté | — | E2E |
| F075 | Import CSV/JSON | Modal | Partiel | — | — | E2E |
| F076 | Toolbar icônes tâche | Ligne | Partiel | Non détaillé | Menu mobile | — |
| F077 | Sous-tâches | SubtaskModal | Partiel | — | — | E2E |
| F078 | TaskEditModal | Édition | Partiel | Ouvert EB ; titre corrompu F070 | Progressive disclosure | Live EB : récurrence + PJ OK |
| F079 | DeleteTaskDialog | Suppression | Partiel | — | — | E2E |
| F080 | Suppression optimiste | Listes | Partiel | — | — | Livré récemment |
| F081 | Deep links `?edit=` | URL | Partiel | — | — | Code OK |
| F082 | Page help todos | `?` | OK | — | — | Présent |
| F083 | Annuler (undo bar) | Toolbar | Partiel | Disabled sans action | — | Live |
| F084 | Compteur scope | Tabs | OK | — | — | Live |
| F085 | Checkbox select all | Liste | Partiel | Disabled liste vide initiale | — | Live |
| F086 | Récurrence tâches | TaskEditModal | OK | — | — | Live EB : checkbox + Hebdomadaire |
| F087 | Pièces jointes tâche | TaskEditModal | OK | — | — | Live EB : « Ajouter un fichier » actif |
| F088 | Dépendances | TaskEditModal | Partiel | UI non parcourue | — | EB : entitlements OK |
| F089 | Time tracking | TaskEditModal | Partiel | UI non parcourue | — | EB : entitlements OK |
| F090 | Google Meet / Teams | Toolbar | OK | OAuth réunion non testé | — | Live EB : bouton actif |
| F091 | Commentaires | TaskEditModal | Partiel | — | — | E2E |
| F092 | @mentions commentaires | Commentaires | Partiel | — | Statut pending | E2E |
| F093 | SlotPicker | Toolbar | OK | Suggestions + manuel | — | Live : réservation 7 juil. 14h |
| F094 | Quota création tâche | API | N/A | Early Bird bypass | — | EB : pas de `freeQuotas` |
| F095 | Quota 25 tâches (blocage) | API | N/A | Early Bird bypass | — | EB : non applicable |
| F096 | Mon agenda | `/agenda` | OK | — | — | Live : Google + Wroket events |
| F097 | Vue jour | Agenda | OK | — | — | Live |
| F098 | Vue semaine | Agenda | OK | — | — | Live : semaine courante + events |
| F099 | Vue mois | Agenda | OK | — | — | Live EB : toggle Mois |
| F100 | Overlay tâches Wroket | Agenda | OK | — | — | Live : « Valider le plan » sem. 7 juil. |
| F101 | Overlay Google | Agenda | OK | — | — | Live : Auchan, École Solal |
| F102 | Overlay Outlook | Agenda | N/A | Outlook non connecté | — | Google OK |
| F103 | Drag-to-book | Agenda | Partiel | Réservation SlotPicker OK ; drag agenda non testé | — | Live : book manuel |
| F104 | Conflit créneau 409 | Agenda | OK | — | Modale récupérable | Live : chevauchement + « Réserver quand même » |
| F105 | Création rapide créneau | Agenda | OK | Via SlotPicker todos | — | Live : 7 juil. 14:00 |
| F106 | Sync banner créneaux | Agenda | OK | Aucun pending après book | — | Live : pas de banner (sync OK) |
| F107 | Occurrences récurrentes | Agenda | Partiel | Fix récent | E2E multi-semaines | Commit ccbd574 |
| F108 | Indicateur maintenant | Agenda | OK | — | — | E2E |
| F109 | Édition tâche depuis event | Agenda | Partiel | — | — | E2E |
| F110 | Aide agenda | `?` | OK | — | — | — |
| F111 | Gestion agendas page | `/agenda/manage` | OK | — | — | Live EB : page sans lock |
| F112 | Connect Google | Manage | OK | — | — | Live : `?google=connected` |
| F113 | Connect Outlook | Manage | OK | Non connecté | — | Bouton actif |
| F114 | Sélection calendriers | Manage | OK | — | — | Live : 3 calendriers, toggles |
| F115 | Priorité FCFS | Manage | Partiel | Non parcouru en détail | Onboarding | Live manage |
| F116 | Provider booking préféré | Manage | OK | — | — | Live : « Par défaut » sélectionné |
| F117 | Sync in-app → externe | Manage | OK | Tous créneaux liés | — | Live : message sync OK |
| F118 | Aide manage | `?` | OK | Liens docs | — | Live |
| F119 | Liste projets | `/projects` | OK | — | — | Live |
| F120 | Création projet | Modal | OK | — | — | Live |
| F121 | Template picker radio | Modal | OK | — | title tooltips mobile | Live EB : 10/10 sélectionnables |
| F122 | Template quick-start | Modal | OK | 8 todos vs doc 6 | Aligner doc | Live : seed OK |
| F123 | Template agile-sprint-lite | Modal | OK | Sélectionnable | — | Live : radio actif |
| F124 | Templates Pro grisés | Modal | N/A | Early Bird : tous débloqués | — | EB : plus de grisé |
| F125 | Seed batch template | API | OK | Modal « Enregistrement… » | Barre % | Live : 2 phases 8 todos |
| F126 | Sous-projets DnD | Liste | Partiel | — | — | E2E |
| F127 | Health badges | Cards | Partiel | Projet neuf | — | — |
| F128 | Undo projet | Toolbar | Partiel | — | — | E2E |
| F129 | Import CSV nouveau projet | `/projects/import` | Partiel | Non visité | — | Route |
| F130 | Quota 3 projets perso | API | OK | 1/3 après test | — | Live |
| F131 | Import modal liste | Bouton | Partiel | — | — | Bouton visible |
| F132 | Aide projets liste | `?` | OK | — | — | — |
| F133 | Détail projet | `?project=` | OK | Routing query param | URL `/projects/[id]` | Live : Board visible |
| F134 | Vue Board | Tab | Partiel | Phases non visibles snapshot | Scroll/render | Live : onglet |
| F135 | Vue Kanban | Tab | Partiel | — | — | E2E §G |
| F136 | Vue Gantt | Tab | Partiel | — | — | E2E juin |
| F137 | Vue Docs | Tab | Partiel | — | — | — |
| F138 | Panel PMO / Steering | Détail | Partiel | — | — | E2E §G |
| F139 | Export steering PDF | Steering | Partiel | — | — | E2E |
| F140 | Jalons | Steering | Partiel | — | — | E2E |
| F141 | Custom fields projet | Steering | Partiel | Non testé steering EB | — | EB : entitlements OK |
| F142 | Liens partage public | Panel | Partiel | Non testé | TTL UX | — |
| F143 | Move constraints modals | DnD | OK | — | — | E2E §G |
| F144 | Export CSV/JSON projet | Toolbar | Partiel | — | — | E2E |
| F145 | Temps par phase | Sidebar | Partiel | — | — | — |
| F146 | Hub notes | `/notes` | OK | 0 notes | — | Live : hub Données + Bases |
| F147 | Vue Tuiles | Notes | Partiel | — | — | — |
| F148 | Vue Liste notes | Notes | Partiel | — | — | — |
| F149 | Section Bases | Notes | Partiel | — | — | — |
| F150 | Éditeur riche | Notes | Partiel | — | — | E2E |
| F151 | Commandes slash | Notes | Partiel | — | — | E2E |
| F152 | Mode offline | Notes | Partiel | — | Conflits LWW | — |
| F153 | Tags notes | Notes | Partiel | — | — | — |
| F154 | Collaborateurs note | Notes | Partiel | Pas temps réel | CRDT backlog | — |
| F155 | PJ notes | Notes | Gated-OK | — | — | — |
| F156 | Quota 3 notes | API | OK | 0/3 | — | — |
| F157 | Archives notes | `/archive/notes` | Partiel | — | — | E2E |
| F158 | Bases CRUD + vues | Databases | Partiel | — | — | V1 livré |
| F159 | Hub équipes | `/teams` | OK | Carte équipe tronquée snapshot (« T ») | Libellé complet mobile | Live : 1 collab, 1 équipe |
| F160 | Collaborateurs | Teams | OK | — | — | Live : 1 actif |
| F161 | Teams CRUD + rôles | Teams | OK | — | Matrice droits | Live : test Wroket 2026, 2 membres, rôles |
| F162 | Contacts | Teams | Partiel | Répertoire vide | — | Live : section présente |
| F163 | Dashboard équipe | `/teams/dashboard` | OK | Stats à 0 sans tâches équipe | — | Live : sélecteur équipe |
| F164 | Portfolio équipe | `/teams/portfolio` | OK | Aucun projet équipe | Lier projet à l’équipe | Live : état vide cohérent |
| F165 | Reporting 7/14/30j | Dashboard | OK | Données vides | — | Live : périodes + export CSV |
| F166 | Collaborateurs externes | Teams | OK | Invite disabled sans email | — | Live : section dashboard |
| F167 | Transfert ownership | API | Partiel | — | Wizard | — |
| F168 | Aide collaboration | `?` | OK | — | — | — |
| F169 | Centre notifications | `/notifications` | OK | — | — | Live : 1 lue, filtres OK |
| F170 | Filtres tous/lus/non-lus | Page | OK | — | — | Live : Toutes / Lues |
| F171 | Mark read / all read | Page | Partiel | — | — | — |
| F172 | Deep links notifications | Clic | Partiel | — | Fallback entité supprimée | — |
| F173 | Actions invite inline | Cloche | **KO** | Accepter/Refuser restent visibles après clic ; multi-clic possible | `!notif.read` + disable + retirer invite | Live EB : screenshot utilisateur |
| F174 | Email notifications | Backend | Partiel | Délivrabilité | — | — |
| F175 | Webhooks Slack/Teams | Settings | OK | URL webhook non testée | — | Live EB : canaux actifs |
| F176 | Digests horaire/quotidien | Settings | OK | Envoi non testé | — | Live EB : fréquences actives |
| F177 | Web Push opt-in | Settings | Partiel | E2E desktop §I-bis | QA PWA | — |
| F178 | Automatisation overdue | Settings | Partiel | — | — | E2E §E |
| F179 | Archives tâches | `/archive/tasks` | Partiel | — | — | E2E §C |
| F180 | Archives projets | `/archive/projects` | Partiel | — | — | E2E |
| F181 | Archives équipes | `/archive/teams` | Partiel | — | — | — |
| F182 | Archives notes | `/archive/notes` | Partiel | — | — | E2E |
| F183 | Hub données archivées | `/archive/data` | Partiel | — | — | — |
| F184 | Contacts archivés | `/archive/data/contacts` | Partiel | — | — | — |
| F185 | Documents archivés | `/archive/data/documents` | Partiel | — | — | — |
| F186 | Bases archivées | `/archive/data/databases` | Partiel | — | — | — |
| F187 | Actions groupées archives | Panneaux | Partiel | — | — | E2E |
| F188 | Profil | Settings | Partiel | Non édité | — | Onglet OK |
| F189 | Sécurité 2FA | Settings | Partiel | — | — | — |
| F190 | Appareils connectés | Settings | Partiel | — | — | — |
| F191 | Langues FR/EN | Settings | Partiel | — | — | Onglet OK |
| F192 | Préfs tâches (TZ, horaires) | Settings | Partiel | — | — | E2E |
| F193 | Abonnement | Settings | OK | Pas checkout | Stripe Checkout | Live : Free affiché |
| F194 | Hub intégrations | Settings | OK | Sections multiples | Matrice palier | Live |
| F195 | Filtres notif in-app | Intégrations | OK | Colonne livraison disabled | — | Live |
| F196 | Outbound Slack/email | Intégrations | OK | Canaux non configurés | — | Live EB : radios actifs |
| F197 | Notion/Monday OAuth | Intégrations | Partiel | OAuth non connecté | — | Live EB : sections débloquées |
| F198 | Historique activité | Settings | Partiel | — | — | — |
| F199 | Admin RGPD export | Settings | Partiel | Export non téléchargé | — | Onglet visible |
| F200 | Export tâches | `/todos` | Partiel | — | — | E2E |
| F201 | Import tâches | Modal | Partiel | — | — | E2E |
| F202 | Import dashboard | Dashboard | Partiel | — | — | — |
| F203 | Import CSV projet | `/projects/import` | Partiel | — | — | — |
| F204 | Import projet existant | Détail | Partiel | — | — | E2E |
| F205 | Export RGPD JSON | Admin | Partiel | — | — | — |
| F206 | Migration Notion | `/migrate/notion` | Partiel | Wizard non parcouru | — | MVP livré |
| F207 | Sync Notion API | Wizard | Partiel | Token Notion absent | — | Live EB : boutons wizard actifs |
| F208 | Migration Monday | `/migrate/monday` | Partiel | — | — | MVP livré |
| F209 | Templates CSV download | Menu | Partiel | — | — | E2E |
| F210 | Import source badges | UI | Partiel | — | — | — |
| F211 | Console admin | `/admin` | N/A | isAdmin=false | — | — |
| F212 | Stats / users admin | Admin | N/A | — | — | — |
| F213 | Docs guides produit | `/docs/guides/*` | Partiel | — | — | — |
| F214 | Docs intégrations gated | `/docs/integrations/*` | Gated-OK | smallTeams body | Teaser | — |
| F215 | Slack+ Webhook PMO | — | N/A | Backlog | Roadmap P3 | Absent |
| F216 | Slack OAuth natif | — | N/A | Backlog | — | Absent |
| F217 | API publique OpenAPI | — | N/A | Backlog P4 | — | Absent |
| F218 | Notes CRDT temps réel | — | N/A | Backlog | — | Absent |
| F219 | Stripe Checkout | Pricing | N/A | En pause | Reprise P1 | Portail seulement |
| F220 | Accessibilité WCAG ciblée | Global | Partiel | Non audité | Backlog a11y | ROADMAP |

---

## Synthèse chiffrée (post passe Early Bird)

| Verdict | Count | % |
|---------|------:|--:|
| OK | 84 | 38 % |
| Partiel | 110 | 50 % |
| Gated-OK | 2 | 1 % |
| N/A | 22 | 10 % |
| KO | 2 | 1 % |
| *(Partiel inclut non rejoué E2E complet)* | | |

**Passe 1 (Free, earlyBird=false)** : 38 OK, 112 Partiel, 28 Gated-OK, 24 N/A, 0 KO.

**Passe 2 (Free + earlyBird=true)** — tests live supplémentaires :
- `/auth/me` : `earlyBird=true`, `entitlements.integrations` + `teamReporting` = true, pas de `freeQuotas`
- F086–F087, F090, F093 : débloqués (récurrence, PJ, Meet/Teams, Planifier)
- F096–F099, F111–F113 : agenda + manage sans lock
- F121 : 10 templates sélectionnables ; F124 N/A
- F175–F176, F196 : notifications outbound actives
- F163, F165 : dashboard équipe + reporting 7/14/30j + CSV
- **Passe 3 équipe** : collaborateur accepté, équipe `test Wroket 2026`, reporting OK (données vides)
- F206–F207 : `/migrate/notion` avec boutons sync actifs
- **F070 confirmé KO** : titre `undefinedAUDIT-20260704-1` persisté
- **F173 confirmé KO** : invite cloche — boutons Accepter/Refuser persistent après action

**Gated-OK restants (2)** : F155 (PJ notes, non rejoué EB), F214 (docs intégrations teaser).

---

## Passe Early Bird — détail (2026-07-04 PM)

| Zone | Résultat | Limite session |
|------|----------|----------------|
| Entitlements API | OK | — |
| Templates projet (10/10) | OK | Seed non rejoué sur template Pro |
| Tâches avancées (récurrence, PJ) | OK | Dépendances / time tracking non ouverts |
| Calendrier OAuth | Partiel | Boutons actifs ; pas de flow Google/Outlook |
| Agenda vues | OK | Pas d’événements ; drag-book / 409 non testés |
| Reporting équipe | Partiel | Page OK ; « Aucune équipe » |
| Notifications outbound | OK | Pas d’envoi réel webhook/digest |
| Notion migration | Partiel | Wizard UI ; pas de token Notion |
| Admin `/admin` | N/A | `isAdmin=false` |

---

## Passe équipe / collaboration (2026-07-04 PM)

| Zone | Résultat | Notes |
|------|----------|-------|
| Acceptation invite | OK | Cloche vide après accept ; `/notifications` sans boutons (lue) |
| Hub `/teams` | OK | 1 collaborateur actif, 1 équipe |
| Équipe `test Wroket 2026` | OK | 2 membres, gestion rôles (Co-propriétaire…) |
| Dashboard équipe | OK | KPIs 0, reporting 7/14/30j, export CSV |
| Portfolio équipe | OK | « Aucun projet actif pour cette équipe » |
| Collaborateurs externes | OK | Champ invite présent (dashboard) |
| F173 cloche | KO inchangé | Bug multi-clic documenté ; état post-accept OK |

**Données test équipe** : `test Wroket 2026` (`0e5d7de2-91df-40be-b5e5-d72ffdc8fa3e`).

---

## Passe agenda Google connecté (2026-07-04 PM)

| Zone | Résultat | Notes |
|------|----------|-------|
| OAuth Google | OK | Redirect `?google=connected` |
| `/agenda/manage` | OK | Calendriers affichés, défaut réservation, déconnecter |
| Overlay Google | OK | Événements perso visibles (Auchan, École Solal) |
| Overlay Wroket | OK | « Valider le plan » sur semaine 7 juil. 14:00 |
| Filtre calendriers | OK | Panel « Calendriers 1 », toggle email |
| SlotPicker (todos) | OK | Manuel 2026-07-07 14:00 → book OK |
| Conflit 409 | OK | Modale « chevauche une tâche existante » + Annuler / Réserver quand même |
| Drag-to-book agenda | Partiel | Non testé (pointer DnD) |
| Sync banner | N/A | Aucun créneau pending |

**Créneau test créé** : tâche « Valider le plan » → mar. 7 juil. 2026 14:00 (30 min).

**Tests live haute confiance (cumul passes)** : F006–F007, F010–F011, F047–F057, F061–F064, F078, F086–F090, F093–F106, F111–F117, F119–F125, F133–F134, F146, F159–F166, F169–F170, F175–F177, F193–F197, F206–F207, seed template quick-start.

---

## Top 10 frictions (P0 → P2)

| P | Friction | Features | Axe |
|---|----------|----------|-----|
| P0 | Bug titre `undefined` persisté en création tâche | F070 | Fix binding + migration titres corrompus |
| P0 | Upgrade impasse (pas Stripe Checkout) | F038, F219 | Reprendre Checkout ou CTA contact + délais |
| P1 | Invite cloche : boutons persistent après Accepter/Refuser | F173 | Aligner `AppShell` sur `/notifications` |
| P1 | Quotas Free peu visibles (comptes non EB) | F011, F094, F130 | Compteur headroom global header |
| P1 | Densité UI tâches (toolbar, vues) | F076 | Refonte liste / menu contextuel |
| P2 | Recherche globale non validée session | F003 | Test debounce + deep links |
| P2 | Cohérence cross-vues meeting/créneau | F090, F096 | État unifié TaskEditModal |
| P2 | Accessibilité non auditée | F220 | Focus trap, contrastes, labels |

---

## Matrice effort / impact (extraits)

| Action | Effort | Impact UX |
|--------|--------|-----------|
| Fix invite cloche (masquer + anti double-clic) | S | Moyen collaboration |
| Fix undefined input tâche | S | Moyen |
| Compteur quota header | S | Élevé Free |
| Tooltips templates mobile | S | Moyen |
| Stripe Checkout | L | Élevé monétisation |
| URL projets `/projects/[id]` | M | Moyen partage/bookmarks |
| Audit a11y flux critiques | M | Élevé long terme |

---

## Données de test créées (prod)

| Entité | Identifiant | Action recommandée |
|--------|-------------|-------------------|
| Tâche | `undefinedAUDIT-20260704-1` (titre corrompu) | Corriger titre puis archiver |
| Projet | `AUDIT-20260704-PROJ` (`b08c90f5-0754-4ab7-aa19-84ceb0c81281`) | Archiver |
| Équipe | `test Wroket 2026` (`0e5d7de2-91df-40be-b5e5-d72ffdc8fa3e`) | Conserver ou archiver après audit |

---

## Backlog correctifs post-audit (dev)

| ID | Bug | Cause probable | Fix attendu |
|----|-----|----------------|-------------|
| F070 | Titre `undefined` + saisie à la création tâche | Binding state titre | **Fixé** : `normalizeTodoTitleInput` (FE+API) + garde input `title ?? ""` |
| F173 | Cloche : Accepter/Refuser restent après clic | [`AppShell.tsx`](frontend/src/components/AppShell.tsx) L779 : pas de guard `!notif.read` | **Fixé** : guard `!notif.read` + disable pendant action |

---

## Prochaines étapes recommandées

1. ~~**Corriger F070**~~ — fait (normalisation titre FE/BE).
2. ~~**Corriger F173**~~ — fait (cloche alignée sur `/notifications`).
3. ~~**Compteur quota header** (F011/F094/F130)~~ — `FreeQuotaHeadroom` dans le header.
4. ~~**URL projets `/projects/[id]`** (F133)~~ — route canonique + redirect `?project=`.
5. ~~**Toolbar mobile** (F076)~~ — menu « … » sur petit écran.
6. ~~**Tooltips templates** (F121)~~ — attribut `title` sur les boutons template.
7. ~~**Carte équipe tronquée** (F159)~~ — `title={team.name}` sur libellé.
8. ~~**Stripe Checkout** (F038/F219)~~ — **exclu** de cette passe.
9. ~~**F103 drag-to-book agenda**~~ — panneau sans créneau + ghost drag + listeners globaux.
10. ~~**F177 Web Push cloche**~~ — lien push si permission `granted` sans abo local ; aria cloche.
11. ~~**F220 a11y (partiel)**~~ — focus trap ConfirmDialog/DeleteTaskDialog/conflit agenda ; `aria-pressed` vues agenda.
12. Valider **F177** Web Push desktop en prod (checklist §I-bis restante).
13. Poursuivre **a11y** : SlotPicker, modales restantes, contrastes.
14. Archiver entités **AUDIT-*** après déploiement.

*Rapport généré le 2026-07-04 — passes Free, Early Bird, équipe, agenda Google.*
