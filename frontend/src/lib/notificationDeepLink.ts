/** Deep-link for in-app / push notifications (mirrors backend notifOpenUrl). */
export interface NotifDeepLinkInput {
  type: string;
  data?: Record<string, string>;
}

export function notificationOpenHref(notif: NotifDeepLinkInput): string {
  if (notif.type === "note_mention") {
    if (notif.data?.noteAccessible === "false") return "/notes";
    return notif.data?.noteId ? `/notes?id=${encodeURIComponent(notif.data.noteId)}` : "/notes";
  }

  const taskId = notif.data?.todoId;
  const taskDeepTypes = [
    "task_assigned",
    "task_completed",
    "task_cancelled",
    "task_declined",
    "task_accepted",
    "comment_mention",
    "deadline_approaching",
    "deadline_today",
  ];
  if (taskId && taskDeepTypes.includes(notif.type)) {
    return `/todos?task=${encodeURIComponent(taskId)}`;
  }

  const taskListTypes = [
    "task_assigned",
    "task_completed",
    "task_cancelled",
    "task_declined",
    "task_accepted",
  ];
  if (taskListTypes.includes(notif.type)) return "/todos";

  if (notif.type === "team_invite") return "/teams";
  if (notif.type === "project_deleted") return "/projects";

  return "/notifications";
}
