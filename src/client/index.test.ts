import { describe, expect, test } from "vitest";
import { Timeline } from "./index.js";
import { defineSchema } from "convex/server";
import { components, initConvexTest } from "./setup.test.js";

const schema = defineSchema({});

describe("Timeline client", () => {
  test("push and current work correctly", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      const current = await timeline.current(ctx, scope);
      expect(current).toEqual({ value: "A" });
    });
  });

  test("undo and redo navigation", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      await timeline.push(ctx, scope, { value: "B" });
      await timeline.push(ctx, scope, { value: "C" });

      const afterUndo = await timeline.undo(ctx, scope);
      expect(afterUndo).toEqual({ value: "B" });

      const afterRedo = await timeline.redo(ctx, scope);
      expect(afterRedo).toEqual({ value: "C" });
    });
  });

  test("status returns correct values", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      await timeline.push(ctx, scope, { value: "B" });

      const status = await timeline.status(ctx, scope);
      expect(status.canUndo).toBe(true);
      expect(status.canRedo).toBe(false);
      expect(status.position).toBe(2);
      expect(status.length).toBe(2);
    });
  });

  test("scoped facade works correctly", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scoped = timeline.forScope("test-scope");

    await t.run(async (ctx) => {
      await scoped.push(ctx, { value: "A" });
      await scoped.push(ctx, { value: "B" });

      const current = await scoped.current(ctx);
      expect(current).toEqual({ value: "B" });

      const undone = await scoped.undo(ctx);
      expect(undone).toEqual({ value: "A" });
    });
  });

  test("maxNodesPerScope option is respected", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline<string>(components.timeline, {
      maxNodesPerScope: 2,
    });
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      await timeline.push(ctx, scope, { value: "B" });
      await timeline.push(ctx, scope, { value: "C" });

      const status = await timeline.status(ctx, scope);
      expect(status.length).toBe(2); // Only B and C remain
    });
  });

  test("checkpoint operations", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      await timeline.push(ctx, scope, { value: "B" });
      await timeline.checkpoint(ctx, scope, "v1");

      await timeline.push(ctx, scope, { value: "C" });

      const checkpoints = await timeline.getCheckpoints(ctx, scope);
      expect(checkpoints).toEqual(["v1"]);

      const restored = await timeline.restoreCheckpoint(ctx, scope, "v1");
      expect(restored).toEqual({ value: "B" });

      await timeline.deleteCheckpoint(ctx, scope, "v1");
      const afterDelete = await timeline.getCheckpoints(ctx, scope);
      expect(afterDelete).toEqual([]);
    });
  });

  test("getCheckpoint retrieves checkpoint data without restoring", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });
      await timeline.push(ctx, scope, { value: "B" });
      await timeline.checkpoint(ctx, scope, "v1");
      await timeline.push(ctx, scope, { value: "C" });

      // Get checkpoint without restoring
      const checkpointData = await timeline.getCheckpoint(ctx, scope, "v1");
      expect(checkpointData).toEqual({ value: "B" });

      // Verify head position unchanged (still at C)
      const current = await timeline.current(ctx, scope);
      expect(current).toEqual({ value: "C" });

      // Test scoped facade
      const scoped = timeline.forScope(scope);
      const scopedCheckpointData = await scoped.getCheckpoint(ctx, "v1");
      expect(scopedCheckpointData).toEqual({ value: "B" });
    });
  });

  test("getCheckpoint returns null for non-existent checkpoint", async () => {
    const t = initConvexTest(schema);
    const timeline = new Timeline(components.timeline);
    const scope = "test-scope";

    await t.run(async (ctx) => {
      await timeline.push(ctx, scope, { value: "A" });

      const result = await timeline.getCheckpoint(ctx, scope, "non-existent");
      expect(result).toBeNull();
    });
  });
});
