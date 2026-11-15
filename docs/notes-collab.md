# Notes collaborative editing (CRDT MVP)

**Livré 2026-11-15** — TipTap + Yjs sur les zones **texte**, sync HTTP, presence cluster-safe.

## Architecture

```
Owner TipTap ──┐
               ├── Y.Doc (fragments block:{id}) ── POST /notes/:id/collab/sync ── Firestore note_collab
Collab TipTap ─┘
Presence ──────── POST /notes/:id/presence (cursor optional) ── same doc TTL 15s
```

- **Pas de WebSocket sticky** sur `wroket-api` (Cloud Run min 0 / max 2).
- HTML dérivé : TipTap `getHTML` → `updateNote` (export / search / offline).
- Diagrammes : toujours LWW (hors MVP CRDT).
- ACL : `resolveNoteAccess` — write = owner ou `collaboratorWrite` ; RO team inchangé.

## UX

- Bandeau **En ligne** (pairs viewing / editing).
- **Curseurs distants** (Docs-like) : décorations ProseMirror dans TipTap — caret coloré + label prénom + sélection ; alimentés par `presence.cursor` (poll ~1.8s, pas de Yjs Awareness / WS).
- Conflit LWW (titre / diagrammes) : toast + Recharger / Continuer si `isDirty`.
- Toolbar + slash + OCR : path TipTap quand l’éditeur actif est TipTap.
- **Notif partage** : `note_shared` quand un owner ajoute un collaborateur direct (distinct de `note_mention`).
- **Historique** : anneau 5 snapshots (`noteRevisions`) à chaque save contenu (title/content/blocks) ; panneau Historique + restore ; soft-delete archive inchangé.

## Tests

- Unit : `backend/src/services/noteCollabStore.test.ts` (merge 2 clients + presence + XmlFragment).
- Unit : `backend/src/services/contentRevisionService.test.ts` (anneau 5).
- E2E terrain 2026-11-15 : 2 navigateurs, co-édition texte + presence OK.

## Hors scope (Next)

- Co-édition équipe multi-writer.
- Diagrammes CRDT.
- Offline multi-writer CRDT queue.
- Curseurs temps réel sub-200ms (`CollaborationCaret` + Awareness / canal SSE|WS).
