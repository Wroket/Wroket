# Matrice features Wroket — audit fiabilité

Référence pour [`../SKILL.md`](../SKILL.md). Chaque ligne = une **feature** à couvrir sans exception lors d'un audit `full`.

Légende colonnes **Entrées** : UI route ou action · API · Service clé · Persistance.

---

## infra-persistence

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Boot & hydrate | `server.ts`, `persistence.ts`, `todoService.hydrate*` | lazy vs full boot ; `TODOS_READ_SOURCE` |
| Flush store/* | `persistence.ts`, `adminOpsAlertService` | flush_exhausted, docs > 1 MiB |
| todos_v2 writes | `todoDocStore.ts`, `persistTodos` | await avant 200 ; stale writes |
| Live invalidation | `attachLiveInvalidation`, onSnapshot | reconnect, cross-replica |
| Drift monitor | `todosDriftMonitor`, `/health/ready` | alertes, reconcile script |
| Local dev store | `USE_LOCAL_STORE`, `backend/data/` | ne pas confondre avec prod |

---

## todos

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Mes tâches (actives) | `/todos`, `GET /todos`, `listTodos` | lazy hydrate owner |
| Déléguées / assignées | `/todos/delegated`, `GET /todos/assigned`, `listAssignedToMe` | query Firestore cross-user |
| Archives | `GET /todos/archived`, purge rétention | assigné + owner |
| CRUD & quotas Free | `todoController`, `createTodo`, `updateTodo` | PaymentRequired, personal quota |
| Sous-tâches & ordre | `batchReorder`, parentId | |
| Import CSV | `taskImportService`, `TaskImportModal` | codes erreur i18n |
| Export CSV/JSON | `exportTodos` | |
| Commentaires & mentions | `commentService`, notifications | accès cross-user |
| Pièces jointes | `attachmentService`, counts | |
| Récurrence | `recurrence` sur Todo | gating Free |
| Dépendances | `todoDependencyService` | plan Small teams+ |
| Custom fields | `customFieldService` | entitlements |
| Move unifié | `POST /todos/:id/move` | skill DnD si projet |

---

## projects

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| CRUD projet | `/projects`, `projectController` | team, parent, archive |
| Phases & milestones | `addPhase`, steering | |
| Vues Board / Kanban | `ProjectDetailView`, onglets | parité handlers DnD |
| Gantt | Gantt grid, dates, DnD barres | contraintes phase |
| Templates projet | `templateRoutes`, création séquentielle | perf batch API |
| Conversion phase ↔ sous-projet | `phaseConversionService` | todos cross-owner |
| Partage public | `sharePublicRoutes`, token | lecture todos projet |
| Export projet | `exportProject` | |
| Portfolio équipe | `teamPortfolioService` | listProjectTodos async |
| Liens partage PMO | ROADMAP P2 | si présent sur main |

---

## calendar

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Agenda / Ma semaine | `/agenda`, `calendarController` | |
| Suggestion créneaux | `findAvailableSlots`, Google busy | |
| Book slot | `bookTaskSlot`, 409 force | golden path constraint UX |
| Conflits | `calendarConflictService`, `findSlotConflicts` | assigned + owned todos |
| Google Calendar | `googleCalendarService`, OAuth | multi-comptes |
| Microsoft / Teams | `microsoftCalendarService` | invités externes |
| Meet lifecycle | meet todos, PATCH, cleanup | E2E § checklist |
| Sync events | `syncEventsRoutes`, webhooks | |

---

## auth-security

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Login / register | `/auth`, cookies | `AUTH_*` codes |
| Google SSO | OAuth callback | |
| Microsoft SSO | si activé | doc azure |
| 2FA TOTP | auth routes | |
| Session / logout | `COOKIE_SECURE`, CORS | |
| Profil & RGPD delete | purge user, todos, attachments | data-safety |
| Admin | `adminRoutes`, `ADMIN_EMAILS` | ops alerts |
| Rate limits | route limiters | |

---

## teams-collab

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| CRUD équipe | `/teams`, `teamController` | |
| Invitations & rôles | collaborateurs, pending | |
| Assignation tâches | `assignedTo`, notifications | multi-instance |
| Notifications in-app | `notificationService`, cloche | |
| Web Push | `pushRoutes`, VAPID | |
| Mentions commentaires | pending mentions | |
| Digest / email | reminder jobs | |

---

## notes-attachments

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Notes CRUD | `/notes`, folders | quotas Free |
| Lien note ↔ tâche | `detachNotesFromTodoIds` | purge cascade |
| Uploads GCS | `attachmentService`, `UPLOAD_DIR` | taille, types |
| Chiffrement | `CRYPTO_KEK` | rotation = illisible |

---

## integrations

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Notion ZIP import | `notionImportService` | capacité quotas |
| Notion API sync | `notionApiService` | si exposé |
| Monday import | `mondayImportController` | |
| External sync | `externalSyncService`, diff/apply | idempotence |
| Slack webhook | webhooks, ROADMAP Slack+ | |

---

## billing

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Plans & entitlements | `authService.getEntitlements` | gating UI+API |
| Stripe webhooks | `stripeBillingController` | secrets Cloud Run |
| Portail client | `create-portal-session` | |
| Page pricing | `/pricing`, contact SMTP | |
| Quotas Free | `quotaUsageService`, todos/projects/notes | |

---

## push-pwa

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| PWA manifest & SW | `frontend/public/sw.js` | CSP |
| Offline fallback | service worker | |
| Push subscribe | `pushRoutes` | |

---

## admin-marketing

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| Admin ops dashboard | admin UI, flush status | |
| Feedback | `feedbackRoutes` | |
| Early bird | `earlyBirdRoutes` | |
| Marketing / contact | `marketingRoutes`, `contactRoutes` | |
| User databases | `userDatabaseRoutes` | entitlements |

---

## i18n-a11y-seo (transversal)

| Feature | Entrées | Notes audit |
|---------|---------|-------------|
| i18n FR/EN | `frontend/src/lib/i18n.ts` | parcours audités |
| apiErrors mapping | `apiErrors.ts` | codes backend |
| Modales a11y | `role="dialog"`, focus trap | constraint modals |
| SEO | `sitemap.ts`, metadata | pages publiques |
| Dark mode | theme toggle | |

---

## Commandes utiles pendant l'audit

```bash
# Backend
cd backend && npm run build && npm test

# Frontend
cd frontend && npm run build && npm test

# Drift (prod credentials required)
cd backend && npm run check:todos-drift
```
