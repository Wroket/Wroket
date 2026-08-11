# Branding Wroket

Ce document définit la source canonique du logo Wroket et les assets dérivés.

## Source canonique

- `frontend/src/components/brand/WroketBrand.tsx`
  - `WroketMark` (icône)
  - `WroketWordmark` (wordmark)
  - `WroketLockup` (assemblage canonique)

Le tracé de l'icône provient du composant homepage historique `WroketLogo`.

## Assets officiels dérivés

Tous les assets statiques doivent vivre dans `frontend/public/brand/`:

- `wroket-mark-dark.svg`
- `wroket-mark-light.svg`
- `wroket-lockup-dark.svg`
- `wroket-lockup-light.svg`
- `wroket-lockup-neutral-email.svg`
- `wroket-lockup-neutral-email.png` (dérivé du SVG — **emails uniquement**, rendu avec Manrope Bold pour coller au wordmark V2)

## Matrice d'usage

- **Frontend applicatif / site**
  - Utiliser en priorité les composants React canoniques (`WroketMark/Lockup`).
  - Utiliser les SVG `public/brand/` uniquement pour les besoins statiques.
- **Emails transactionnels + digest**
  - Utiliser `wroket-lockup-neutral-email.png` (hébergé sur le frontend, chemin public `/brand/`).
  - Ne pas utiliser le SVG en email : la plupart des clients bloquent les images SVG distantes.
- **Notifications non-email (Slack/Teams/Chat)**
  - Aucun asset image canonique requis actuellement.
  - En cas d'ajout visuel futur, utiliser `public/brand/` uniquement.

## Assets dépréciés

- `wroket-logo.png` est **déprécié** et ne doit plus être référencé en runtime.
- Les anciens assets historiques (`wroket-black.png`, `wroket-slate*.png`,
  `wroket-gradient*.png`, `wroket-icon-v*.png`, etc.) ne doivent pas être
  utilisés pour de nouveaux écrans/emails sans validation explicite.
