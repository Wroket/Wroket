# How-to — Connecter un agent (MCP)

**Objectif** : laisser Cursor, Claude Desktop ou un autre client MCP agir sur vos tâches / projets Wroket — **sans** IA hébergée dans Wroket.

> **Guide produit in-app (FR/EN)** : [wroket.com/docs/integrations/mcp](https://wroket.com/docs/integrations/mcp)  
> **Référence technique** (outils, scopes, smoke) : [mcp-agents.md](../mcp-agents.md)

## En 4 étapes

1. **Paramètres → Intégrations → Connecter votre agent**.
2. Créer une clé (libellé du type « Cursor laptop ») → **copier le secret tout de suite** (`wrk_live_…`, affiché une seule fois).
3. Coller le snippet proposé dans la config MCP du client (Cursor : `mcp.json`).
4. Tester : « liste mes tâches », « santé du projet X », ou prompts `/plan-my-week` · `/prepare-steering-committee` · `/triage-overdue`.

## Ce que l’agent peut faire (MCP v2)

Tâches, projets / phases / jalons, notes, créneaux, digests PMO, équipes, timer, OKR, bases / contacts, partage — selon les **scopes** de la clé.  
Détail : [mcp-agents.md](../mcp-agents.md) · guide in-app ci-dessus.

## Sécurité

| Action | Effet |
|--------|--------|
| Révoquer la clé | Les appels avec ce secret passent immédiatement en échec |
| Ne pas committer le secret | Jamais dans Git ni une issue publique |
| Une clé par machine / usage | Plus simple à révoquer qu’une clé partagée |

Limites : Free = 1 clé active ; Small teams+ / early bird = jusqu’à 5.

## Assist vs MCP

| | **Assist** (in-app) | **MCP** (agent externe) |
|--|---------------------|-------------------------|
| Où | Dashboard / projet | Cursor, Claude, etc. |
| IA | Aucune (commandes déterministes) | Celle de votre agent |
| Mutations | Confirm UI | Via outils MCP + vos prompts |
