/**
 * Normalize Google Chat inbound payloads.
 *
 * Workspace add-on apps (default since mid-2025) send add-on event objects
 * (`commonEventObject` + `chat.*Payload`) and expect `DataActions` responses.
 * Classic Chat apps send flat `{ type, message, space }` and expect `{ text }`.
 *
 * @see https://developers.google.com/workspace/chat/receive-respond-interactions
 */

export type NormalizedChatEventKind =
  | "url_verification"
  | "added_to_space"
  | "removed_from_space"
  | "message"
  | "card_clicked"
  | "unknown";

export interface NormalizedChatEvent {
  kind: NormalizedChatEventKind;
  /** True when the request uses Workspace add-on envelope. */
  isAddOn: boolean;
  email: string | null;
  spaceName: string | null;
  spaceDisplayName: string | null;
  messageText: string | null;
  /** Classic / cards v2 action bag (method name + parameters). */
  actionParams: Record<string, unknown> | null;
  /** OIDC ID token from add-on body (fallback when Authorization header missing). */
  systemIdToken: string | null;
}

type Loose = Record<string, unknown>;

function asObj(v: unknown): Loose | null {
  return v && typeof v === "object" ? (v as Loose) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function emailFromUser(user: unknown): string | null {
  const u = asObj(user);
  return str(u?.email) || str(u?.userEmail) || null;
}

function extractActionParams(action: Loose | null): Record<string, unknown> | null {
  if (!action) return null;
  const paramsObj: Record<string, unknown> = {
    actionMethodName: str(action.actionMethodName) ?? undefined,
  };
  const parameters = action.parameters;
  if (Array.isArray(parameters)) {
    for (const p of parameters) {
      const row = asObj(p);
      if (row && typeof row.key === "string") {
        paramsObj[row.key] = row.value;
      }
    }
  }
  const commonParams = asObj(action.parameters);
  if (commonParams && !Array.isArray(parameters)) {
    Object.assign(paramsObj, commonParams);
  }
  return paramsObj;
}

/**
 * Detect add-on envelope and flatten to a single event shape the controller can switch on.
 */
export function normalizeGoogleChatEvent(body: unknown): NormalizedChatEvent {
  const root = asObj(body) ?? {};
  const systemIdToken =
    str(asObj(root.authorizationEventObject)?.systemIdToken) ||
    str(asObj(root.authorizationEventObject)?.userIdToken) ||
    null;

  const chat = asObj(root.chat);
  const common = asObj(root.commonEventObject);
  const isAddOn = Boolean(
    chat ||
      (common && str(common.hostApp)?.toUpperCase() === "CHAT") ||
      root.authorizationEventObject,
  );

  if (str(root.type) === "URL_VERIFICATION") {
    return {
      kind: "url_verification",
      isAddOn: false,
      email: null,
      spaceName: null,
      spaceDisplayName: null,
      messageText: null,
      actionParams: null,
      systemIdToken,
    };
  }

  // --- Workspace add-on payloads ---
  if (chat) {
    const userEmail =
      emailFromUser(chat.user) ||
      emailFromUser(asObj(chat.messagePayload)?.user) ||
      emailFromUser(asObj(chat.addedToSpacePayload)?.user) ||
      emailFromUser(asObj(chat.buttonClickedPayload)?.user) ||
      emailFromUser(asObj(chat.appCommandPayload)?.user) ||
      null;

    const messagePayload = asObj(chat.messagePayload);
    if (messagePayload) {
      const space = asObj(messagePayload.space) || asObj(chat.space);
      const message = asObj(messagePayload.message);
      return {
        kind: "message",
        isAddOn: true,
        email:
          userEmail ||
          emailFromUser(message?.sender) ||
          emailFromUser(asObj(message?.sender)?.user) ||
          null,
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: str(message?.text) || str(message?.argumentText),
        actionParams: null,
        systemIdToken,
      };
    }

    const added = asObj(chat.addedToSpacePayload);
    if (added) {
      const space = asObj(added.space) || asObj(chat.space);
      return {
        kind: "added_to_space",
        isAddOn: true,
        email: userEmail,
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: null,
        actionParams: null,
        systemIdToken,
      };
    }

    if (asObj(chat.removedFromSpacePayload)) {
      return {
        kind: "removed_from_space",
        isAddOn: true,
        email: userEmail,
        spaceName: str(asObj(chat.space)?.name),
        spaceDisplayName: null,
        messageText: null,
        actionParams: null,
        systemIdToken,
      };
    }

    const button = asObj(chat.buttonClickedPayload);
    if (button) {
      const space = asObj(button.space) || asObj(chat.space);
      const commonParams = asObj(common?.parameters);
      const actionParams: Record<string, unknown> = {
        ...(commonParams ?? {}),
        actionMethodName:
          str(commonParams?.actionMethodName) ||
          str(asObj(button.action)?.actionMethodName) ||
          undefined,
      };
      return {
        kind: "card_clicked",
        isAddOn: true,
        email: userEmail || emailFromUser(asObj(button.message)?.sender),
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: null,
        actionParams,
        systemIdToken,
      };
    }

    const appCommand = asObj(chat.appCommandPayload);
    if (appCommand) {
      const space = asObj(appCommand.space) || asObj(chat.space);
      const message = asObj(appCommand.message);
      const meta = asObj(appCommand.appCommandMetadata);
      const cmdText =
        str(message?.text) ||
        str(message?.argumentText) ||
        str(meta?.commandName) ||
        null;
      return {
        kind: "message",
        isAddOn: true,
        email: userEmail || emailFromUser(message?.sender),
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: cmdText,
        actionParams: null,
        systemIdToken,
      };
    }

    // Some add-on deployments nest classic fields under `chat`.
    const nestedType = str(chat.type)?.toUpperCase();
    if (nestedType === "MESSAGE" || asObj(chat.message)) {
      const space = asObj(chat.space);
      const message = asObj(chat.message);
      return {
        kind: "message",
        isAddOn: true,
        email: userEmail || emailFromUser(chat.user) || emailFromUser(message?.sender),
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: str(message?.text) || str(message?.argumentText),
        actionParams: null,
        systemIdToken,
      };
    }
    if (nestedType === "ADDED_TO_SPACE") {
      const space = asObj(chat.space);
      return {
        kind: "added_to_space",
        isAddOn: true,
        email: userEmail || emailFromUser(chat.user),
        spaceName: str(space?.name),
        spaceDisplayName: str(space?.displayName) || str(space?.name),
        messageText: null,
        actionParams: null,
        systemIdToken,
      };
    }
    if (nestedType === "CARD_CLICKED" || asObj(chat.action)) {
      return {
        kind: "card_clicked",
        isAddOn: true,
        email: userEmail || emailFromUser(chat.user),
        spaceName: str(asObj(chat.space)?.name),
        spaceDisplayName: str(asObj(chat.space)?.displayName),
        messageText: null,
        actionParams: extractActionParams(asObj(chat.action)),
        systemIdToken,
      };
    }
  }

  // --- Classic Chat API interaction events ---
  const classicType = str(root.type)?.toUpperCase();
  const classicSpace = asObj(root.space);
  const classicMessage = asObj(root.message);
  const classicEmail =
    emailFromUser(root.user) ||
    emailFromUser(asObj(root.common)?.user) ||
    emailFromUser(classicMessage?.sender) ||
    null;

  if (classicType === "ADDED_TO_SPACE") {
    return {
      kind: "added_to_space",
      isAddOn: false,
      email: classicEmail,
      spaceName: str(classicSpace?.name),
      spaceDisplayName: str(classicSpace?.displayName) || str(classicSpace?.name),
      messageText: null,
      actionParams: null,
      systemIdToken,
    };
  }
  if (classicType === "REMOVED_FROM_SPACE") {
    return {
      kind: "removed_from_space",
      isAddOn: false,
      email: classicEmail,
      spaceName: str(classicSpace?.name),
      spaceDisplayName: null,
      messageText: null,
      actionParams: null,
      systemIdToken,
    };
  }
  if (classicType === "CARD_CLICKED" || asObj(root.action)) {
    return {
      kind: "card_clicked",
      isAddOn: false,
      email: classicEmail,
      spaceName: str(classicSpace?.name),
      spaceDisplayName: str(classicSpace?.displayName),
      messageText: null,
      actionParams: extractActionParams(asObj(root.action)),
      systemIdToken,
    };
  }
  if (classicType === "MESSAGE" || classicMessage?.text || classicMessage?.argumentText) {
    return {
      kind: "message",
      isAddOn: false,
      email: classicEmail,
      spaceName: str(classicSpace?.name),
      spaceDisplayName: str(classicSpace?.displayName),
      messageText: str(classicMessage?.text) || str(classicMessage?.argumentText),
      actionParams: null,
      systemIdToken,
    };
  }

  return {
    kind: "unknown",
    isAddOn,
    email: classicEmail,
    spaceName: str(classicSpace?.name),
    spaceDisplayName: str(classicSpace?.displayName),
    messageText: null,
    actionParams: null,
    systemIdToken,
  };
}

/**
 * Build a synchronous reply JSON matching the inbound event style.
 */
export function buildGoogleChatTextReply(opts: {
  isAddOn: boolean;
  text: string;
}): Record<string, unknown> {
  const text = opts.text || "";
  if (opts.isAddOn) {
    return {
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: {
            message: { text },
          },
        },
      },
    };
  }
  return { text };
}
