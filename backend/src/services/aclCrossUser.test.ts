/**
 * ACL regression — user B must not read / mutate user A's project committee, todos, or share links.
 * Complements assist / share / MCP unit suites (plan Secu 2026-11-14).
 */

import { describe, expect, test } from "vitest";

import { ForbiddenError } from "../utils/errors";
import {
  applyCommitteeShare,
  previewCommittee,
  previewRisks,
} from "./assistCommandsService";
import {
  authenticateApiKey,
  createApiKeyForUser,
  register,
  revokeApiKeyForUser,
  setBillingPlanForUid,
} from "./authService";
import { executeMcpTool } from "./mcp";
import {
  createProjectShareLink,
  revokeProjectShareLink,
} from "./projectShareLinkService";
import { createProject } from "./projectService";
import { canAccessTodo, createTodo, listTodos } from "./todoService";

function twoUsers(prefix: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const a = register({
    email: `${prefix}-a-${stamp}@test.local`,
    password: "password123",
  });
  const b = register({
    email: `${prefix}-b-${stamp}@test.local`,
    password: "password123",
  });
  setBillingPlanForUid(a.uid, "small");
  setBillingPlanForUid(b.uid, "small");
  return { a, b };
}

describe("ACL cross-user", () => {
  test("Assist committee: stranger cannot preview or create share", async () => {
    const { a, b } = twoUsers("acl-assist");
    const project = createProject(a.uid, a.email, { name: "Secret Comité" });
    await createTodo(a.uid, a.email, {
      title: "Internal only",
      priority: "high",
      projectId: project.id,
    });

    await expect(previewCommittee(b.uid, b.email, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(() => applyCommitteeShare(b.uid, b.email, project.id)).toThrow(ForbiddenError);

    const ok = await previewCommittee(a.uid, a.email, project.id);
    expect(ok.projectId).toBe(project.id);
    expect(ok.projectName).toBe("Secret Comité");
  });

  test("Assist risks: B does not see A's private overdue titles", async () => {
    const { a, b } = twoUsers("acl-risks");
    const secretTitle = `A-SECRET-OVERDUE-${a.uid}`;
    const past = new Date();
    past.setDate(past.getDate() - 5);
    await createTodo(a.uid, a.email, {
      title: secretTitle,
      priority: "high",
      deadline: past.toISOString().slice(0, 10),
      allowPastDeadline: true,
    });

    const previewB = await previewRisks(b.uid, b.email);
    const blob = JSON.stringify(previewB);
    expect(blob).not.toContain(secretTitle);
    expect(previewB.overdueTasks.every((t) => !t.title.includes(a.uid))).toBe(true);
  });

  test("Project share: stranger cannot create or revoke", () => {
    const { a, b } = twoUsers("acl-share");
    const project = createProject(a.uid, a.email, { name: "Share ACL" });
    const link = createProjectShareLink(a.uid, a.email, project.id, { expiryDays: 7 });

    expect(() =>
      createProjectShareLink(b.uid, b.email, project.id, { expiryDays: 7 }),
    ).toThrow(ForbiddenError);
    expect(() => revokeProjectShareLink(b.uid, b.email, project.id, link.id)).toThrow(
      ForbiddenError,
    );

    const revoked = revokeProjectShareLink(a.uid, a.email, project.id, link.id);
    expect(revoked.revokedAt).toBeTruthy();
  });

  test("canAccessTodo: project todo denied for non-member", async () => {
    const { a, b } = twoUsers("acl-todo");
    const project = createProject(a.uid, a.email, { name: "Todo ACL" });
    const todo = await createTodo(a.uid, a.email, {
      title: "Only A",
      priority: "medium",
      projectId: project.id,
    });

    expect(await canAccessTodo(a.uid, a.email, todo.id)).toBe(true);
    expect(await canAccessTodo(b.uid, b.email, todo.id)).toBe(false);

    const bTodos = await listTodos(b.uid);
    expect(bTodos.some((t) => t.id === todo.id)).toBe(false);
  });

  test("MCP: revoked key is null; B scopes cannot list A's project todos", async () => {
    const { a, b } = twoUsers("acl-mcp");
    const project = createProject(a.uid, a.email, { name: "MCP ACL" });
    const todo = await createTodo(a.uid, a.email, {
      title: "MCP-A-ONLY",
      priority: "low",
      projectId: project.id,
    });

    const keyA = createApiKeyForUser(a.uid, "A agent");
    const keyB = createApiKeyForUser(b.uid, "B agent");

    revokeApiKeyForUser(a.uid, keyA.id);
    expect(authenticateApiKey(`Bearer ${keyA.key}`)).toBeNull();

    const authB = authenticateApiKey(`Bearer ${keyB.key}`);
    expect(authB).not.toBeNull();
    expect(authB!.scopes).toEqual(expect.arrayContaining(["todos:read", "projects:read"]));

    const listed = (await executeMcpTool(authB!.user, authB!.scopes, "list_todos", {
      projectId: project.id,
      limit: 50,
    })) as { todos: { id: string; title: string }[]; total: number };

    expect(listed.todos.some((t) => t.id === todo.id)).toBe(false);
    expect(listed.todos.some((t) => t.title === "MCP-A-ONLY")).toBe(false);
  });
});
