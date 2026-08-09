# Revue mensuelle — funnel Projets → créneau

Mesure post Path to 9 Projets (Phase D). À remplir chaque mois après que les cold paths projets sont verts.

## KPI

| Mois | `project_created` | `project_task_created` | `first_slot_booked` (source=`project`) | Taux tâche→créneau (48 h) | Incidents 403 move collab | Notes |
|------|-------------------|------------------------|----------------------------------------|---------------------------|---------------------------|-------|
| | | | | | | |

## Sources

- Client : `window.__wroketAnalytics` / event DOM `wroket_product_analytics`
- Événements : `project_created`, `project_task_created`, `first_slot_booked` (`source: "project"`)
- Checklist terrain : [`docs/cold-path-projects.md`](cold-path-projects.md)

## Actions si taux &lt; cible

1. Vérifier SoftLock quota / Early Bird sur Board·Kanban·Gantt
2. Vérifier prompt post-create → `/agenda?schedule=`
3. Vérifier logs 403 `moveTodo` (éditeurs équipe vs viewers)
