/**
 * Shared external-source identity attached to Wroket entities (Todo, Project,
 * ProjectPhase) that originate from or are mirrored against an external app.
 *
 * This module is a dependency-free leaf so it can be imported by entity
 * services (todoService, projectService) and by externalSyncService without
 * creating import cycles.
 */

export type ExternalProvider = "notion" | "monday";

export interface ExternalRef {
  /** External application the entity is mirrored from. */
  provider: ExternalProvider;
  /** Stable id of the external object (Notion page id, Monday item id, ...). */
  externalId: string;
  /** Connection that produced this ref (links entity -> credentials/owner). */
  connectionId?: string;
  /** External container id (Notion database id, Monday board id). */
  externalParentId?: string;
  /** ISO timestamp of the last successful pull from the source. */
  lastSyncedAt?: string;
}

const PROVIDERS: readonly ExternalProvider[] = ["notion", "monday"];

/** Type guard + sanitizer for persisted/incoming externalRef payloads. */
export function normalizeExternalRef(value: unknown): ExternalRef | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const provider = v.provider;
  const externalId = v.externalId;
  if (typeof provider !== "string" || !PROVIDERS.includes(provider as ExternalProvider)) {
    return null;
  }
  if (typeof externalId !== "string" || externalId.length === 0) return null;
  const ref: ExternalRef = {
    provider: provider as ExternalProvider,
    externalId,
  };
  if (typeof v.connectionId === "string" && v.connectionId.length > 0) {
    ref.connectionId = v.connectionId;
  }
  if (typeof v.externalParentId === "string" && v.externalParentId.length > 0) {
    ref.externalParentId = v.externalParentId;
  }
  if (typeof v.lastSyncedAt === "string" && v.lastSyncedAt.length > 0) {
    ref.lastSyncedAt = v.lastSyncedAt;
  }
  return ref;
}

/** Composite key used to dedupe an external object within a provider. */
export function externalRefKey(provider: ExternalProvider, externalId: string): string {
  return `${provider}:${externalId}`;
}
