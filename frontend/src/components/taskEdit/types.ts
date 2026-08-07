import type {
  Todo,
  Priority,
  Effort,
  AuthMeResponse,
  Recurrence,
  Project,
  ProjectCustomFieldDef,
  SuggestedSlot,
} from "@/lib/api";

export type TaskEditZone = "essentials" | "planning" | "collab" | "advanced";

export interface TaskEditModalProps {
  todo: Todo | null;
  form: {
    title: string;
    priority: Priority;
    effort: Effort;
    startDate: string;
    deadline: string;
    assignedTo: string | null;
    estimatedMinutes: number | null;
    tags: string[];
    recurrence: Recurrence | null;
    projectId: string | null;
    blockedByTodoIds?: string[];
  };
  onFormChange: (updates: Partial<TaskEditModalProps["form"]>) => void;
  /** Close the modal (parent should flush auto-save if used). */
  onClose: () => void | Promise<void>;
  /** Tab to open when a task is first shown (V2 zones). */
  initialZone?: TaskEditZone;
  /** Incremented by parent on each open so the initial tab reapplies even for the same task. */
  openNonce?: number;
  saving: boolean;
  assignEmail: string;
  onAssignEmailChange: (email: string) => void;
  assignedUser: AuthMeResponse | null;
  assignError: string | null;
  onAssignLookup: () => void;
  onClearAssign: () => void;
  userDisplayName: (uid: string) => string;
  onOpenSubtasks?: (todo: Todo) => void;
  subtaskCount?: number;
  effortDefaults?: { light: number; medium: number; heavy: number };
  currentUserUid?: string;
  projects?: Project[];
  isTaskOwner?: boolean;
  onAcceptDecline?: (status: "accepted" | "declined") => void;
  onSuggestedSlotChange?: (slot: SuggestedSlot | null) => void;
  /** When set, add/remove tag calls the API immediately (optimistic UI, revert on error). */
  onPersistTags?: (tags: string[]) => Promise<void>;
  /** After comments are added or removed (e.g. refresh global comment counts in list views). */
  onTodoCommentsChanged?: (todoId: string) => void;
  /** Read-only preview (no edits; team dashboard when user is not owner/assignee). */
  viewOnly?: boolean;
  /** Open the meeting management modal for this task. */
  onManageMeet?: (todo: Todo) => void;
  /** When true, disable recurrence and new attachments (Free-tier task owner). */
  freeTierContentLocks?: boolean;
  /** Calendar integrations entitlement + linked account (agenda page). */
  canSyncToCalendar?: boolean;
  /** After pushing in-app slot to external calendar (refresh parent state). */
  onExternalSlotSynced?: () => void | Promise<void>;
  /** Soft-delete (archives / corbeille Wroket) — parent opens confirmation then calls delete API. */
  onRequestDeleteTask?: (todo: Todo) => void | Promise<void>;
  /** Same-project tasks for dependency picker (project views). */
  projectTasks?: Todo[];
  canUseDependencies?: boolean;
  customFieldDefs?: ProjectCustomFieldDef[];
  canUseCustomFields?: boolean;
  canUseTimeTracking?: boolean;
  onTodoUpdated?: (todo: Todo) => void;
}
