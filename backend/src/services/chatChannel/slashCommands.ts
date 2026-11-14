/**
 * Shared slash / command text handler (Slack `/wroket`, Teams, Chat, Discord).
 */

import { findUserByUid } from "../authService";
import { bookTodoSlot, proposeSlotsForTodo } from "../calendarSlotService";
import {
  createTodo,
  findTodoForUser,
  listAssignedToMe,
  listTodos,
  type Todo,
} from "../todoService";
import {
  addManualTimeSession,
  getActiveTimerForUser,
  startTimeTimer,
  stopTimeTimer,
} from "../timeSessionService";
import {
  formatMyWeekDigest,
  formatOverdueDigest,
  formatTeamRiskDigest,
} from "../pmoDigestService";
import {
  previewCommittee,
  previewPlanWeek,
  previewRisks,
} from "../assistCommandsService";
import { taskDeepLink } from "../notificationFormatting";
import { normalizeChatTodoId, runTaskAction } from "./taskActions";

const SLASH_HELP = [
  "*Commandes Wroket*",
  "`help` — cette aide",
  "`tasks` — vos tâches actives (+ boutons Start / +15 min sur Slack)",
  "`add <titre>` — créer une nouvelle tâche rapidement",
  "`my-week` — Ma semaine (retards + échéances/créneaux 7j)",
  "`overdue` — tâches actives en retard",
  "`team-risk` — projets d’équipe at-risk / overdue",
  "`committee <projectId>` | `comite` — prépare mon comité (preview)",
  "`plan-week` | `planifie` — planifie ma semaine (créneaux proposés, confirm dans l’app)",
  "`risks` | `risques` — résumé risques équipe + retards",
  "`open <todoId>` — détail + lien",
  "`plan <todoId> [auto]` — proposer ou réserver un créneau calendrier",
  "`timer` | `start <todoId>` | `stop` | `log <todoId> <min> [note]` — suivi du temps",
  "`accept <todoId>` — accepter une assignation",
  "`decline <todoId>` — refuser",
  "`complete <todoId>` — terminer",
].join("\n");

export function slashHelpText(commandPrefix = "/wroket"): string {
  return SLASH_HELP.replace("*Commandes Wroket*", `*Commandes \`${commandPrefix}\`*`).replace(
    /`help`/,
    `\`${commandPrefix} help\``.replace(`${commandPrefix} `, ""),
  );
}

/** Help text with optional slash prefix in usage lines (Slack style). */
export function slashHelpTextForPrefix(prefix: string): string {
  const p = prefix.trim() || "/wroket";
  return [
    `*Commandes \`${p}\`*`,
    `\`${p} help\` — cette aide`,
    `\`${p} tasks\` — vos tâches actives (+ boutons Start / +15 min sur Slack)`,
    `\`${p} add <titre>\` — créer une nouvelle tâche rapidement`,
    `\`${p} my-week\` — Ma semaine (retards + échéances/créneaux 7j)`,
    `\`${p} overdue\` — tâches actives en retard`,
    `\`${p} team-risk\` — projets d’équipe at-risk / overdue`,
    `\`${p} committee <projectId>\` | \`${p} comite\` — prépare mon comité (preview)`,
    `\`${p} plan-week\` | \`${p} planifie\` — planifie ma semaine (confirm dans l’app)`,
    `\`${p} risks\` | \`${p} risques\` — résumé risques + retards`,
    `\`${p} open <todoId>\` — détail + lien`,
    `\`${p} plan <todoId> [auto]\` — proposer ou réserver un créneau calendrier`,
    `\`${p} timer\` | \`${p} start <todoId>\` | \`${p} stop\` | \`${p} log <todoId> <min> [note]\` — suivi du temps`,
    `\`${p} accept <todoId>\` — accepter une assignation`,
    `\`${p} decline <todoId>\` — refuser`,
    `\`${p} complete <todoId>\` — terminer`,
  ].join("\n");
}

function formatTodoLine(todo: Todo): string {
  const asg = todo.assignmentStatus ? ` · ${todo.assignmentStatus}` : "";
  return `• *${todo.title}* \`${todo.id}\`${asg}`;
}

export async function handleSlashText(opts: {
  actorUid: string;
  text: string;
  /** Shown in help / usage (default `/wroket`). */
  commandPrefix?: string;
}): Promise<string> {
  const prefix = opts.commandPrefix?.trim() || "/wroket";
  const raw = (opts.text ?? "").trim();
  const [cmd, ...rest] = raw.length === 0 ? ["help"] : raw.split(/\s+/);
  const arg = rest.join(" ").trim();
  const verb = cmd.toLowerCase();

  if (verb === "help" || verb === "?" || verb === "aide") {
    return slashHelpTextForPrefix(prefix);
  }

  if (verb === "tasks" || verb === "list" || verb === "mine") {
    const [mine, assigned] = await Promise.all([
      listTodos(opts.actorUid),
      listAssignedToMe(opts.actorUid),
    ]);
    const personal = mine.filter((t) => t.status === "active").slice(0, 10);
    const assignedActive = assigned.filter((t) => t.status === "active").slice(0, 10);

    if (personal.length === 0 && assignedActive.length === 0) {
      return "Aucune tâche active (personnelle ou assignée).";
    }

    const sections: string[] = [];
    if (personal.length > 0) {
      sections.push(`*Personnelles* (${personal.length}) :`, ...personal.map(formatTodoLine));
    }
    if (assignedActive.length > 0) {
      sections.push(`*Assignées à vous* (${assignedActive.length}) :`, ...assignedActive.map(formatTodoLine));
    } else {
      sections.push("_Aucune tâche assignée par quelqu’un d’autre._");
    }
    return sections.join("\n");
  }

  if (verb === "my-week" || verb === "week" || verb === "semaine") {
    return formatMyWeekDigest(opts.actorUid);
  }

  if (verb === "overdue" || verb === "retard") {
    return formatOverdueDigest(opts.actorUid);
  }

  if (verb === "team-risk" || verb === "risk") {
    return formatTeamRiskDigest(opts.actorUid);
  }

  if (verb === "committee" || verb === "comite" || verb === "comité") {
    const projectId = normalizeChatTodoId(arg) || arg.trim();
    if (!projectId) {
      return `Usage : \`${prefix} committee <projectId>\` — id visible dans l’app Projets.`;
    }
    try {
      const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
      const preview = await previewCommittee(opts.actorUid, actorEmail, projectId);
      return preview.summaryMarkdown;
    } catch (err) {
      return `Impossible de préparer le comité : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "plan-week" || verb === "planifie") {
    try {
      const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
      const preview = await previewPlanWeek(opts.actorUid, actorEmail);
      return preview.summaryMarkdown;
    } catch (err) {
      return `Impossible de planifier la semaine : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "risks" || verb === "risques") {
    try {
      const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
      const preview = await previewRisks(opts.actorUid, actorEmail);
      return preview.summaryMarkdown;
    } catch (err) {
      return `Impossible de résumer les risques : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "add" || verb === "create" || verb === "new" || verb === "ajout" || verb === "creer") {
    if (!arg) return `Usage : \`${prefix} add <titre de la tâche>\``;
    const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
    const todo = await createTodo(opts.actorUid, actorEmail, {
      title: arg,
      priority: "medium",
    });
    const link = taskDeepLink(todo.id);
    return `✅ Tâche créée : *${todo.title}* \`${todo.id}\`${link ? ` · <${link}|Ouvrir dans Wroket>` : ""}`;
  }

  if (verb === "plan" || verb === "slots" || verb === "creneau") {
    const todoId = normalizeChatTodoId(rest[0] ?? "");
    const mode = rest[1];
    if (!todoId) return `Usage : \`${prefix} plan <todoId> [auto]\``;
    const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
    try {
      const proposal = await proposeSlotsForTodo(opts.actorUid, actorEmail, todoId);
      const topSlot = proposal.suggestedSlot ?? proposal.slots[0] ?? null;
      if (mode && ["auto", "1", "book"].includes(mode.toLowerCase())) {
        if (!topSlot) {
          return `Aucun créneau disponible trouvé pour \`${todoId}\`.`;
        }
        const booked = await bookTodoSlot(opts.actorUid, actorEmail, todoId, {
          start: topSlot.start,
          end: topSlot.end,
          force: true,
        });
        if (!booked.ok) {
          return `Conflit calendrier sur \`${todoId}\`.`;
        }
        return `📅 Créneau réservé pour *${booked.todo.title}* (\`${todoId}\`) : ${topSlot.start} → ${topSlot.end}`;
      }
      if (proposal.slots.length === 0) {
        return `Aucun créneau libre trouvé pour \`${todoId}\` (${proposal.duration} min).`;
      }
      const slotLines = proposal.slots.slice(0, 4).map(
        (s, idx) => `${idx + 1}. *${s.label}* (\`${s.start}\` → \`${s.end}\`)`,
      );
      return [
        `📅 *Créneaux proposés pour \`${todoId}\`* (${proposal.duration} min) :`,
        ...slotLines,
        `💡 Tapez \`${prefix} plan ${todoId} auto\` pour réserver le 1er créneau.`,
      ].join("\n");
    } catch (err) {
      return `Impossible de planifier \`${todoId}\` : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "timer" || verb === "chrono") {
    const active = getActiveTimerForUser(opts.actorUid);
    if (!active) {
      return "⏱️ Aucun chrono actif en cours.";
    }
    const elapsedMin = Math.max(
      0,
      Math.round((Date.now() - new Date(active.startedAt).getTime()) / 60_000),
    );
    const found = await findTodoForUser(opts.actorUid, active.todoId);
    const title = found?.todo.title ?? active.todoId;
    return `⏱️ Chrono actif sur *${title}* (\`${active.todoId}\`) — *${elapsedMin} min* écoulées.`;
  }

  if (verb === "start") {
    const startTodoId = normalizeChatTodoId(arg);
    if (!startTodoId) return `Usage : \`${prefix} start <todoId>\` — ids via \`${prefix} tasks\``;
    try {
      const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";
      const timer = await startTimeTimer(opts.actorUid, actorEmail, startTodoId);
      const found = await findTodoForUser(opts.actorUid, timer.todoId);
      const title = found?.todo.title ?? timer.todoId;
      return `⏱️ Chrono démarré sur *${title}* (\`${timer.todoId}\`). Tapez \`${prefix} stop\` pour l’arrêter.`;
    } catch (err) {
      return `Impossible de démarrer le chrono : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "stop") {
    try {
      const session = stopTimeTimer(opts.actorUid);
      const found = await findTodoForUser(opts.actorUid, session.todoId);
      const title = found?.todo.title ?? session.todoId;
      return `⏹️ Chrono arrêté : *${session.durationMinutes} min* enregistrées sur *${title}* (\`${session.todoId}\`).`;
    } catch (err) {
      return `Impossible d’arrêter le chrono : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "log") {
    const todoId = normalizeChatTodoId(rest[0] ?? "");
    const minStr = rest[1];
    const noteParts = rest.slice(2);
    const mins = Number(minStr);
    if (!todoId || !Number.isFinite(mins) || mins <= 0) {
      return `Usage : \`${prefix} log <todoId> <minutes> [note]\` — ids via \`${prefix} tasks\``;
    }
    try {
      const note = noteParts.join(" ").trim() || null;
      const session = await addManualTimeSession(opts.actorUid, todoId, Math.round(mins), note);
      const found = await findTodoForUser(opts.actorUid, session.todoId);
      const title = found?.todo.title ?? session.todoId;
      return `✅ *${session.durationMinutes} min* enregistrées sur *${title}* (\`${session.todoId}\`).`;
    } catch (err) {
      return `Impossible d’enregistrer le temps : ${(err as Error).message || "erreur"}`;
    }
  }

  if (verb === "open") {
    const openTodoId = normalizeChatTodoId(arg);
    if (!openTodoId) return `Usage : \`${prefix} open <todoId>\``;
    const actorEmail = findUserByUid(opts.actorUid)?.email;
    const found = await findTodoForUser(opts.actorUid, openTodoId, actorEmail);
    if (!found) {
      return `Tâche introuvable pour \`${openTodoId}\` (ou accès refusé).`;
    }
    const t = found.todo;
    const link = taskDeepLink(t.id);
    const lines = [
      `*${t.title}*`,
      `Id : \`${t.id}\``,
      `Statut : ${t.status}`,
      t.assignmentStatus ? `Assignation : ${t.assignmentStatus}` : null,
      link ? `<${link}|Ouvrir dans Wroket>` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  if (verb === "accept" || verb === "decline" || verb === "complete") {
    const actionTodoId = normalizeChatTodoId(arg);
    if (!actionTodoId) return `Usage : \`${prefix} ${verb} <todoId>\``;
    const result = await runTaskAction({
      actorUid: opts.actorUid,
      targetUid: opts.actorUid,
      todoId: actionTodoId,
      action: verb,
    });
    return result.message;
  }

  return `Commande inconnue « ${cmd} ».\n\n${slashHelpTextForPrefix(prefix)}`;
}
