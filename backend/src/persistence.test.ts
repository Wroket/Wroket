import { describe, expect, it, beforeEach } from "vitest";
import {
  _applyDomainSnapshot,
  _applyTodoShardSnapshot,
  _getStoreForTest,
  _resetStoreForTest,
  todoShardIndex,
} from "./persistence";

beforeEach(() => {
  _resetStoreForTest({});
});

describe("_applyDomainSnapshot", () => {
  it("sets the domain data in cachedStore", () => {
    const notes = { user1: { note1: { title: "Hello" } } };
    _applyDomainSnapshot("notes", notes);
    const store = _getStoreForTest();
    expect((store as Record<string, unknown>).notes).toEqual(notes);
  });

  it("replaces existing domain data entirely", () => {
    _resetStoreForTest({ notes: { user1: { old: { title: "Old" } } } as unknown as Record<string, Record<string, unknown>> });
    const fresh = { user1: { new: { title: "New" } } };
    _applyDomainSnapshot("notes", fresh);
    expect((_getStoreForTest() as Record<string, unknown>).notes).toEqual(fresh);
  });

  it("accepts undefined data (empty doc)", () => {
    _resetStoreForTest({ notes: { user1: {} } as unknown as Record<string, Record<string, unknown>> });
    _applyDomainSnapshot("notes", undefined);
    expect((_getStoreForTest() as Record<string, unknown>).notes).toBeUndefined();
  });

  it("does not affect unrelated domains", () => {
    _resetStoreForTest({ projects: { p1: {} } as unknown as Record<string, unknown> });
    _applyDomainSnapshot("notes", { user1: {} });
    expect((_getStoreForTest() as Record<string, unknown>).projects).toEqual({ p1: {} });
  });
});

describe("_applyTodoShardSnapshot", () => {
  it("inserts user buckets belonging to the shard", () => {
    const userId = "test-user-for-shard";
    const shardIndex = todoShardIndex(userId);
    const shardId = `todos_${shardIndex}`;
    const todos = { [userId]: { todo1: { title: "Task" } } };

    _applyTodoShardSnapshot(shardId, shardIndex, todos);

    const store = _getStoreForTest();
    expect(store.todos?.[userId]).toEqual({ todo1: { title: "Task" } });
  });

  it("does not touch buckets from other shards", () => {
    const userId = "test-user-for-shard";
    const shardIndex = todoShardIndex(userId);
    const otherUserId = "another-user-keep-me";
    const otherShard = (shardIndex + 1) % 128;

    _resetStoreForTest({
      todos: { [otherUserId]: { todo99: { title: "Keep me" } } } as unknown as Record<string, Record<string, unknown>>,
    });

    _applyTodoShardSnapshot(`todos_${shardIndex}`, shardIndex, { [userId]: {} });

    const store = _getStoreForTest();
    expect(store.todos?.[otherUserId]).toEqual({ todo99: { title: "Keep me" } });
    void otherShard; // used above only for conceptual clarity
  });

  it("removes user buckets that disappeared from the shard (deleted user)", () => {
    const userId = "test-user-for-shard";
    const shardIndex = todoShardIndex(userId);
    const shardId = `todos_${shardIndex}`;

    _resetStoreForTest({ todos: { [userId]: { todo1: {} } } as unknown as Record<string, Record<string, unknown>> });

    // Snapshot arrives with this shard now empty (user deleted all todos)
    _applyTodoShardSnapshot(shardId, shardIndex, {});

    const store = _getStoreForTest();
    expect(store.todos?.[userId]).toBeUndefined();
  });

  it("is a no-op when data is null or undefined", () => {
    _resetStoreForTest({ todos: { u1: { t1: {} } } as unknown as Record<string, Record<string, unknown>> });
    _applyTodoShardSnapshot("todos_0", 0, null);
    expect(_getStoreForTest().todos?.["u1"]).toEqual({ t1: {} });
  });

  it("initialises cachedStore.todos when not yet set", () => {
    const userId = "test-user-for-shard";
    const shardIndex = todoShardIndex(userId);
    _resetStoreForTest({});
    _applyTodoShardSnapshot(`todos_${shardIndex}`, shardIndex, { [userId]: { t1: {} } });
    expect(_getStoreForTest().todos?.[userId]).toEqual({ t1: {} });
  });
});
