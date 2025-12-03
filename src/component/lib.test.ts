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
