/**
 * Shared chat-channel adapter types (Slack / Teams / Google Chat / Discord).
 */

export type ChatTaskAction = "accept" | "decline" | "complete";

export type ChatIdentityResult =
  | { uid: string; email: string }
  | { error: string };

export type ChatActionResult =
  | { ok: true; message: string; todoTitle: string }
  | { ok: false; message: string };

/**
 * Pragmatic adapter surface for outbound + inbound verification.
 * Each platform implements what it needs; unused methods may throw or no-op.
 */
export interface ChatChannelAdapter {
  /** Post a channel/conversation message (bot token / Graph / Chat API). */
  postMessage(opts: {
    conversationId: string;
    text: string;
    rich?: unknown;
  }): Promise<void>;

  /** Post an ephemeral / private reply when the platform supports it. */
  postEphemeral(opts: {
    conversationId: string;
    userId: string;
    text: string;
  }): Promise<void>;

  /** Verify inbound HTTP signature / JWT. Returns false when invalid. */
  verifyRequest(opts: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string | Buffer;
  }): boolean | Promise<boolean>;

  /**
   * Parse inbound interaction into a normalized action, or null if ignored.
   * Platforms differ (Block Kit, Adaptive Cards, Chat cards, Discord components).
   */
  parseInteraction(raw: unknown): {
    kind: "task_action" | "slash" | "ignored";
    action?: ChatTaskAction;
    todoId?: string;
    targetUid?: string;
    actorExternalId?: string;
    text?: string;
    teamOrTenantId?: string;
  } | null;
}

/** Shared action_id / custom_id / submit verb prefixes. */
export const CHAT_ACTION_IDS = {
  accept: "wroket_accept",
  decline: "wroket_decline",
  complete: "wroket_complete",
} as const;
