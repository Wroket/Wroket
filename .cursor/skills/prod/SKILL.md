---
name: prod
description: >-
  Constrains work to the production codebase as deployed from main (origin/main).
  Use when the user says /prod, production, main, or wants changes aligned with what ships.
---

# Travail « production » (Wroket)

## Référentiel de code

- La **prod** suit le dépôt **`main`** sur `origin` (déploiement Cloud Build / Cloud Run). Traiter **`main`** comme source de vérité pour les correctifs et évolutions « live ».

## Git (recommandé avant de coder)

1. `git fetch origin`
2. `git checkout main`
3. `git pull origin main` (si l’utilisateur veut être aligné sur la prod distante)

## Règles

1. **Périmètre** : fonctionnalités et fichiers présents sur `main`.
2. **Déploiement** : ne pas pousser en prod sans validation utilisateur ; rappeler que `main` déclenche le pipeline quand c’est le flux du projet.
