# P0 — Volet 3 : 2FA TOTP

Objectif : authentification à deux facteurs (TOTP type Google Authenticator) pour les comptes qui l’activent ; compatible **login mot de passe** et **Google SSO** (étape TOTP après preuve d’identité initiale).

---

## 1. Modèle de données & secrets

| Qui | Actions |
|-----|---------|
| **Assistant** | Étend le modèle utilisateur (store Firestore / [`authService`](../../backend/src/services/authService.ts)) : champs du type `totpEnabled: boolean`, `totpSecretB64` (stockage sûr du secret TOTP — base32 ou buffer encodé), `totpVerifiedAt` (ISO), éventuellement **codes de secours** (hashes) en **phase 2**. |
| **Assistant** | Ne jamais exposer le secret brut au client après l’enrôlement (sauf pendant le flux setup). |
| **Toi** | Valide la **politique RGPD** (données de sécurité compte) ; pas de changement majeur si déjà couvert par registre existant. |

---

## 2. Dépendances backend

| Qui | Actions |
|-----|---------|
| **Assistant** | Ajoute `otplib` (TOTP). Option : `qrcode` pour PNG côté serveur ou génération uniquement de l’URL `otpauth://` pour QR côté client. |
| **Assistant** | `npm audit` après ajout ; mettre à jour lockfile. |

---

## 3. API — Enrôlement et désactivation

| Qui | Actions |
|-----|---------|
| **Assistant** | Nouvelles routes sous `/auth` (voir [`authRoutes`](../../backend/src/routes/authRoutes.ts)) : |
| | • `POST /auth/2fa/setup` (**requireAuth**) : génère secret, retourne `{ otpauthUrl, secret }` pour affichage QR une fois. |
| | • `POST /auth/2fa/enable` (**requireAuth**) : body `{ code }` — vérifie TOTP, active `totpEnabled`. |
| | • `POST /auth/2fa/disable` (**requireAuth**) : body `{ password, code }` ou équivalent pour éviter désactivation par session volée seule. |
| **Assistant** | Rate limiting dédié sur ces routes (réutiliser patterns [`express-rate-limit`](../../backend/src/app.ts)). |

---

## 4. API — Login avec étape TOTP

| Qui | Actions |
|-----|---------|
| **Assistant** | Modifier le flux **login mot de passe** : si mot de passe OK et `totpEnabled` → **ne pas** émettre le cookie de session final ; retourner `{ requiresTwoFactor: true, pendingToken: "..." }`. |
| **Assistant** | `pendingToken` : jeton opaque, **courte durée** (ex. 5 min), stocké côté serveur (Map ou entrée dédiée dans le store) avec **usage unique**, lié au `uid`. |
| **Assistant** | `POST /auth/2fa/verify` : body `{ pendingToken, code }` → valide TOTP, invalide pending, émet **cookie session** comme le login actuel. |
| **Assistant** | Modifier le flux **Google SSO** ([`loginWithGoogle`](../../backend/src/services/authService.ts) / callback) : si utilisateur existe et `totpEnabled` → même principe : redirection frontend avec `pendingToken` au lieu de session complète (ou réponse JSON si SPA gère le callback en XHR). |
| **Toi** | Tester manuellement les cas : compte **sans** 2FA (inchangé), **avec** 2FA mot de passe, **avec** 2FA + Google. |

---

## 5. Invalidation sessions

| Qui | Actions |
|-----|---------|
| **Assistant** | À la **désactivation** 2FA ou **changement mot de passe** : invalider sessions existantes comme pour [`changePassword`](../../backend/src/services/authService.ts) (déjà invalidation des autres sessions). |
| **Assistant** | À l’**activation** 2FA : optionnel — invalider autres sessions pour forcer re-login avec 2FA. |

---

## 6. Frontend

| Qui | Actions |
|-----|---------|
| **Assistant** | **Paramètres** : section Sécurité — activer 2FA (affichage QR via `otpauthUrl` ou librairie QR côté client), champ code de confirmation. |
| **Assistant** | **Login** : si réponse `requiresTwoFactor`, afficher écran **Code 2FA** + appel `POST /auth/2fa/verify`. |
| **Assistant** | **Callback Google** : si redirection avec `pendingToken`, même écran code 2FA. |
| **Assistant** | i18n FR/EN pour les nouveaux libellés ([`i18n`](../../frontend/src/lib/i18n.ts)). |
| **Toi** | Revue UX (messages d’erreur, lien « problème avec le code ? »). |

---

## 7. Sécurité — rappels

| Qui | Actions |
|-----|---------|
| **Assistant** | Limite tentatives sur `verify` (lockout temporaire ou rate limit strict). |
| **Assistant** | Logs sans jamais loguer le code TOTP ni le secret. |
| **Toi** | Documenter dans la doc utilisateur comment récupérer l’accès si perte téléphone (codes de secours phase 2 ou procédure admin / support). |

---

## 8. Synthèse des responsabilités

| Livrable | Toi | Assistant |
|----------|-----|-----------|
| Validation produit / flux SSO | Tests manuels, comptes test | Implémentation |
| Modèle user + API 2FA | — | Code backend |
| Routes + pendingToken | — | Code backend |
| UI Paramètres + login | Review | Code frontend |
| Rate limits | — | Code backend |

---

## Checklist de fin de volet

- [x] Activation / désactivation 2FA depuis **Paramètres**.
- [x] Login **email+mot de passe** avec 2FA activé.
- [x] Login **Google** avec 2FA activé (si applicable au design retenu).
- [x] Pas de régression pour utilisateurs **sans** 2FA.
- [ ] (Optionnel phase 2) **Codes de secours** + procédure perte d’appareil.
