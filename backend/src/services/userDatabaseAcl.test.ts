/**
 * Bases ACL — stranger cannot read/write; direct RO vs RW; owner-only meta.
 */

import { describe, expect, test } from "vitest";

import { ForbiddenError, NotFoundError } from "../utils/errors";
import { register, setBillingPlanForUid } from "./authService";
import {
  createUserDatabase,
  createDatabaseRowAsUser,
  updateDatabaseRowAsUser,
  updateUserDatabase,
  resolveDatabaseAccess,
  listSharedUserDatabases,
  requireDatabaseAccess,
} from "./userDatabaseService";

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

describe("userDatabase ACL", () => {
  test("stranger cannot resolve access", () => {
    const { a, b } = twoUsers("db-acl");
    const db = createUserDatabase(a.uid, {
      name: "Secret",
      columns: [{ id: "c1", name: "Title", type: "text" }],
    });
    expect(resolveDatabaseAccess(b.uid, b.email, db.id)).toBeNull();
    expect(() => requireDatabaseAccess(b.uid, b.email, db.id)).toThrow(NotFoundError);
  });

  test("direct share RO can read but not write rows; RW can write", () => {
    const { a, b } = twoUsers("db-share");
    const db = createUserDatabase(a.uid, {
      name: "Shared DB",
      columns: [{ id: "c1", name: "Title", type: "text" }],
    });
    updateUserDatabase(a.uid, db.id, { sharedWithEmail: b.email, collaboratorWrite: false });

    const shared = listSharedUserDatabases(b.uid, b.email);
    expect(shared.some((d) => d.id === db.id)).toBe(true);

    const ro = requireDatabaseAccess(b.uid, b.email, db.id);
    expect(ro.canWrite).toBe(false);
    expect(() => createDatabaseRowAsUser(b.uid, b.email, db.id, { c1: "x" })).toThrow(
      ForbiddenError,
    );

    updateUserDatabase(a.uid, db.id, { collaboratorWrite: true });
    const rw = requireDatabaseAccess(b.uid, b.email, db.id);
    expect(rw.canWrite).toBe(true);
    const row = createDatabaseRowAsUser(b.uid, b.email, db.id, { c1: "hello" });
    expect(row.values.c1).toBe("hello");
    const updated = updateDatabaseRowAsUser(b.uid, b.email, db.id, row.id, { c1: "world" });
    expect(updated.values.c1).toBe("world");
  });

  test("collaborator cannot change columns (owner-only meta)", () => {
    const { a, b } = twoUsers("db-meta");
    const db = createUserDatabase(a.uid, {
      name: "Meta",
      columns: [{ id: "c1", name: "Title", type: "text" }],
    });
    updateUserDatabase(a.uid, db.id, { sharedWithEmail: b.email, collaboratorWrite: true });
    expect(() =>
      requireDatabaseAccess(b.uid, b.email, db.id, { ownerOnly: true }),
    ).toThrow(ForbiddenError);
  });
});
