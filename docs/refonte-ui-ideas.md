# Refonte UI — idées et pistes

Document de travail produit et design pour la refonte de l’interface. Il complète la vue stratégique du [ROADMAP](../ROADMAP.md) (section « Refonte UX (plan solide) »), sans la remplacer. Il sert d’arbitrage avant toute implémentation.

**Couleurs, transparence, pastilles** : la source à jour est la [charte `design-template.md`](design-template.md) (alignée sur le code `frontend/`).

## Principe produit : deux versions d’interface

L’objectif est de permettre à l’utilisateur de **choisir** entre :

- **Version actuelle** — référence stable, habitudes préservées, risque de rupture minimal.
- **Version refaite** — nouvelle présentation et/ou nouvelles interactions, alignée sur les lots UX du roadmap.

Les modalités techniques restent à décider au moment du chantier : préférence dans les **Paramètres**, bascule par **feature flag**, période de **cohabitation** des deux modes, et possibilité de **revenir** à tout moment à la version actuelle sans perte de données métier.

---

## Idée 1 — Ligne de tâche : menu contextuel pour les actions

**Constat.** Aujourd’hui, la barre d’actions rapides (`TaskIconToolbar`) expose de nombreuses icônes sur une même ligne : accomplir, sous-tâche (si pas sous-tâche), planifier (`SlotPicker`), annuler la tâche, refuser/accepter une assignation (selon contexte), commentaires, pièces jointes, note liée, réunion vidéo (si activé), suppression.

**Piste.** Regrouper **toutes ces actions** dans un **menu contextuel**, déclenché par exemple par :

- un bouton « ⋯ » ou « Plus d’actions » sur la ligne, et/ou
- un **clic droit** sur la ligne de tâche (desktop).

Les entrées du menu reprendraient les mêmes comportements que les boutons actuels (y compris états désactivés, spinners de chargement, badges).

**Effets attendus.**

- **À gagner** : ligne plus lisible, moins d’encombrement visuel, meilleure tenue sur petits écrans.
- **À surveiller** : les utilisateurs très rapides peuvent subir **un clic supplémentaire** pour une action fréquente ; il faudra tester (raccourcis clavier, épinglage d’actions favorites, etc.).

---

## Idée 2 — Ligne de tâche : vue « tableau » à colonnes

**Piste.** Structurer la vue liste comme un **tableau** avec colonnes identifiables (fixes ou configurables ultérieurement), par exemple :

| Colonne (ordre indicatif) | Rôle |
|---------------------------|------|
| Poignée / drag | Réordonnancement (aligné sur le drag & drop liste existant). |
| Actions | Bouton unique ouvrant le **menu contextuel** (idée 1). |
| Titre | Texte de la tâche, clic pour éditer. |
| Tags | Badges issus des tags tâche. |
| Créneau planifié | `scheduledSlot` (résumé + accès planification). |
| Priorité | Haute / moyenne / basse. |
| Effort | Léger / moyen / lourd. |
| Échéance | Date limite. |
| Classification | Quadrant Radar / catégorie de traitement (selon le vocabulaire produit actuel : Planifier, Expédier, etc.). |

**Risques et contraintes.**

- **Largeur** : sur desktop, défilement horizontal ou colonnes masquables ; sur mobile, une **vue alternative** (cartes, colonnes réduites) sera probablement nécessaire.
- **Cohérence** : cette liste doit rester alignée avec les **autres vues** (Radar, cartes par quadrant) pour éviter deux « vérités » sur la même tâche.

### Réordonnancement des colonnes (drag & drop)

**Piste.** Permettre de **réordonner les colonnes** du tableau par glisser-déposer sur la ligne d’en-tête (logique proche d’un tableur ou d’un client mail).

**Phasing.** Envisager une **première livraison** avec colonnes dans un **ordre fixe**, puis une **itération suivante** avec en-têtes réordonnables : le gain UX est réel, mais la mise en œuvre (état, persistance, responsive) augmente nettement la charge.

**Persistance.** Conserver l’ordre des colonnes soit en **local** (**localStorage** ou équivalent) pour un MVP sans évolution API, soit dans les **préférences utilisateur** côté serveur si l’ordre doit suivre l’utilisateur sur plusieurs appareils — impact backend alors **limité** (champ ou JSON de préférences sur le profil).

**Contraintes.** Sur **petit écran**, le drag d’en-têtes est souvent peu adapté : prévoir ordre par défaut ou réglage dans une sous-vue « colonnes » plutôt que sur la grille. **Accessibilité** : ne pas se limiter au glisser-déposer ; prévoir au minimum une alternative dans les paramètres de la liste (liste ordonnée des colonnes, réordonnancement au clavier si faisable).

---

## Suite (à planifier)

- Maquettes ou prototype cliquable pour valider idée 1 et idée 2 ensemble (menu + colonnes).
- Tests utilisateurs ciblés sur la liste des tâches (premiers jets en interne ou bêta restreinte).
- Critères pour décider du **mode par défaut** (actuel vs refonte) lors du basculement général.
