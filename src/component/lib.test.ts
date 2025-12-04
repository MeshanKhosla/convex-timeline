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

  describe("push", () => {
    test("push creates scope and stores state", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "A" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(0);
      expect(status.length).toBe(1);
      expect(status.canUndo).toBe(true);
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
      expect(statusAfterUndo.position).toBe(1);

      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.position).toBe(2);
      expect(statusAfterPush.length).toBe(3);
      expect(statusAfterPush.canRedo).toBe(false);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "D" });
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

    test("maxNodes should not prune the node at head position", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      for (const value of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
        await t.mutation(api.lib.push, {
          scope,
          document: { value },
          maxNodes: 20,
        });
      }

      const statusBeforeUndo = await t.query(api.lib.getStatus, { scope });
      expect(statusBeforeUndo.position).toBe(9);
      expect(statusBeforeUndo.length).toBe(10);

      await t.mutation(api.lib.undo, { scope, count: 7 });
      const statusAfterUndo = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndo.position).toBe(2);
      expect(statusAfterUndo.length).toBe(10);

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "K" },
        maxNodes: 1,
      });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.position).toBe(3);
      expect(statusAfterPush.length).toBe(1);

      const currentAfterPush = await t.query(api.lib.getCurrentDocument, {
        scope,
      });
      expect(currentAfterPush).not.toBeNull();
      expect(currentAfterPush).toEqual({ value: "K" });

      const nodeAtHead = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: statusAfterPush.position!,
      });
      expect(nodeAtHead).not.toBeNull();
      expect(nodeAtHead).toEqual({ value: "K" });

      const allNodes = await t.query(api.lib.listNodes, { scope });
      expect(allNodes.length).toBe(1);
      expect(allNodes[0].position).toBe(3);
      expect(allNodes[0].document).toEqual({ value: "K" });
    });

    test("maxNodes of 1 keeps only the latest pushed node", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "A" },
        maxNodes: 1,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "B" },
        maxNodes: 1,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "C" },
        maxNodes: 1,
      });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.length).toBe(1);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "C" });
    });

    test("maxNodes larger than current length does not prune", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "A" },
        maxNodes: 100,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "B" },
        maxNodes: 100,
      });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.length).toBe(2);
    });

    test("changing maxNodes between pushes", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "A" },
        maxNodes: 10,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "B" },
        maxNodes: 10,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "C" },
        maxNodes: 10,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "D" },
        maxNodes: 10,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "E" },
        maxNodes: 10,
      });

      const statusBefore = await t.query(api.lib.getStatus, { scope });
      expect(statusBefore.length).toBe(5);

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "F" },
        maxNodes: 2,
      });

      const statusAfter = await t.query(api.lib.getStatus, { scope });
      expect(statusAfter.length).toBe(2);
    });

    test("push with empty object", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: {} });

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({});
    });

    test("push with nested objects", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };

      await t.mutation(api.lib.push, { scope, document: doc });

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(doc);
    });

    test("push with arrays in document", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        items: [1, 2, 3],
        nested: [{ a: 1 }, { b: 2 }],
      };

      await t.mutation(api.lib.push, { scope, document: doc });

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(doc);
    });

    test("push with various primitive types", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        string: "hello",
        number: 42,
        float: 3.14,
        boolean: true,
        nullValue: null,
      };

      await t.mutation(api.lib.push, { scope, document: doc });

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(doc);
    });
  });

  describe("undo", () => {
    test("undo moves head backward", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const statusBefore = await t.query(api.lib.getStatus, { scope });
      expect(statusBefore.position).toBe(2);

      const undoneState = await t.mutation(api.lib.undo, { scope });
      expect(undoneState).toEqual({ value: "B" });

      const statusAfter = await t.query(api.lib.getStatus, { scope });
      expect(statusAfter.position).toBe(1);
      expect(statusAfter.canUndo).toBe(true);
      expect(statusAfter.canRedo).toBe(true);
    });

    test("undo to null returns null", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const undoneState = await t.mutation(api.lib.undo, { scope });
      expect(undoneState).toBeNull();

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBeNull();
      expect(status.canUndo).toBe(false);
      expect(status.canRedo).toBe(true);
    });

    test("multi-step undo", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      const afterUndo = await t.mutation(api.lib.undo, { scope, count: 2 });
      expect(afterUndo).toEqual({ value: "B" });
    });

    test("undo on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.undo, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("undo with count greater than available positions clamps to null", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });

      const result = await t.mutation(api.lib.undo, { scope, count: 100 });
      expect(result).toBeNull();

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBeNull();
      expect(status.canUndo).toBe(false);
      expect(status.canRedo).toBe(true);
    });

    test("undo with count of 0 returns current state without moving", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });

      const statusBefore = await t.query(api.lib.getStatus, { scope });
      const result = await t.mutation(api.lib.undo, { scope, count: 0 });

      const statusAfter = await t.query(api.lib.getStatus, { scope });
      expect(statusAfter.position).toBe(statusBefore.position);
      expect(result).toEqual({ value: "B" });
    });

    test("multiple consecutive undos to null", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      await t.mutation(api.lib.undo, { scope });
      const result = await t.mutation(api.lib.undo, { scope });

      expect(result).toBeNull();

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBeNull();
    });
  });

  describe("redo", () => {
    test("redo moves head forward", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.undo, { scope });

      const redoneState = await t.mutation(api.lib.redo, { scope });
      expect(redoneState).toEqual({ value: "B" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(1);
      expect(status.canRedo).toBe(false);
    });

    test("multi-step redo", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      await t.mutation(api.lib.undo, { scope, count: 2 });

      const afterRedo = await t.mutation(api.lib.redo, { scope, count: 2 });
      expect(afterRedo).toEqual({ value: "D" });
    });

    test("redo on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.mutation(api.lib.redo, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("redo with count greater than available positions clamps to max", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.undo, { scope, count: 2 });

      const result = await t.mutation(api.lib.redo, { scope, count: 100 });
      expect(result).toEqual({ value: "C" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(2);
      expect(status.canRedo).toBe(false);
    });

    test("redo with count of 0 returns current state without moving", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.undo, { scope });

      const statusBefore = await t.query(api.lib.getStatus, { scope });
      const result = await t.mutation(api.lib.redo, { scope, count: 0 });

      const statusAfter = await t.query(api.lib.getStatus, { scope });
      expect(statusAfter.position).toBe(statusBefore.position);
      expect(result).toEqual({ value: "A" });
    });

    test("redo when already at latest position returns current", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.mutation(api.lib.redo, { scope });
      expect(result).toEqual({ value: "A" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(0);
    });

    test("multiple consecutive redos at end position", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      await t.mutation(api.lib.redo, { scope });
      await t.mutation(api.lib.redo, { scope });
      const result = await t.mutation(api.lib.redo, { scope });

      expect(result).toEqual({ value: "A" });
    });
  });

  describe("createCheckpoint", () => {
    test("createCheckpoint saves current state", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([{ name: "v1", position: 1 }]);
    });

    test("createCheckpoint when head is null throws error", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.undo, { scope });

      await expect(
        t.mutation(api.lib.createCheckpoint, { scope, name: "v1" }),
      ).rejects.toThrow(
        "Cannot create checkpoint: timeline is at the beginning",
      );
    });

    test("createCheckpoint with existing name overwrites", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "v1",
      });
      expect(restored).toEqual({ value: "B" });
    });

    test("createCheckpoint document persists through pruning but position becomes null", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "at-C" });

      await t.mutation(api.lib.undo, { scope });
      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      // Position becomes null because the original node at position 3 was pruned
      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([{ name: "at-C", position: null }]);

      // But the checkpoint's document data is preserved and can be restored
      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "at-C",
      });
      expect(restored).toEqual({ value: "C" });
    });

    test("createCheckpoint after undo saves the undone-to state", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.undo, { scope });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "at-B" });

      const checkpoint = await t.query(api.lib.getCheckpointDocument, {
        scope,
        name: "at-B",
      });
      expect(checkpoint).toEqual({ value: "B" });
    });

    test("createCheckpoint on non-existent scope throws error", async () => {
      const t = initConvexTest();

      await expect(
        t.mutation(api.lib.createCheckpoint, {
          scope: "non-existent",
          name: "cp",
        }),
      ).rejects.toThrow();
    });

    test("multiple checkpoints at different positions", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-A" });

      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-B" });

      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-C" });

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints.map((c) => c.name).sort()).toEqual([
        "cp-A",
        "cp-B",
        "cp-C",
      ]);

      expect(
        await t.query(api.lib.getCheckpointDocument, { scope, name: "cp-A" }),
      ).toEqual({ value: "A" });
      expect(
        await t.query(api.lib.getCheckpointDocument, { scope, name: "cp-B" }),
      ).toEqual({ value: "B" });
      expect(
        await t.query(api.lib.getCheckpointDocument, { scope, name: "cp-C" }),
      ).toEqual({ value: "C" });
    });

    test("restoring checkpoint after original node was pruned by maxNodes", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "A" },
        maxNodes: 3,
      });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-A" });

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
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "E" },
        maxNodes: 3,
      });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "cp-A",
      });
      expect(restored).toEqual({ value: "A" });
    });
  });

  describe("restoreCheckpoint", () => {
    test("restoreCheckpoint pushes checkpoint state as new node", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "v1",
      });
      expect(restored).toEqual({ value: "B" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(3);
      expect(status.length).toBe(4);

      const undone = await t.mutation(api.lib.undo, { scope });
      expect(undone).toEqual({ value: "C" });
    });

    test("restoreCheckpoint on non-existent checkpoint throws error", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      await expect(
        t.mutation(api.lib.restoreCheckpoint, { scope, name: "non-existent" }),
      ).rejects.toThrow();
    });

    test("checkpoint restore then undo goes back to pre-restore state", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-A" });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.restoreCheckpoint, { scope, name: "cp-A" });

      const currentAfterRestore = await t.query(api.lib.getCurrentDocument, {
        scope,
      });
      expect(currentAfterRestore).toEqual({ value: "A" });

      await t.mutation(api.lib.undo, { scope });

      const currentAfterUndo = await t.query(api.lib.getCurrentDocument, {
        scope,
      });
      expect(currentAfterUndo).toEqual({ value: "C" });
    });
  });

  describe("deleteCheckpoint", () => {
    test("deleteCheckpoint removes checkpoint", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });
      await t.mutation(api.lib.deleteCheckpoint, { scope, name: "v1" });

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([]);
    });

    test("deleteCheckpoint on non-existent checkpoint does not throw", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.mutation(api.lib.deleteCheckpoint, {
        scope,
        name: "non-existent",
      });
      expect(result).toBeNull();
    });
  });

  describe("getCheckpointDocument", () => {
    test("getCheckpointDocument data round-trip", async () => {
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
        await t.mutation(api.lib.createCheckpoint, {
          scope,
          name: checkpointName,
        });

        const retrieved = await t.query(api.lib.getCheckpointDocument, {
          scope,
          name: checkpointName,
        });
        expect(retrieved).toEqual(document);
      }
    });

    test("getCheckpointDocument returns null for non-existent checkpoint", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.query(api.lib.getCheckpointDocument, {
        scope,
        name: "non-existent",
      });
      expect(result).toBeNull();
    });

    test("getCheckpointDocument returns null for non-existent scope", async () => {
      const t = initConvexTest();

      const result = await t.query(api.lib.getCheckpointDocument, {
        scope: "non-existent",
        name: "any-checkpoint",
      });
      expect(result).toBeNull();
    });
  });

  describe("listCheckpoints", () => {
    test("listCheckpoints on non-existent scope returns empty array", async () => {
      const t = initConvexTest();
      const checkpoints = await t.query(api.lib.listCheckpoints, {
        scope: "non-existent",
      });
      expect(checkpoints).toEqual([]);
    });

    test("listCheckpoints returns names and positions", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-0" });

      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-2" });

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints).toContainEqual({ name: "cp-0", position: 0 });
      expect(checkpoints).toContainEqual({ name: "cp-2", position: 2 });
    });

    test("listCheckpoints position updates when checkpoint is overwritten", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp" });

      let checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([{ name: "cp", position: 0 }]);

      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp" });

      checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([{ name: "cp", position: 2 }]);
    });

    test("checkpoint position becomes null when its node is pruned", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      // 1. Add five todos (positions 0-4)
      await t.mutation(api.lib.push, { scope, document: { value: "todo-0" } });
      await t.mutation(api.lib.push, { scope, document: { value: "todo-1" } });
      await t.mutation(api.lib.push, { scope, document: { value: "todo-2" } });
      await t.mutation(api.lib.push, { scope, document: { value: "todo-3" } });
      await t.mutation(api.lib.push, { scope, document: { value: "todo-4" } });

      const statusAfterPushes = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPushes.position).toBe(4);

      // 2. Undo twice (head at 2)
      await t.mutation(api.lib.undo, { scope, count: 2 });
      const statusAfterUndo2 = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndo2.position).toBe(2);

      // 3. Create checkpoint at position 2 (document: "todo-2")
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp-at-2" });
      const checkpointsAfterCreate = await t.query(api.lib.listCheckpoints, {
        scope,
      });
      expect(checkpointsAfterCreate).toEqual([
        { name: "cp-at-2", position: 2 },
      ]);

      // 4. Undo once (head at 1)
      await t.mutation(api.lib.undo, { scope });
      const statusAfterUndo1 = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndo1.position).toBe(1);

      // 5. Push new document - this prunes nodes at positions 2-4 and creates new node at position 2
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "new-todo" },
      });
      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.position).toBe(2);
      expect(statusAfterPush.length).toBe(3);

      // The checkpoint position should now be null since its node was pruned
      const checkpointsAfterPush = await t.query(api.lib.listCheckpoints, {
        scope,
      });
      expect(checkpointsAfterPush).toEqual([
        { name: "cp-at-2", position: null },
      ]);

      // Verify the current document is the new one
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "new-todo" });

      // Verify the checkpoint still restores the OLD document (it persists independently)
      const checkpointDoc = await t.query(api.lib.getCheckpointDocument, {
        scope,
        name: "cp-at-2",
      });
      expect(checkpointDoc).toEqual({ value: "todo-2" });

      // The nodes list should show position 2 has "new-todo", not "todo-2"
      const nodes = await t.query(api.lib.listNodes, { scope });
      const nodeAt2 = nodes.find((n) => n.position === 2);
      expect(nodeAt2?.document).toEqual({ value: "new-todo" });
    });
  });

  describe("getCurrentDocument", () => {
    test("getCurrentDocument on non-existent scope returns null", async () => {
      const t = initConvexTest();
      const result = await t.query(api.lib.getCurrentDocument, {
        scope: "non-existent",
      });
      expect(result).toBeNull();
    });
  });

  describe("getStatus", () => {
    test("getStatus on non-existent scope returns empty status", async () => {
      const t = initConvexTest();
      const status = await t.query(api.lib.getStatus, {
        scope: "non-existent",
      });
      expect(status).toEqual({
        canUndo: false,
        canRedo: false,
        position: null,
        length: 0,
      });
    });
  });

  describe("clear", () => {
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
        expect(status.position).toBeNull();
        expect(status.canUndo).toBe(false);
        expect(status.canRedo).toBe(false);
      }
    });

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
          await t.mutation(api.lib.createCheckpoint, {
            scope,
            name: `checkpoint-${j}`,
          });
        }

        const checkpointsBefore = await t.query(api.lib.listCheckpoints, {
          scope,
        });
        await t.mutation(api.lib.clear, { scope });
        const checkpointsAfter = await t.query(api.lib.listCheckpoints, {
          scope,
        });

        expect(checkpointsAfter.map((c) => c.name).sort()).toEqual(
          checkpointsBefore.map((c) => c.name).sort(),
        );
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
      expect(statusAfterClear.position).toBeNull();

      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.length).toBe(1);
      expect(statusAfterPush.position).toBe(0);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "C" });
    });
  });

  describe("deleteScope", () => {
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
          await t.mutation(api.lib.createCheckpoint, {
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
        expect(status.position).toBeNull();
        expect(status.length).toBe(0);
        expect(status.canUndo).toBe(false);
        expect(status.canRedo).toBe(false);

        const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
        expect(checkpoints).toEqual([]);

        const current = await t.query(api.lib.getCurrentDocument, { scope });
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
      await t.mutation(api.lib.createCheckpoint, { scope, name: "v1" });

      await t.mutation(api.lib.deleteScope, { scope });

      const statusAfterDelete = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterDelete.length).toBe(0);
      expect(statusAfterDelete.position).toBeNull();

      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.length).toBe(1);
      expect(statusAfterPush.position).toBe(0);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "C" });

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints).toEqual([]);
    });

    test("deleteScope does not affect other scopes", async () => {
      const t = initConvexTest();
      const scope1 = "scope-1";
      const scope2 = "scope-2";

      await t.mutation(api.lib.push, {
        scope: scope1,
        document: { value: "A1" },
      });
      await t.mutation(api.lib.push, {
        scope: scope2,
        document: { value: "A2" },
      });
      await t.mutation(api.lib.createCheckpoint, {
        scope: scope1,
        name: "cp1",
      });
      await t.mutation(api.lib.createCheckpoint, {
        scope: scope2,
        name: "cp2",
      });

      await t.mutation(api.lib.deleteScope, { scope: scope1 });

      const status2 = await t.query(api.lib.getStatus, { scope: scope2 });
      expect(status2.position).toBe(0);
      expect(status2.length).toBe(1);

      const checkpoints2 = await t.query(api.lib.listCheckpoints, {
        scope: scope2,
      });
      expect(checkpoints2).toEqual([{ name: "cp2", position: 0 }]);
    });
  });

  describe("getDocumentAtPosition", () => {
    test("getDocumentAtPosition returns correct document without side effects", async () => {
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
        // 0-indexed: position ranges from 0 to numPushes - 1
        const position = Math.floor(Math.random() * numPushes);

        const retrieved = await t.query(api.lib.getDocumentAtPosition, {
          scope,
          position,
        });
        expect(retrieved).toEqual(documents[position]);

        const statusAfter = await t.query(api.lib.getStatus, { scope });
        expect(statusAfter.position).toBe(statusBefore.position);
      }
    });

    test("getDocumentAtPosition returns document for position 0", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: 0,
      });
      expect(result).toEqual({ value: "A" });
    });

    test("getDocumentAtPosition returns null for position beyond timeline length", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });

      const result = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: 2,
      });
      expect(result).toBeNull();
    });

    test("getDocumentAtPosition returns null for non-existent scope", async () => {
      const t = initConvexTest();

      const result = await t.query(api.lib.getDocumentAtPosition, {
        scope: "non-existent",
        position: 1,
      });
      expect(result).toBeNull();
    });

    test("getDocumentAtPosition with negative position returns null", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      const result = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: -1,
      });
      expect(result).toBeNull();
    });

    test("getDocumentAtPosition after pruning returns null for pruned positions", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, {
        scope,
        document: { value: "A" },
        maxNodes: 2,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "B" },
        maxNodes: 2,
      });
      await t.mutation(api.lib.push, {
        scope,
        document: { value: "C" },
        maxNodes: 2,
      });

      // Position 0 was pruned
      const result = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: 0,
      });
      expect(result).toBeNull();

      const result2 = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: 1,
      });
      expect(result2).toEqual({ value: "B" });

      const result3 = await t.query(api.lib.getDocumentAtPosition, {
        scope,
        position: 2,
      });
      expect(result3).toEqual({ value: "C" });
    });
  });

  describe("listNodes", () => {
    test("listNodes returns all nodes in order", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      const nodes = await t.query(api.lib.listNodes, { scope });
      expect(nodes.length).toBe(3);
      expect(nodes[0].document).toEqual({ value: "A" });
      expect(nodes[1].document).toEqual({ value: "B" });
      expect(nodes[2].document).toEqual({ value: "C" });
      expect(nodes[0].position).toBe(0);
      expect(nodes[1].position).toBe(1);
      expect(nodes[2].position).toBe(2);
    });

    test("listNodes on empty scope returns empty array", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const nodes = await t.query(api.lib.listNodes, { scope });
      expect(nodes).toEqual([]);
    });

    test("listNodes includes future nodes after undo", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.undo, { scope });

      const nodes = await t.query(api.lib.listNodes, { scope });
      expect(nodes.length).toBe(3);
    });
  });

  describe("scope isolation", () => {
    test("operations on one scope do not affect another scope", async () => {
      const t = initConvexTest();
      const scope1 = "scope-1";
      const scope2 = "scope-2";

      await t.mutation(api.lib.push, {
        scope: scope1,
        document: { value: "A1" },
      });
      await t.mutation(api.lib.push, {
        scope: scope1,
        document: { value: "B1" },
      });
      await t.mutation(api.lib.push, {
        scope: scope2,
        document: { value: "A2" },
      });

      await t.mutation(api.lib.undo, { scope: scope1 });

      const status1 = await t.query(api.lib.getStatus, { scope: scope1 });
      const status2 = await t.query(api.lib.getStatus, { scope: scope2 });

      expect(status1.position).toBe(0);
      expect(status2.position).toBe(0);

      const current1 = await t.query(api.lib.getCurrentDocument, {
        scope: scope1,
      });
      const current2 = await t.query(api.lib.getCurrentDocument, {
        scope: scope2,
      });

      expect(current1).toEqual({ value: "A1" });
      expect(current2).toEqual({ value: "A2" });
    });

    test("checkpoints are isolated between scopes", async () => {
      const t = initConvexTest();
      const scope1 = "scope-1";
      const scope2 = "scope-2";

      await t.mutation(api.lib.push, {
        scope: scope1,
        document: { value: "A1" },
      });
      await t.mutation(api.lib.push, {
        scope: scope2,
        document: { value: "A2" },
      });

      await t.mutation(api.lib.createCheckpoint, {
        scope: scope1,
        name: "cp1",
      });

      const checkpoints1 = await t.query(api.lib.listCheckpoints, {
        scope: scope1,
      });
      const checkpoints2 = await t.query(api.lib.listCheckpoints, {
        scope: scope2,
      });

      expect(checkpoints1).toEqual([{ name: "cp1", position: 0 }]);
      expect(checkpoints2).toEqual([]);
    });

    test("same checkpoint name can exist in different scopes", async () => {
      const t = initConvexTest();
      const scope1 = "scope-1";
      const scope2 = "scope-2";

      await t.mutation(api.lib.push, {
        scope: scope1,
        document: { value: "A1" },
      });
      await t.mutation(api.lib.push, {
        scope: scope2,
        document: { value: "A2" },
      });

      await t.mutation(api.lib.createCheckpoint, {
        scope: scope1,
        name: "shared-name",
      });
      await t.mutation(api.lib.createCheckpoint, {
        scope: scope2,
        name: "shared-name",
      });

      const cp1 = await t.query(api.lib.getCheckpointDocument, {
        scope: scope1,
        name: "shared-name",
      });
      const cp2 = await t.query(api.lib.getCheckpointDocument, {
        scope: scope2,
        name: "shared-name",
      });

      expect(cp1).toEqual({ value: "A1" });
      expect(cp2).toEqual({ value: "A2" });
    });
  });

  describe("complex operation sequences", () => {
    test("push → undo → undo → redo → push sequence", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.undo, { scope });
      await t.mutation(api.lib.undo, { scope });

      const statusAfterUndo = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndo.position).toBe(0);

      await t.mutation(api.lib.redo, { scope });

      const statusAfterRedo = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterRedo.position).toBe(1);

      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.position).toBe(2);
      expect(statusAfterPush.length).toBe(3);
      expect(statusAfterPush.canRedo).toBe(false);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "D" });
    });

    test("alternating undo and redo maintains consistency", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      for (let i = 0; i < 5; i++) {
        await t.mutation(api.lib.undo, { scope });
        await t.mutation(api.lib.redo, { scope });
      }

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(2);
      expect(status.length).toBe(3);
    });

    test("undo all then redo all", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.undo, { scope, count: 3 });
      const statusAfterUndoAll = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndoAll.position).toBeNull();
      expect(statusAfterUndoAll.canUndo).toBe(false);

      await t.mutation(api.lib.redo, { scope, count: 3 });
      const statusAfterRedoAll = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterRedoAll.position).toBe(2);
      expect(statusAfterRedoAll.canRedo).toBe(false);

      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({ value: "C" });
    });

    test("maxNodes with undo does not prune nodes ahead of head", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      await t.mutation(api.lib.undo, { scope, count: 2 });

      const statusBefore = await t.query(api.lib.getStatus, { scope });
      expect(statusBefore.length).toBe(3);
      expect(statusBefore.position).toBe(0);

      await t.mutation(api.lib.redo, { scope });
      await t.mutation(api.lib.redo, { scope });

      const statusAfter = await t.query(api.lib.getStatus, { scope });
      expect(statusAfter.position).toBe(2);
    });
  });

  describe("document data types", () => {
    test("supports string documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: "hello world" });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBe("hello world");
    });

    test("supports number documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: 42 });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBe(42);
    });

    test("supports float documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: 3.14159 });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBe(3.14159);
    });

    test("supports boolean documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: true });
      let current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBe(true);

      await t.mutation(api.lib.push, { scope, document: false });
      current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBe(false);
    });

    test("supports null documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: null });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toBeNull();
    });

    test("supports array documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const arr = [1, "two", { three: 3 }, [4, 5]];
      await t.mutation(api.lib.push, { scope, document: arr });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(arr);
    });

    test("supports deeply nested object documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep",
                array: [1, 2, { nested: true }],
              },
            },
          },
        },
      };
      await t.mutation(api.lib.push, { scope, document: doc });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(doc);
    });

    test("supports mixed type objects", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        string: "hello",
        number: 42,
        float: 3.14,
        boolean: true,
        nullValue: null,
        array: [1, "two", true],
        nested: { a: 1, b: "two" },
      };
      await t.mutation(api.lib.push, { scope, document: doc });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual(doc);
    });

    test("supports empty array documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: [] });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual([]);
    });

    test("supports empty object documents", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: {} });
      const current = await t.query(api.lib.getCurrentDocument, { scope });
      expect(current).toEqual({});
    });

    test("preserves data types through undo/redo", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const docs = [
        "string",
        42,
        3.14,
        true,
        null,
        [1, 2, 3],
        { key: "value" },
      ];

      for (const doc of docs) {
        await t.mutation(api.lib.push, { scope, document: doc });
      }

      for (let i = docs.length - 1; i >= 0; i--) {
        const current = await t.query(api.lib.getCurrentDocument, { scope });
        expect(current).toEqual(docs[i]);
        if (i > 0) {
          await t.mutation(api.lib.undo, { scope });
        }
      }

      for (let i = 1; i < docs.length; i++) {
        await t.mutation(api.lib.redo, { scope });
        const current = await t.query(api.lib.getCurrentDocument, { scope });
        expect(current).toEqual(docs[i]);
      }
    });

    test("preserves data types through checkpoint/restore", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      const doc = {
        string: "checkpoint",
        number: 123,
        array: [1, { nested: true }],
      };

      await t.mutation(api.lib.push, { scope, document: doc });
      await t.mutation(api.lib.createCheckpoint, { scope, name: "cp" });

      await t.mutation(api.lib.push, { scope, document: "different" });

      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: "cp",
      });
      expect(restored).toEqual(doc);

      const checkpointDoc = await t.query(api.lib.getCheckpointDocument, {
        scope,
        name: "cp",
      });
      expect(checkpointDoc).toEqual(doc);
    });
  });

  describe("stress tests", () => {
    test("many operations in sequence", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      for (let i = 0; i < 50; i++) {
        await t.mutation(api.lib.push, {
          scope,
          document: { value: `state-${i}` },
        });
      }

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.length).toBe(50);
      expect(status.position).toBe(49);

      await t.mutation(api.lib.undo, { scope, count: 25 });

      const statusAfterUndo = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterUndo.position).toBe(24);

      await t.mutation(api.lib.redo, { scope, count: 10 });

      const statusAfterRedo = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterRedo.position).toBe(34);
    });

    test("many checkpoints", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      for (let i = 0; i < 20; i++) {
        await t.mutation(api.lib.push, {
          scope,
          document: { value: `state-${i}` },
        });
        await t.mutation(api.lib.createCheckpoint, { scope, name: `cp-${i}` });
      }

      const checkpoints = await t.query(api.lib.listCheckpoints, { scope });
      expect(checkpoints.length).toBe(20);

      const randomIndex = Math.floor(Math.random() * 20);
      const restored = await t.mutation(api.lib.restoreCheckpoint, {
        scope,
        name: `cp-${randomIndex}`,
      });
      expect(restored).toEqual({ value: `state-${randomIndex}` });
    });
  });
});
