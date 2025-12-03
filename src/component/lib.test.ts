/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("timeline component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("push creates scope and stores state", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });

    const current = await t.query(api.lib.getCurrent, { scope });
    expect(current).toEqual({ value: "A" });

    const status = await t.query(api.lib.getStatus, { scope });
    expect(status.position).toBe(1);
    expect(status.length).toBe(1);
    expect(status.canUndo).toBe(true);
    expect(status.canRedo).toBe(false);
  });

  test("undo moves head backward", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });
    await t.mutation(api.lib.push, { scope, document: { value: "B" } });
    await t.mutation(api.lib.push, { scope, document: { value: "C" } });

    const statusBefore = await t.query(api.lib.getStatus, { scope });
    expect(statusBefore.position).toBe(3);

    const undoneState = await t.mutation(api.lib.undo, { scope });
    expect(undoneState).toEqual({ value: "B" });

    const statusAfter = await t.query(api.lib.getStatus, { scope });
    expect(statusAfter.position).toBe(2);
    expect(statusAfter.canUndo).toBe(true);
    expect(statusAfter.canRedo).toBe(true);
  });

  test("undo to position 0 returns null", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });

    const undoneState = await t.mutation(api.lib.undo, { scope });
    expect(undoneState).toBeNull();

    const status = await t.query(api.lib.getStatus, { scope });
    expect(status.position).toBe(0);
    expect(status.canUndo).toBe(false);
    expect(status.canRedo).toBe(true);
  });

  test("redo moves head forward", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });
    await t.mutation(api.lib.push, { scope, document: { value: "B" } });
    await t.mutation(api.lib.undo, { scope });

    const redoneState = await t.mutation(api.lib.redo, { scope });
    expect(redoneState).toEqual({ value: "B" });

    const status = await t.query(api.lib.getStatus, { scope });
    expect(status.position).toBe(2);
    expect(status.canRedo).toBe(false);
  });

  test("push after undo prunes nodes ahead of head", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });
    await t.mutation(api.lib.push, { scope, document: { value: "B" } });
    await t.mutation(api.lib.push, { scope, document: { value: "C" } });

    await t.mutation(api.lib.undo, { scope });
    const statusAfterUndo = await t.query(api.lib.getStatus, { scope });
    expect(statusAfterUndo.position).toBe(2);

    await t.mutation(api.lib.push, { scope, document: { value: "D" } });

    const statusAfterPush = await t.query(api.lib.getStatus, { scope });
    expect(statusAfterPush.position).toBe(3);
    expect(statusAfterPush.length).toBe(3); // A, B, D (C was pruned)
    expect(statusAfterPush.canRedo).toBe(false);

    const current = await t.query(api.lib.getCurrent, { scope });
    expect(current).toEqual({ value: "D" });
  });

  test("multi-step undo and redo", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" } });
    await t.mutation(api.lib.push, { scope, document: { value: "B" } });
    await t.mutation(api.lib.push, { scope, document: { value: "C" } });
    await t.mutation(api.lib.push, { scope, document: { value: "D" } });

    const afterUndo = await t.mutation(api.lib.undo, { scope, count: 2 });
    expect(afterUndo).toEqual({ value: "B" });

    const afterRedo = await t.mutation(api.lib.redo, { scope, count: 2 });
    expect(afterRedo).toEqual({ value: "D" });
  });

  test("maxNodes prunes oldest nodes", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, {
      scope,
      document: { value: "A" },
      maxNodes: 3,
    });
    await t.mutation(api.lib.push, {
      scope,
      document: { value: "B" },
      maxNodes: 3,
    });
    await t.mutation(api.lib.push, {
      scope,
      document: { value: "C" },
      maxNodes: 3,
    });
    await t.mutation(api.lib.push, {
      scope,
      document: { value: "D" },
      maxNodes: 3,
    });

    const status = await t.query(api.lib.getStatus, { scope });
    expect(status.length).toBe(3);
  });

  describe("checkpoints", () => {
    test("checkpoint saves current state", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });

      const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
      expect(checkpoints).toEqual(["v1"]);
    });

    test("restoreCheckpoint pushes checkpoint state as new node", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "v1",
      });
      expect(restored).toEqual({ value: "B" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(4);
      expect(status.length).toBe(4);

      const undone = await t.mutation(api.lib.undo, { scope });
      expect(undone).toEqual({ value: "C" });
    });

    test("checkpoint persists through pruning", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "at-C" });

      await t.mutation(api.lib.undo, { scope });
      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
      expect(checkpoints).toEqual(["at-C"]);

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "at-C",
      });
      expect(restored).toEqual({ value: "C" });
    });

    test("deleteCheckpoint removes checkpoint", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });
      await t.mutation(api.lib.deleteCheckpoint, { scope, name: "v1" });

      const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
      expect(checkpoints).toEqual([]);
    });

    test("checkpoint at position 0 throws error", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.undo, { scope });

      await expect(
        t.mutation(api.lib.checkpoint, { scope, name: "v1" }),
      ).rejects.toThrow("Cannot checkpoint at position 0");
    });

    test("updating existing checkpoint overwrites", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "v1",
      });
      expect(restored).toEqual({ value: "B" });
    });
  });

  describe("clear mutation", () => {
    // Property: clear resets timeline to empty state regardless of initial state
    test("clear resets timeline to empty state", async () => {
      for (let i = 0; i < 20; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        const numPushes = Math.floor(Math.random() * 10) + 1;
        for (let j = 0; j < numPushes; j++) {
          await t.mutation(api.lib.push, {
            scope,
            document: { value: `state-${j}` },
          });
        }

        const numUndos = Math.floor(Math.random() * (numPushes + 1));
        if (numUndos > 0) {
          await t.mutation(api.lib.undo, { scope, count: numUndos });
        }

        await t.mutation(api.lib.clear, { scope });

        const status = await t.query(api.lib.getStatus, { scope });
        expect(status.length).toBe(0);
        expect(status.position).toBe(0);
        expect(status.canUndo).toBe(false);
        expect(status.canRedo).toBe(false);
      }
    });

    // Property: clear preserves checkpoints
    test("clear preserves checkpoints", async () => {
      for (let i = 0; i < 20; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        const numPushes = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < numPushes; j++) {
          await t.mutation(api.lib.push, {
            scope,
            document: { value: `state-${j}` },
          });
        }

        const numCheckpoints = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < numCheckpoints; j++) {
          await t.mutation(api.lib.checkpoint, {
            scope,
            name: `checkpoint-${j}`,
          });
        }

        const checkpointsBefore = await t.query(api.lib.getCheckpoints, {
          scope,
        });
        await t.mutation(api.lib.clear, { scope });
        const checkpointsAfter = await t.query(api.lib.getCheckpoints, {
          scope,
        });

        expect(checkpointsAfter.sort()).toEqual(checkpointsBefore.sort());
      }
    });

    test("clear on non-existent scope returns without error", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.clear, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("clear followed by push works correctly", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.clear, { scope });

      const statusAfterClear = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterClear.length).toBe(0);
      expect(statusAfterClear.position).toBe(0);

      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.length).toBe(1);
      expect(statusAfterPush.position).toBe(1);

      const current = await t.query(api.lib.getCurrent, { scope });
      expect(current).toEqual({ value: "C" });
    });
  });

  describe("getCheckpoint query", () => {
    // Property: checkpoint data round-trips correctly
    test("checkpoint data round-trip", async () => {
      for (let i = 0; i < 20; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        const document = {
          id: Math.random().toString(36).substring(7),
          value: Math.floor(Math.random() * 1000),
          nested: { data: `nested-${Math.random().toString(36).substring(7)}` },
        };

        await t.mutation(api.lib.push, { scope, document });

        const checkpointName = `checkpoint-${Math.random().toString(36).substring(7)}`;
        await t.mutation(api.lib.checkpoint, { scope, name: checkpointName });

        const retrieved = await t.query(api.lib.getCheckpoint, {
          scope,
          name: checkpointName,
        });
        expect(retrieved).toEqual(document);
      }
    });

    test("getCheckpoint returns null for non-existent checkpoint", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.query(api.lib.getCheckpoint, {
        scope,
        name: "non-existent",
      });
      expect(result).toBeNull();
    });

    test("getCheckpoint returns null for non-existent scope", async () => {
      const t = initConvexTest();

      const result = await t.query(api.lib.getCheckpoint, {
        scope: "non-existent",
        name: "any-checkpoint",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteScope mutation", () => {
    // Property: deleteScope removes all scope data (nodes, checkpoints, scope record)
    test("deleteScope removes all scope data", async () => {
      for (let i = 0; i < 20; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        const numPushes = Math.floor(Math.random() * 10) + 1;
        for (let j = 0; j < numPushes; j++) {
          await t.mutation(api.lib.push, {
            scope,
            document: { value: `state-${j}` },
          });
        }

        const numCheckpoints = Math.floor(Math.random() * 4);
        for (let j = 0; j < numCheckpoints; j++) {
          await t.mutation(api.lib.checkpoint, {
            scope,
            name: `checkpoint-${j}`,
          });
        }

        const numUndos = Math.floor(Math.random() * numPushes);
        if (numUndos > 0) {
          await t.mutation(api.lib.undo, { scope, count: numUndos });
        }

        await t.mutation(api.lib.deleteScope, { scope });

        const status = await t.query(api.lib.getStatus, { scope });
        expect(status.position).toBe(0);
        expect(status.length).toBe(0);
        expect(status.canUndo).toBe(false);
        expect(status.canRedo).toBe(false);

        const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
        expect(checkpoints).toEqual([]);

        const current = await t.query(api.lib.getCurrent, { scope });
        expect(current).toBeNull();
      }
    });

    test("deleteScope on non-existent scope returns without error", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.deleteScope, {
        scope: "non-existent",
      });
      expect(result).toBeNull();
    });

    test("operations after deleteScope work correctly", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });

      await t.mutation(api.lib.deleteScope, { scope });

      const statusAfterDelete = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterDelete.length).toBe(0);
      expect(statusAfterDelete.position).toBe(0);

      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.length).toBe(1);
      expect(statusAfterPush.position).toBe(1);

      const current = await t.query(api.lib.getCurrent, { scope });
      expect(current).toEqual({ value: "C" });

      const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
      expect(checkpoints).toEqual([]);
    });
  });

  describe("getAtPosition query", () => {
    // Property: getAtPosition returns correct document without moving head
    test("getAtPosition returns correct document without side effects", async () => {
      for (let i = 0; i < 20; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        const numPushes = Math.floor(Math.random() * 10) + 1;
        const documents: Array<{ value: string; index: number }> = [];

        for (let j = 0; j < numPushes; j++) {
          const doc = { value: `state-${j}`, index: j };
          documents.push(doc);
          await t.mutation(api.lib.push, { scope, document: doc });
        }

        const numUndos = Math.floor(Math.random() * numPushes);
        if (numUndos > 0) {
          await t.mutation(api.lib.undo, { scope, count: numUndos });
        }

        const statusBefore = await t.query(api.lib.getStatus, { scope });
        const position = Math.floor(Math.random() * numPushes) + 1;

        const retrieved = await t.query(api.lib.getAtPosition, {
          scope,
          position,
        });
        expect(retrieved).toEqual(documents[position - 1]);

        const statusAfter = await t.query(api.lib.getStatus, { scope });
        expect(statusAfter.position).toBe(statusBefore.position);
      }
    });

    test("getAtPosition returns null for position 0", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.query(api.lib.getAtPosition, {
        scope,
        position: 0,
      });
      expect(result).toBeNull();
    });

    test("getAtPosition returns null for position beyond timeline length", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });

      const result = await t.query(api.lib.getAtPosition, {
        scope,
        position: 3,
      });
      expect(result).toBeNull();
    });

    test("getAtPosition returns null for non-existent scope", async () => {
      const t = initConvexTest();

      const result = await t.query(api.lib.getAtPosition, {
        scope: "non-existent",
        position: 1,
      });
      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("undo on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.undo, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("redo on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.redo, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("getCurrent on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.query(api.lib.getCurrent, {
        scope: "non-existent",
      });
      expect(result).toBeNull();
    });

    test("getStatus on non-existent scope returns empty status", async () => {
      const t = initConvexTest();
      const status = await t.query(api.lib.getStatus, {
        scope: "non-existent",
      });
      expect(status).toEqual({
        canUndo: false,
        canRedo: false,
        position: 0,
        length: 0,
      });
    });

    test("getCheckpoints on non-existent scope returns empty array", async () => {
      const t = initConvexTest();
      const checkpoints = await t.query(api.lib.getCheckpoints, {
        scope: "non-existent",
      });
      expect(checkpoints).toEqual([]);
    });
  });
});
