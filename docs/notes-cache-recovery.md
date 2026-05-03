# Notes — cache local et récupération

> **Mise à jour 2026-05-03** : Le problème systémique de divergence cross-device (notes fantômes, données périmées entre appareils) est désormais résolu au niveau backend (`Firestore onSnapshot` multi-replica) et frontend (`useResourceSync` sur tous les écrans). Ce document reste utile pour les incidents résiduels et l'opération manuelle de resynchronisation.

---

# Notes — cache local et récupération avant déploiement

Les notes « hors ligne » utilisent `localStorage` par navigateur (`wroket_notes`, `wroket_notes_dirty`, `wroket_notes_deleted`). Après une correction de synchronisation, un rechargement peut **purger** du cache les notes qui n’existent plus sur le serveur (notes supprimées ou purgées depuis un autre appareil).

## Avant un déploiement qui corrige la fusion cache/serveur

Si tu vois encore des **notes fantômes** (présentes sur un navigateur mais absentes du serveur / d’un autre appareil), sauvegarde leur contenu **avant** de recharger la page après mise à jour.

### Option A — tout le cache notes

Sur `https://wroket.com` (ou ton URL), DevTools → Console :

```javascript
copy(localStorage.getItem('wroket_notes'));
```

Colle le résultat dans un fichier JSON.

### Option B — filtrer par titres connus

```javascript
copy(JSON.stringify(
  JSON.parse(localStorage.getItem('wroket_notes') || '[]')
    .filter(n => ['titre1', 'titre2'].includes(n.title)),
  null,
  2
));
```

Tu peux ensuite recréer les notes à la main ou utiliser l’import JSON/CSV prévu dans l’app (voir aide Bloc-notes / Paramètres).

## Réinitialiser le cache côté UI

Sur la page Bloc-notes, utilise **Resynchroniser depuis le serveur** (vide le cache local puis recharge les notes depuis l’API). Utile en cas de liste incohérente après un incident réseau ou un bug résolu.
