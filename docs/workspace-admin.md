# Workspace admin (hors siège, hors core app)

Rôle **`workspace-admin`** distinct du rôle équipe **`admin`** (accès produit complet).

## RBAC

| Rôle | Siège facturé | Gestion roster / billing | Tâches / Projets / Notes |
|------|---------------|--------------------------|---------------------------|
| `owner` / `co-owner` / `admin` (siège) | Oui | Oui | Oui |
| `workspace-admin` | **Non** | Oui (console équipe) | **Non** |
| `super-user` / `user` | Oui | Non | Oui (super-user) / lecture (user) |
| Collaborateur externe | Non (plan perso) | Non | Oui (collaboration) |

### Règles sièges

- Stockage : `Team.workspaceAdmins[]` (hors `members[]`), max **2** par équipe.
- `usedSeats(team) = 1 + team.members.length` (workspace-admins exclus).
- **Exclusivité** : un email ne peut pas être dans `members[]` et `workspaceAdmins[]` sur la même équipe.
- Éligibilité équipe : `billingPlan` ∈ `{ small, large }`.

### Helpers backend (`teamService.ts`)

- `getWorkspaceContext(uid, email)` → `{ isWorkspaceAdminOnly, managedTeamIds, hasSeatMembership }`
- `canManageTeamWorkspace(team, uid, email)` — roster, ext-collaborators, features équipe
- `canManageTeam` — inchangé (owner / co-owner / admin siège) ; requis pour supprimer l'équipe
- `canAccessProductFeatures(uid, email)` — `false` si workspace-admin-only (aucun siège)

## API — workspace-admins

### Modèle

```typescript
interface WorkspaceAdmin {
  email: string;
  addedAt: string;
  addedByUid?: string;
}
```

### Endpoints

| Méthode | Route | Appelant |
|---------|-------|----------|
| `GET` | `/teams/:teamId/workspace-admins` | `canManageTeamWorkspace` |
| `POST` | `/teams/:teamId/workspace-admins` | `canManageTeam` (siège) |
| `DELETE` | `/teams/:teamId/workspace-admins/:email` | `canManageTeam` ou auto-retrait |

Codes d'erreur : `WORKSPACE_ADMIN_FORBIDDEN`, `WORKSPACE_ADMIN_ALREADY_MEMBER`, `WORKSPACE_ADMIN_DUPLICATE`, `WORKSPACE_ADMIN_CAP_REACHED`.

### `/auth/me`

- `workspaceAdminTeamIds: string[]`
- `isWorkspaceAdminOnly: boolean`
- Entitlements : plan personnel uniquement si `isWorkspaceAdminOnly` (pas d'union plan équipe).

## Guards routes produit

Middleware `requireProductAccess` sur : `/todos`, `/projects`, `/calendar`, `/notes`, `/user-databases`, `/attachments`, `/templates`, `/webhooks`, `/integrations`, `/import`, `/contacts`, `/admin`.

Réponse `403` : `{ "code": "WORKSPACE_ADMIN_PRODUCT_DENIED", "message": "Accès produit réservé aux membres avec siège" }`.

Allowlist : `/auth/*`, `/teams/*` (partiel), `/billing/team-portal-session`, `/notifications/*`, `/push/*`.

## Billing délégué

`POST /billing/team-portal-session` — corps `{ teamId }` ; session Stripe sur l'abonnement équipe ; audit `team_billing_portal_opened`.

## Features équipe (P4)

`GET/PATCH /teams/:teamId/features` — toggles `integrationsEnabled` (défaut selon plan).
