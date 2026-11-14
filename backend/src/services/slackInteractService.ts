/**
 * Slack Lot 3 — interactivity + slash command business logic.
 * Task actions / slash / identity email mapping live in `chatChannel/` (shared socle).
 */

import {
  actionIdToTaskAction,
  CHAT_ACTION_IDS,
  handleSlashText as handleSharedSlashText,
  parseButtonValue,
  resolveUserFromChatEmail,
  runTaskAction,
  slashHelpTextForPrefix,
  type ChatActionResult,
  type ChatTaskAction,
} from "./chatChannel";
import {
  fetchSlackUserEmail,
  openSlackTaskModal,
  postSlackResponseUrl,
  publishSlackAppHome,
  resolveBotTokenForTeam,
} from "./slackApiService";
import { findUserByUid } from "./authService";
import { listProjects } from "./projectService";
import {
  createTodo,
  findTodoForUser,
  listAssignedToMe,
  listTodos,
  type Effort,
  type Todo,
} from "./todoService";
import {
  addManualTimeSession,
  getActiveTimerForUser,
  startTimeTimer,
  stopTimeTimer,
} from "./timeSessionService";
import { formatMyWeekDigest } from "./pmoDigestService";
import { taskDeepLink } from "./notificationFormatting";

const LOG_QUICK_MINUTES = 15;

export type SlackTaskAction = ChatTaskAction;
export type SlackActionResult = ChatActionResult;

export { parseButtonValue, actionIdToTaskAction };

/**
 * Map Slack user → Wroket user via email (users.info + findUserByEmail).
 */
export async function resolveWroketUserFromSlack(opts: {
  teamId: string;
  slackUserId: string;
}): Promise<{ uid: string; email: string } | { error: string }> {
  const token = resolveBotTokenForTeam(opts.teamId);
  if (!token) {
    return {
      error:
        "Aucun workspace Slack Wroket trouvé pour cette équipe. Un utilisateur doit connecter Slack dans Paramètres → Intégrations.",
    };
  }
  const email = await fetchSlackUserEmail(token, opts.slackUserId);
  return resolveUserFromChatEmail(email, {
    unknownEmailHint:
      "Impossible de lire votre email Slack. Reconnectez l’app Wroket avec le scope users:read.email, et vérifiez que votre email est visible dans Slack.",
  });
}

/**
 * Run accept / decline / complete — shared `runTaskAction` (Slack re-export).
 */
export async function runSlackTaskAction(opts: {
  actorUid: string;
  targetUid: string;
  todoId: string;
  action: SlackTaskAction;
}): Promise<SlackActionResult> {
  return runTaskAction(opts);
}

export function slashHelpText(): string {
  return slashHelpTextForPrefix("/wroket");
}

export async function handleSlashText(opts: {
  actorUid: string;
  text: string;
}): Promise<string> {
  return handleSharedSlashText({ ...opts, commandPrefix: "/wroket" });
}

function timerButtonValue(todoId: string, uid: string): string {
  return `${todoId}|${uid}`;
}

/** Block Kit actions: Start chrono + log 15 min (optional Complete). */
export function buildTimerActionElements(
  todoId: string,
  uid: string,
  opts?: { includeComplete?: boolean },
): unknown[] {
  const value = timerButtonValue(todoId, uid);
  const elements: unknown[] = [
    {
      type: "button",
      style: "primary",
      text: { type: "plain_text", text: "⏱️ Start" },
      action_id: CHAT_ACTION_IDS.startTimer,
      value,
    },
    {
      type: "button",
      text: { type: "plain_text", text: `+${LOG_QUICK_MINUTES} min` },
      action_id: CHAT_ACTION_IDS.log15,
      value,
    },
  ];
  if (opts?.includeComplete) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "✅ Terminer" },
      action_id: CHAT_ACTION_IDS.complete,
      value,
    });
  }
  return elements;
}

/**
 * Ephemeral Block Kit reply for `/wroket tasks` — pick a task without pasting ids.
 */
export function buildSlackTasksTimerBlocks(opts: {
  uid: string;
  personal: Todo[];
  assigned: Todo[];
}): { text: string; blocks: unknown[] } {
  const personal = opts.personal.slice(0, 8);
  const assigned = opts.assigned.slice(0, 8);
  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Vos tâches* — cliquez *⏱️ Start* ou *+15 min* (pas besoin de coller l’id).",
      },
    },
  ];

  const pushSection = (title: string, todos: Todo[]) => {
    if (todos.length === 0) return;
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${title}* (${todos.length})` },
    });
    for (const t of todos) {
      const link = taskDeepLink(t.id);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${t.title}*${link ? ` · <${link}|Ouvrir>` : ""}`,
        },
      });
      blocks.push({
        type: "actions",
        elements: buildTimerActionElements(t.id, opts.uid),
      });
    }
  };

  pushSection("Personnelles", personal);
  pushSection("Assignées à vous", assigned);

  if (personal.length === 0 && assigned.length === 0) {
    return {
      text: "Aucune tâche active (personnelle ou assignée).",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "_Aucune tâche active._ Créez-en une avec `/wroket add <titre>` ou le bouton App Home.",
          },
        },
      ],
    };
  }

  return {
    text: "Vos tâches — utilisez les boutons ⏱️ Start / +15 min.",
    blocks,
  };
}

export async function loadTasksForTimerPicker(uid: string): Promise<{
  personal: Todo[];
  assigned: Todo[];
}> {
  const [mine, assigned] = await Promise.all([listTodos(uid), listAssignedToMe(uid)]);
  return {
    personal: mine.filter((t) => t.status === "active").slice(0, 8),
    assigned: assigned.filter((t) => t.status === "active").slice(0, 8),
  };
}

export type SlackTimerButtonAction = "start_timer" | "log_15" | "stop_timer";

export function actionIdToTimerAction(actionId: string): SlackTimerButtonAction | null {
  if (actionId === CHAT_ACTION_IDS.startTimer || actionId === "start_timer") return "start_timer";
  if (actionId === CHAT_ACTION_IDS.log15 || actionId === "log_15") return "log_15";
  if (actionId === "wroket_stop_timer" || actionId === "stop_timer") return "stop_timer";
  return null;
}

/**
 * Handle Slack timer buttons (Start / +15 min / Stop).
 * `targetUid` in the button value must match the clicker (same pattern as accept/decline).
 */
export async function runSlackTimerButton(opts: {
  actorUid: string;
  targetUid: string;
  todoId?: string;
  action: SlackTimerButtonAction;
}): Promise<{ ok: boolean; message: string }> {
  if (opts.actorUid !== opts.targetUid) {
    return { ok: false, message: "Cette action ne vous est pas destinée." };
  }
  const actorEmail = findUserByUid(opts.actorUid)?.email ?? "";

  try {
    if (opts.action === "stop_timer") {
      const session = stopTimeTimer(opts.actorUid);
      const found = await findTodoForUser(opts.actorUid, session.todoId);
      const title = found?.todo.title ?? session.todoId;
      return {
        ok: true,
        message: `⏹️ Chrono arrêté : *${session.durationMinutes} min* sur *${title}*`,
      };
    }

    const todoId = opts.todoId?.trim();
    if (!todoId) {
      return { ok: false, message: "Tâche manquante sur le bouton." };
    }

    if (opts.action === "start_timer") {
      const timer = await startTimeTimer(opts.actorUid, actorEmail, todoId);
      const found = await findTodoForUser(opts.actorUid, timer.todoId);
      const title = found?.todo.title ?? timer.todoId;
      return {
        ok: true,
        message: `⏱️ Chrono démarré sur *${title}*. Bouton *Arrêter* (App Home) ou \`/wroket stop\`.`,
      };
    }

    const session = await addManualTimeSession(
      opts.actorUid,
      todoId,
      LOG_QUICK_MINUTES,
      "Slack +15 min",
    );
    const found = await findTodoForUser(opts.actorUid, session.todoId);
    const title = found?.todo.title ?? session.todoId;
    return {
      ok: true,
      message: `✅ *${session.durationMinutes} min* enregistrées sur *${title}*`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message || "Erreur suivi du temps" };
  }
}

/** Strip action blocks from a Slack message after a successful click. */
export function stripActionBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((b) => {
    if (!b || typeof b !== "object") return true;
    return (b as { type?: string }).type !== "actions";
  });
}

export async function updateMessageAfterAction(opts: {
  responseUrl?: string;
  originalBlocks?: unknown;
  resultText: string;
  ok: boolean;
}): Promise<void> {
  if (!opts.responseUrl) return;
  const kept = stripActionBlocks(opts.originalBlocks);
  const blocks = [
    ...kept,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: opts.ok ? `✅ ${opts.resultText}` : `⚠️ ${opts.resultText}`,
        },
      ],
    },
  ];
  await postSlackResponseUrl(opts.responseUrl, {
    replace_original: true,
    text: opts.resultText,
    blocks,
  });
}

/**
 * Open the Slack task creation modal (`views.open`) for a resolved Wroket user.
 */
export async function openSlackCreateTaskModalForUser(opts: {
  teamId: string;
  uid: string;
  triggerId: string;
  initialTitle?: string;
  initialNotes?: string;
}): Promise<boolean> {
  const token = resolveBotTokenForTeam(opts.teamId);
  if (!token || !opts.triggerId) return false;
  const actorEmail = findUserByUid(opts.uid)?.email ?? "";
  const projects = listProjects(opts.uid, actorEmail)
    .filter((p) => p.status === "active")
    .map((p) => ({ id: p.id, name: p.name }));
  return openSlackTaskModal({
    accessToken: token,
    triggerId: opts.triggerId,
    initialTitle: opts.initialTitle,
    initialNotes: opts.initialNotes,
    projects,
  });
}

/**
 * Parse a `view_submission` payload from `wroket_create_task_modal` and create the task.
 */
export async function handleSlackModalSubmission(opts: {
  uid: string;
  stateValues: Record<string, Record<string, unknown>> | undefined;
}): Promise<{ ok: true; todo: Todo } | { ok: false; error: string }> {
  const values = opts.stateValues ?? {};
  const titleNode = values.title_block?.title_input as { value?: string } | undefined;
  const deadlineNode = values.deadline_block?.deadline_input as { selected_date?: string | null } | undefined;
  const effortNode = values.effort_block?.effort_input as
    | { selected_option?: { value?: string } | null }
    | undefined;
  const projectNode = values.project_block?.project_input as
    | { selected_option?: { value?: string } | null }
    | undefined;
  const notesNode = values.notes_block?.notes_input as { value?: string | null } | undefined;

  const title = (titleNode?.value ?? "").trim();
  if (!title) {
    return { ok: false, error: "Le titre de la tâche est requis." };
  }

  const deadline = deadlineNode?.selected_date?.trim() || undefined;
  const rawEffort = effortNode?.selected_option?.value;
  const effort: Effort | undefined =
    rawEffort === "light" || rawEffort === "medium" || rawEffort === "heavy"
      ? rawEffort
      : undefined;
  const projectId = projectNode?.selected_option?.value?.trim() || undefined;
  const notes = notesNode?.value?.trim() || undefined;

  const actorEmail = findUserByUid(opts.uid)?.email ?? "";
  const todo = await createTodo(opts.uid, actorEmail, {
    title,
    priority: "medium",
    ...(deadline ? { deadline } : {}),
    ...(effort ? { effort } : {}),
    ...(projectId ? { projectId } : {}),
    ...(notes ? { notes } : {}),
  });
  return { ok: true, todo };
}

/**
 * Build and publish the Slack App Home (`views.publish`) for a user.
 */
export async function refreshSlackAppHomeForUser(opts: {
  teamId: string;
  slackUserId: string;
  uid?: string;
}): Promise<boolean> {
  const token = resolveBotTokenForTeam(opts.teamId);
  if (!token) return false;

  let uid = opts.uid;
  if (!uid) {
    const resolved = await resolveWroketUserFromSlack({
      teamId: opts.teamId,
      slackUserId: opts.slackUserId,
    });
    if ("error" in resolved) {
      return publishSlackAppHome({
        accessToken: token,
        slackUserId: opts.slackUserId,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "🚀 Wroket — Mon Espace Pilotage" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ ${resolved.error}`,
            },
          },
        ],
      });
    }
    uid = resolved.uid;
  }

  const [personal, assigned, myWeekText] = await Promise.all([
    listTodos(uid),
    listAssignedToMe(uid),
    formatMyWeekDigest(uid),
  ]);
  const activeTimer = getActiveTimerForUser(uid);

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🚀 Wroket — Mon Espace Pilotage" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "➕ Nouvelle tâche" },
          action_id: "wroket_open_create_modal",
          value: uid,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔄 Actualiser" },
          action_id: "wroket_refresh_home",
          value: uid,
        },
      ],
    },
    { type: "divider" },
  ];

  if (activeTimer) {
    const elapsedMin = Math.max(
      0,
      Math.round((Date.now() - new Date(activeTimer.startedAt).getTime()) / 60_000),
    );
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⏱️ *Chrono en cours* sur \`${activeTimer.todoId}\` — *${elapsedMin} min* écoulées`,
      },
      accessory: {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "⏹️ Arrêter" },
        action_id: "wroket_stop_timer",
        value: uid,
      },
    });
    blocks.push({ type: "divider" });
  }

  const pendingAssigned = assigned
    .filter((t) => t.status === "active" && t.assignmentStatus === "pending")
    .slice(0, 5);
  if (pendingAssigned.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📥 Assignations en attente (${pendingAssigned.length})*`,
      },
    });
    for (const t of pendingAssigned) {
      const link = taskDeepLink(t.id);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${t.title}* \`${t.id}\`${link ? ` · <${link}|Ouvrir>` : ""}`,
        },
      });
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Accepter" },
            action_id: "wroket_accept",
            value: `${t.id}|${uid}`,
          },
          {
            type: "button",
            style: "danger",
            text: { type: "plain_text", text: "Refuser" },
            action_id: "wroket_decline",
            value: `${t.id}|${uid}`,
          },
        ],
      });
    }
    blocks.push({ type: "divider" });
  }

  const activeTasks = [...personal, ...assigned]
    .filter((t, idx, arr) => t.status === "active" && arr.findIndex((x) => x.id === t.id) === idx)
    .slice(0, 6);

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*📋 Vos tâches actives (${activeTasks.length})*`,
    },
  });

  if (activeTasks.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_Aucune tâche active pour le moment._" },
    });
  } else {
    for (const t of activeTasks) {
      const link = taskDeepLink(t.id);
      const due = t.deadline ? ` · 📅 ${t.deadline.slice(0, 10)}` : "";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${t.title}*${due}${link ? ` · <${link}|Ouvrir>` : ""}`,
        },
      });
      blocks.push({
        type: "actions",
        elements: buildTimerActionElements(t.id, uid, { includeComplete: true }),
      });
    }
  }

  blocks.push(
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: myWeekText.slice(0, 2900),
      },
    },
  );

  return publishSlackAppHome({
    accessToken: token,
    slackUserId: opts.slackUserId,
    blocks,
  });
}
