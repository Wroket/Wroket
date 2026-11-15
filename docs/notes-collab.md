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
- Conflit LWW (titre / diagrammes) : toast + Recharger / Continuer si `isDirty`.
- Toolbar + slash + OCR : path TipTap quand l’éditeur actif est TipTap.

## Tests

- Unit : `backend/src/services/noteCollabStore.test.ts` (merge 2 clients + presence + XmlFragment).
- Residual terrain : 2 navigateurs, owner + collaborateur write, co-édition texte sans perte.

## Hors scope (Next)

- Co-édition équipe multi-writer.
- Diagrammes CRDT.
- Offline multi-writer CRDT queue.
- Cursors dessinés dans le ProseMirror (aujourd’hui : chips / bandeau).
