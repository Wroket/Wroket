/**
 * Shared slash / command text handler (Slack `/wroket`, Teams, Chat, Discord).
 */

import { findTodoForUser, listAssignedToMe, listTodos, type Todo } from "../todoService";
import {
  formatMyWeekDigest,
  formatOverdueDigest,
  formatTeamRiskDigest,
} from "../pmoDigestService";
import { taskDeepLink } from "../notificationFormatting";
import { runTaskAction } from "./taskActions";

const SLASH_HELP = [
  "*Commandes Wroket*",
  "`help` — cette aide",
  "`tasks` — vos tâches actives (personnelles + assignées)",
  "`my-week` — Ma semaine (retards + échéances/créneaux 7j)",
  "`overdue` — tâches actives en retard",
  "`team-risk` — projets d’équipe at-risk / overdue",
  "`open <todoId>` — détail + lien",
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
    `\`${p} tasks\` — vos tâches actives (personnelles + assignées)`,
    `\`${p} my-week\` — Ma semaine (retards + échéances/créneaux 7j)`,
    `\`${p} overdue\` — tâches actives en retard`,
    `\`${p} team-risk\` — projets d’équipe at-risk / overdue`,
    `\`${p} open <todoId>\` — détail + lien`,
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

  if (verb === "team-risk" || verb === "risk" || verb === "risques") {
    return formatTeamRiskDigest(opts.actorUid);
  }

  if (verb === "open") {
    if (!arg) return `Usage : \`${prefix} open <todoId>\``;
    const found = await findTodoForUser(opts.actorUid, arg);
    if (!found) return "Tâche introuvable ou accès refusé.";
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
    if (!arg) return `Usage : \`${prefix} ${verb} <todoId>\``;
    const result = await runTaskAction({
      actorUid: opts.actorUid,
      targetUid: opts.actorUid,
      todoId: arg,
      action: verb,
    });
    return result.message;
  }

  return `Commande inconnue « ${cmd} ».\n\n${slashHelpTextForPrefix(prefix)}`;
}
