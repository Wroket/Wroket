# Assist PMO — IA Phase 2 (intégrée minimale)

**Statut** : livré 2026-11-14.

## Principe

Orchestration **déterministe** des primitives déjà livrées (digests PMO, steering, créneaux, share links). **Pas** de LLM hébergé dans Wroket — l’agent externe reste le serveur MCP ([guide in-app](https://wroket.com/docs/integrations/mcp) · [how-to](./user-guides/mcp-agent.md) · [mcp-agents.md](./mcp-agents.md)).

## Commandes

| Commande | Preview | Apply (UI only) |
|----------|---------|-----------------|
| Prépare mon comité | Steering + retards + bloqueurs + liens share | Créer lien share 7 j |
| Planifie ma semaine | Focus + créneaux proposés | Réserver (ou forcer conflits) |
| Résume les risques | Risques équipe + retards perso | Lecture seule |

## Surfaces

- **UI** : dashboard (`AssistPmoPanel`) + onglet Pilotage projet (comité).
- **Slash** : `/wroket committee <projectId>`, `plan-week`, `risks` (preview only).
- **API** : `GET/POST /assist/committee`, `/assist/plan-week`, `/assist/risks`.

## Garde-fous

- Aucune mutation sans confirm UI (`role="dialog"`).
- SoftLock / droits : messages actionnables (pricing / refus share).
- Slash ne réserve pas automatiquement les créneaux.
