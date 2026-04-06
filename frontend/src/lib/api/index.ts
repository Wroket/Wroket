export type {
  WorkingHours,
  ScheduledSlot,
  SuggestedSlot,
  SlotProposal,
  GoogleCalendarEntry,
  GoogleAccountPublic,
  AuthMeResponse,
  ActivityLogEntry,
} from "./core";

export {
  login,
  register,
  verifyEmailApi,
  resendVerificationApi,
  forgotPasswordApi,
  resetPasswordApi,
  getGoogleSsoUrl,
  shareInviteApi,
  getMe,
  updateProfile,
  logout,
  changePassword,
  getMyExport,
  deleteMyAccount,
  getMyActivity,
  globalSearch,
  lookupUser,
  lookupUserByUid,
} from "./auth";
export type { SearchResult } from "./auth";

export {
  getTodos,
  getAssignedTodos,
  getArchivedTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
  exportTasksCsv,
  getTaskActivity,
  getComments,
  getCommentCounts,
  postCommentApi,
  editCommentApi,
  deleteCommentApi,
  toggleReactionApi,
  uploadAttachment,
  getAttachments,
  downloadAttachment,
  deleteAttachmentApi,
} from "./todos";
export type {
  Priority,
  Effort,
  TodoStatus,
  AssignmentStatus,
  RecurrenceFrequency,
  Recurrence,
  Todo,
  CreateTodoPayload,
  UpdateTodoPayload,
  Comment,
  Attachment,
} from "./todos";

export {
  getCollaborators,
  getEmailSuggestions,
  getReceivedInvitations,
  inviteCollaborator,
  resendCollaboratorInvite,
  removeCollaborator,
  acceptCollaboration,
  declineCollaboration,
  getTeams,
  createTeam,
  addTeamMember,
  removeTeamMemberApi,
  updateMemberRoleApi,
  getTeamDashboard,
  deleteTeamApi,
  getOwnedTeams,
  transferTeamOwnership,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "./teams";
export type {
  Collaborator,
  TeamMemberRole,
  TeamMember,
  Team,
  ReceivedInvitation,
  TeamDashboardData,
  NotificationType,
  AppNotification,
} from "./teams";

export {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProjectApi,
  reorderProjects,
  getProjectTodos,
  getAllProjectTodos,
  createPhase,
  updatePhaseApi,
  deletePhaseApi,
  uploadCsvPreview,
  confirmCsvImport,
} from "./projects";
export type {
  ProjectStatus,
  ProjectPhase,
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
  CreatePhasePayload,
  UpdatePhasePayload,
  ImportParsedTask,
  ImportError,
  ImportPreview,
} from "./projects";

export type { SlotConflict, BookSlotResult } from "./calendar";
export {
  getTaskSlots,
  bookTaskSlot,
  clearTaskSlot,
  getCalendarEvents,
  getGoogleAuthUrl,
  disconnectGoogleCalendar,
  getAccountCalendars,
  saveAccountCalendars,
  disconnectGoogleAccount,
} from "./calendar";
export type { CalendarEvent, CalendarEventsResponse } from "./calendar";

export {
  getNotes,
  getSharedNotes,
  getNotesByTodo,
  getTodoNoteMap,
  createNoteApi,
  updateNoteApi,
  deleteNoteApi,
  syncNotesApi,
  exportNotesMarkdown,
} from "./notes";
export type { Note } from "./notes";

export {
  getWebhooks,
  saveWebhook,
  deleteWebhookApi,
  testWebhookApi,
} from "./webhooks";
export type {
  WebhookEvent,
  WebhookPlatform,
  WebhookConfig,
} from "./webhooks";

export {
  getAdminStats,
  getAdminUsers,
  getAdminInvites,
  getAdminActivity,
  getAdminSessions,
  getAdminIntegrations,
  getAdminUserExport,
  deleteAdminUser,
  getAdminCompletionRates,
} from "./admin";
export type {
  AdminStats,
  AdminUser,
  InviteLogEntry,
  SessionInfo,
  IntegrationOverview,
  CompletionRate,
} from "./admin";
