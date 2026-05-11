# Charte couleurs Wroket (template design)

Document **dérivé du code versionné** dans ce dépôt (Tailwind v4 + `globals.css`). À tenir à jour quand on change les classes centrales. Pour la genèse produit (canvas « Design System couleurs »), voir aussi le canvas Cursor projet si besoin de contexte historique.

---

## 1. Fondations CSS (`frontend/src/app/globals.css`)

| Token | Valeur (référence Tailwind) | Usage indicatif |
|-------|----------------------------|-----------------|
| `--color-primary` | `emerald-600` | Action principale, CTA rempli |
| `--color-danger` | `red-600` | Destruction / erreur critique |
| `--color-success` | `green-600` | Succès |
| `--color-warning` | `amber-500` | Avertissement |
| `--color-info` | `blue-500` | Information |
| `--color-brand-dark` | `slate-800` | Fonds type conteneur logo lockup |
| `--color-secondary-accent` | `indigo-600` | Accent marque secondaire (liens, détails) |

Variables page :

- `:root` : `--background` `#ffffff`, `--foreground` `#171717`
- `.dark` : `--background` `#0b1120`, `--foreground` `#e2e8f0`, `color-scheme: dark`

---

## 2. Marque (logo)

Fichier : [`WroketBrand.tsx`](../frontend/src/components/brand/WroketBrand.tsx)

- Traits SVG : **`#10b981`** (emerald-500) et **`#4f46e5`** (indigo-600)
- Wordmark : `Wro` en slate selon thème, `ket` en emerald (`text-emerald-400` / `500` selon contexte)
- Conteneur du mark (lockup) : `bg-slate-800` / `dark:bg-slate-100` (auto)

**Principe** : emerald = action / identité positive ; indigo = double ton de marque (lisibilité sur CTA verts).

---

## 3. Neutres (structure UI)

Très répandus dans l’app et la vitrine :

| Rôle | Light | Dark |
|------|-------|------|
| Fond page | `bg-white` | `dark:bg-slate-950` |
| Texte principal | `text-zinc-900` | `dark:text-slate-100` |
| Texte secondaire | `text-zinc-600` | `dark:text-slate-400` |
| Texte tertiaire / meta | `text-zinc-500` | `dark:text-slate-400` |
| Bordures légères | `border-zinc-100`, `border-zinc-200` | `dark:border-slate-700`, `dark:border-slate-800` |
| Surfaces cartes / panneaux | `bg-white`, `bg-zinc-50` | `dark:bg-slate-900`, `dark:bg-slate-800/50` |
| Hover discret | `hover:bg-zinc-100` | `dark:hover:bg-slate-800` |

---

## 4. Transparence & « effet vitrine » (landing / pricing)

Référence principale : [`page.tsx` (landing)](../frontend/src/app/page.tsx) — mêmes motifs sur [`pricing/page.tsx`](../frontend/src/app/pricing/page.tsx).

### 4.1 Barre de navigation flottante

- `backdrop-blur-md` + fond semi-opaque : `bg-white/80`, `dark:bg-slate-950/80`
- Bordure basse : `border-zinc-100` / `dark:border-slate-800`

**Intention** : le contenu défile « sous » une couche légèrement vitrée, pas un bandeau opaque plein.

### 4.2 Hero — dégradés et halos

- Fond section : `bg-gradient-to-br from-emerald-50 via-white to-indigo-50`
- Dark : `dark:from-emerald-950/20 dark:via-slate-950 dark:to-indigo-950/20` (**opacité sur les stops**)
- Halos décoratifs : `bg-emerald-200/30`, `dark:bg-emerald-500/10`, idem indigo — `blur-3xl` + `rounded-full`

**Intention** : profondeur sans saturer ; le `/20` et `/30` sur les teintes sont la signature « douce ».

### 4.3 Carte / mock produit (mini liste)

- Carte : `bg-white dark:bg-slate-900` + `shadow-2xl shadow-zinc-300/50 dark:shadow-black/30`
- Barre fenêtre : `bg-zinc-50 dark:bg-slate-800/50` + bordure `border-zinc-100 dark:border-slate-800`
- **Lignes de tâche** : `bg-zinc-50 dark:bg-slate-800/50` + `border-zinc-100 dark:border-slate-700/50` (**fond et bordure en semi-transparence côté dark**)

### 4.4 Pastilles « soft » (priorité, tag, créneau dans le mock)

Pattern récurrent :

- Fond clair : `bg-*-100` (ex. `bg-red-100`, `bg-amber-100`)
- Fond dark : `dark:bg-*-900/30` ou `dark:bg-*-900/20` (**transparence sur la teinte**)
- Texte : `text-*-700` / `dark:text-*-300` ou `400`

Exemples dans le mock hero :

- Priorité : `bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300` (idem amber, blue, zinc pour basse)
- Tag : `bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300`
- Créneau horaire : `bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400`

### 4.5 CTA et ombres colorées

- CTA principal : `bg-emerald-600` … `shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40` (**ombre teintée semi-transparente**)

### 4.6 Titre en dégradé (marketing)

- `bg-gradient-to-r from-emerald-500 to-indigo-500 bg-clip-text text-transparent`

### 4.7 Règle de synthèse

Pour reproduire l’esprit vitrine **in-app** (hors gros bandeaux radar) :

1. Préférer **`bg-{hue}-100` + `dark:bg-{hue}-900/20–/35`** aux aplats `bg-{hue}-500 text-white` pour les petites étiquettes.
2. Utiliser **`/{opacity}`** sur fonds et bordures en dark (`border-slate-700/50`, `bg-slate-800/50`).
3. **`backdrop-blur`** + fond **`…/80`** pour les en-têtes sticky « glass ».
4. Réserver les aplats saturés aux **zones structurelles fortes** (ex. en-têtes de colonnes matrice Eisenhower, voir §6).

---

## 5. Boutons (`frontend/src/components/ui/Button.tsx`)

| Variante | Classes (extrait) |
|----------|-------------------|
| primary | `bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-400` |
| secondary | `border-zinc-200 dark:border-slate-600 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800` |
| danger | `border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40` |
| ghost | `text-zinc-500 … hover:bg-zinc-100 dark:hover:bg-slate-800` |

---

## 6. Matrice Eisenhower — en-têtes (saturés)

Fichier : [`todoConstants.ts`](../frontend/src/lib/todoConstants.ts) — `QUADRANT_CONFIG`

| Quadrant | headerBg | cellBg (cellules grille) |
|----------|----------|--------------------------|
| do-first | `bg-red-500 dark:bg-red-950/90` | `bg-zinc-100/80 dark:bg-slate-800/60` |
| schedule | `bg-blue-500 dark:bg-blue-950/90` | idem |
| delegate | `bg-amber-400 dark:bg-amber-950/90` | idem |
| eliminate | `bg-zinc-400 dark:bg-zinc-800/90` | idem |

**Note** : ici les en-têtes restent **lisibles et forts** ; les cellules utilisent déjà **`/80` et `/60`** (transparence légère). Les **badges de ligne** (liste / radar) sont traités à part (§7).

---

## 7. Pastilles liste (soft, alignées vitrine)

### 7.1 Priorité — `PRIORITY_BADGES`

Fichier : [`todoConstants.ts`](../frontend/src/lib/todoConstants.ts)

| Clé | `cls` (extrait) |
|-----|-----------------|
| high | `rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300` |
| medium | `rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200` |
| low | `rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300` |

### 7.2 Effort — `EFFORT_BADGES`

Fichier : [`effortBadges.ts`](../frontend/src/lib/effortBadges.ts)

| Clé | `cls` (extrait) |
|-----|-----------------|
| light | `… bg-teal-100 … dark:bg-teal-900/30 …` |
| medium | `… bg-violet-100 … dark:bg-violet-900/30 …` |
| heavy | `… bg-orange-100 … dark:bg-orange-900/30 …` |

### 7.3 Quadrant (badge texte) — `QUADRANT_BADGES`

Fichier : [`sortUtils.ts`](../frontend/src/app/todos/_components/sortUtils.ts)

Même famille : `rounded-full` + `bg-*-100` + `dark:bg-*-900/30` (eliminate : `bg-zinc-200` + `dark:bg-slate-700/50`).

### 7.4 Sous-tâches — `SUBTASK_BADGE_CLS`

[`todoConstants.ts`](../frontend/src/lib/todoConstants.ts) : `bg-emerald-50 … dark:bg-emerald-900/25 …` + hovers `emerald-100` / `dark:bg-emerald-900/45`.

### 7.5 Créneau planifié

[`SlotPicker.tsx`](../frontend/src/components/SlotPicker.tsx) — `ScheduledSlotBadge` : `bg-emerald-50 … dark:bg-emerald-900/20 …` (proche du slot du mock landing).

### 7.6 Échéances — `deadlineLabel().cls`

Fichier : [`deadlineUtils.ts`](../frontend/src/lib/deadlineUtils.ts)

| Cas | Pattern |
|-----|---------|
| overdue | `rounded-full bg-rose-100 … dark:bg-rose-900/35 …` |
| today | `rounded-full bg-orange-100 … dark:bg-orange-900/30 …` |
| tomorrow | `rounded-full bg-amber-100 … dark:bg-amber-900/30 …` |
| ≤7 jours | `rounded-full bg-sky-100 … dark:bg-sky-900/30 …` |
| date lointaine | `rounded-full bg-zinc-200 … dark:bg-slate-600/50 …` |

---

## 8. Filtres matrice (`FILTER_BUTTONS.activeClass`)

Dans [`sortUtils.ts`](../frontend/src/app/todos/_components/sortUtils.ts) : même **famille soft** que §7 (`rounded-full`, `bg-*-100`, `dark:bg-*-900/30` ou équivalent, bordure teintée) pour cohérence si ces classes sont réutilisées pour un état « filtre actif ».

---

## 9. Checklist pour une nouvelle UI

- [ ] Fond : `zinc` / `slate` cohérent avec §3
- [ ] CTA principal : emerald (§1 + §5)
- [ ] Lien / accent secondaire marque : indigo quand pertinent (§2)
- [ ] Petites étiquettes : pattern §4.4 / §7 (éviter `bg-{color}-500 text-white` sauf exception critique)
- [ ] Dark : tester **`/20`–`/50`** sur fonds teintés et bordures
- [ ] Sticky header optionnel : `backdrop-blur-md` + `bg-…/80` (§4.1)

---

*Dernière extraction depuis la branche de travail : classes telles que présentes dans les fichiers listés ; en cas de divergence, le code fait foi jusqu’à prochaine mise à jour de ce document.*
