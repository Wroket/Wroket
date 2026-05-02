# Radar — événements produit et cibles

Instrumentation minimale côté client : [`trackRadarEvent`](../frontend/src/lib/productAnalytics.ts), événement DOM `wroket_radar_analytics`, et hook optionnel `window.__wroketAnalytics(event, payload?)` pour brancher PostHog, Plausible, ou un backend ultérieur sans refactor massif.

## Événements définis

| Nom | Déclencheur | Payload |
|-----|-------------|---------|
| `radar_view_enter` | L’utilisateur affiche la vue **Radar** sur Mes tâches | — |
| `radar_mode_change` | Changement de lentille (Eisenhower, Pression, ROI, Charge × urgence) | `mode` |
| `radar_open_edit` | Ouverture de l’édition de tâche depuis un point ou la carte survol du Radar | `todoId` |

## Entonnoir suggéré

1. Sessions avec au moins un `radar_view_enter`.
2. Parmi celles-ci, sessions avec au moins un `radar_open_edit` (intention d’agir après lecture du Radar).
3. *(À mesurer côté produit / analytics tiers)* : créneau enregistré ou présence sur `/agenda` dans la même session — hors périmètre de ces trois événements seuls.

## Cibles de conversion (à ajuster après baseline)

Valeurs indicatives pour arbitrage backlog ; à remplacer par des mesures réelles une fois la baseline collectée pendant 2–4 semaines.

| Indicateur | Cible initiale | Notes |
|------------|----------------|--------|
| Part des utilisateurs actifs hebdo ayant au moins une entrée Radar (`radar_view_enter`) | **≥ 25 %** | Radar doit être découvert et utilisé, pas seulement vu sur la landing. |
| Ratio « ouverture édition depuis Radar » / « entrées Radar » (`radar_open_edit` / `radar_view_enter` par session)* | **≥ 35 %** | Le Radar doit mener à une action, pas uniquement à de la consultation. |

\* Agrégation par session ou par utilisateur selon l’outil analytics ; éviter de comparer des totaux bruts d’événements sans dédoublonnage.

## Écoute du DOM (intégration externe)

```js
window.addEventListener("wroket_radar_analytics", (e) => {
  const { event, payload, ts } = e.detail;
  // envoyer vers votre stack analytics
});
```

**Dernière mise à jour** : 2026-05-01
