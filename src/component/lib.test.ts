/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("timeline component", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("push creates scope and stores state", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, {
      scope,
      document: { value: "A" },
    });

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

    // Build timeline: A -> B -> C
    await t.mutation(api.lib.push, { scope, document: { value: "A" } });
    await t.mutation(api.lib.push, { scope, document: { value: "B" } });
    await t.mutation(api.lib.push, { scope, document: { value: "C" } });

    // Undo to B
    await t.mutation(api.lib.undo, { scope });
    const statusAfterUndo = await t.query(api.lib.getStatus, { scope });
    expect(statusAfterUndo.position).toBe(2);

    // Push D - should prune C
    await t.mutation(api.lib.push, { scope, document: { value: "D" } });

    const statusAfterPush = await t.query(api.lib.getStatus, { scope });
    expect(statusAfterPush.position).toBe(3);
    expect(statusAfterPush.length).toBe(3); // A, B, D (C was pruned)

    // Redo should not be possible since C was pruned
    expect(statusAfterPush.canRedo).toBe(false);

    // Current should be D
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

    // Undo 2 positions: D -> B
    const afterUndo = await t.mutation(api.lib.undo, { scope, count: 2 });
    expect(afterUndo).toEqual({ value: "B" });

    // Redo 2 positions: B -> D
    const afterRedo = await t.mutation(api.lib.redo, { scope, count: 2 });
    expect(afterRedo).toEqual({ value: "D" });
  });

  test("maxNodes prunes oldest nodes", async () => {
    const t = initConvexTest();
    const scope = "test-scope";

    await t.mutation(api.lib.push, { scope, document: { value: "A" }, maxNodes: 3 });
    await t.mutation(api.lib.push, { scope, document: { value: "B" }, maxNodes: 3 });
    await t.mutation(api.lib.push, { scope, document: { value: "C" }, maxNodes: 3 });
    await t.mutation(api.lib.push, { scope, document: { value: "D" }, maxNodes: 3 });

    const status = await t.query(api.lib.getStatus, { scope });
    expect(status.length).toBe(3); // Only B, C, D remain (A was pruned)
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

      // Restore v1 (B)
      const restored = await t.mutation(api.lib.restoreCheckpoint, { scope, name: "v1" });
      expect(restored).toEqual({ value: "B" });

      const status = await t.query(api.lib.getStatus, { scope });
      expect(status.position).toBe(4); // A, B, C, B' (restored)
      expect(status.length).toBe(4);

      // Can undo back to C
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

      // Undo to B, then push D (prunes C)
      await t.mutation(api.lib.undo, { scope });
      await t.mutation(api.lib.push, { scope, document: { value: "D" } });

      // Checkpoint still exists and can be restored
      const checkpoints = await t.query(api.lib.getCheckpoints, { scope });
      expect(checkpoints).toEqual(["at-C"]);

      const restored = await t.mutation(api.lib.restoreCheckpoint, { scope, name: "at-C" });
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

      // Create scope by pushing then undoing
      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.undo, { scope });

      await expect(
        t.mutation(api.lib.checkpoint, { scope, name: "v1" })
      ).rejects.toThrow("Cannot checkpoint at position 0");
    });

    test("updating existing checkpoint overwrites", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });

      await t.mutation(api.lib.push, { scope, document: { value: "B" } });
      await t.mutation(api.lib.checkpoint, { scope, name: "v1" });

      const restored = await t.mutation(api.lib.restoreCheckpoint, { scope, name: "v1" });
      expect(restored).toEqual({ value: "B" });
    });
  });

  describe("clear mutation", () => {
    /**
     * **Feature: timeline-improvements, Property 1: Clear resets timeline to empty state**
     * *For any* scope with any number of nodes at any head position, calling clear should result in:
     * - status.length === 0
     * - status.position === 0
     * - status.canUndo === false
     * - status.canRedo === false
     * **Validates: Requirements 2.1, 2.2**
     */
    test("Property 1: Clear resets timeline to empty state", async () => {
      const ITERATIONS = 20;

      for (let i = 0; i < ITERATIONS; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        // Generate random number of pushes (1-10)
        const numPushes = Math.floor(Math.random() * 10) + 1;
        for (let j = 0; j < numPushes; j++) {
          await t.mutation(api.lib.push, {
            scope,
            document: { value: `state-${j}` },
          });
        }

        // Optionally perform some undos (0 to numPushes)
        const numUndos = Math.floor(Math.random() * (numPushes + 1));
        if (numUndos > 0) {
          await t.mutation(api.lib.undo, { scope, count: numUndos });
        }

        // Clear the timeline
        await t.mutation(api.lib.clear, { scope });

        // Verify the property
        const status = await t.query(api.lib.getStatus, { scope });
        expect(status.length).toBe(0);
        expect(status.position).toBe(0);
        expect(status.canUndo).toBe(false);
        expect(status.canRedo).toBe(false);
      }
    });

    /**
     * **Feature: timeline-improvements, Property 2: Clear preserves checkpoints**
     * *For any* scope with checkpoints, calling clear should not affect the checkpoint list -
     * getCheckpoints should return the same names before and after clear.
     * **Validates: Requirements 2.4**
     */
    test("Property 2: Clear preserves checkpoints", async () => {
      const ITERATIONS = 20;

      for (let i = 0; i < ITERATIONS; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        // Generate random number of pushes (1-5)
        const numPushes = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < numPushes; j++) {
          await t.mutation(api.lib.push, {
            scope,
            document: { value: `state-${j}` },
          });
        }

        // Create random number of checkpoints (1-3)
        const numCheckpoints = Math.floor(Math.random() * 3) + 1;
        const checkpointNames: string[] = [];
        for (let j = 0; j < numCheckpoints; j++) {
          const name = `checkpoint-${j}`;
          checkpointNames.push(name);
          await t.mutation(api.lib.checkpoint, { scope, name });
        }

        // Get checkpoints before clear
        const checkpointsBefore = await t.query(api.lib.getCheckpoints, { scope });

        // Clear the timeline
        await t.mutation(api.lib.clear, { scope });

        // Get checkpoints after clear
        const checkpointsAfter = await t.query(api.lib.getCheckpoints, { scope });

        // Verify the property - checkpoints should be preserved
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

      // Build timeline
      await t.mutation(api.lib.push, { scope, document: { value: "A" } });
      await t.mutation(api.lib.push, { scope, document: { value: "B" } });

      // Clear
      await t.mutation(api.lib.clear, { scope });

      // Verify cleared
      const statusAfterClear = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterClear.length).toBe(0);
      expect(statusAfterClear.position).toBe(0);

      // Push new state
      await t.mutation(api.lib.push, { scope, document: { value: "C" } });

      // Verify new state
      const statusAfterPush = await t.query(api.lib.getStatus, { scope });
      expect(statusAfterPush.length).toBe(1);
      expect(statusAfterPush.position).toBe(1);

      const current = await t.query(api.lib.getCurrent, { scope });
      expect(current).toEqual({ value: "C" });
    });
  });

  describe("getCheckpoint query", () => {
    /**
     * **Feature: timeline-improvements, Property 3: Checkpoint data round-trip**
     * *For any* document that is pushed and then checkpointed, calling getCheckpoint
     * with that checkpoint name should return a document equal to the original.
     * **Validates: Requirements 3.1**
     */
    test("Property 3: Checkpoint data round-trip", async () => {
      const ITERATIONS = 20;

      for (let i = 0; i < ITERATIONS; i++) {
        const t = initConvexTest();
        const scope = `test-scope-${i}`;

        // Generate random document
        const document = {
          id: Math.random().toString(36).substring(7),
          value: Math.floor(Math.random() * 1000),
          nested: {
            data: `nested-${Math.random().toString(36).substring(7)}`,
          },
        };

        // Push the document
        await t.mutation(api.lib.push, { scope, document });

        // Create a checkpoint with random name
        const checkpointName = `checkpoint-${Math.random().toString(36).substring(7)}`;
        await t.mutation(api.lib.checkpoint, { scope, name: checkpointName });

        // Get the checkpoint
        const retrieved = await t.query(api.lib.getCheckpoint, {
          scope,
          name: checkpointName,
        });

        // Verify round-trip: retrieved document should equal original
        expect(retrieved).toEqual(document);
      }
    });

    test("getCheckpoint returns null for non-existent checkpoint", async () => {
      const t = initConvexTest();
      const scope = "test-scope";

      // Create scope with a push
      await t.mutation(api.lib.push, { scope, document: { value: "A" } });

      // Try to get non-existent checkpoint
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
      const result = await t.query(api.lib.getCurrent, { scope: "non-existent" });
      expect(result).toBeNull();
    });

    test("getStatus on non-existent scope returns empty status", async () => {
      const t = initConvexTest();
      const status = await t.query(api.lib.getStatus, { scope: "non-existent" });
      expect(status).toEqual({
        canUndo: false,
        canRedo: false,
        position: 0,
        length: 0,
      });
    });

    test("getCheckpoints on non-existent scope returns empty array", async () => {
      const t = initConvexTest();
      const checkpoints = await t.query(api.lib.getCheckpoints, { scope: "non-existent" });
      expect(checkpoints).toEqual([]);
    });
  });
});
