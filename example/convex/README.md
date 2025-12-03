# Example Convex Functions

This directory shows how to integrate convex-timeline into a todo app.

## Setup

```ts
// convex.config.ts
import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config.js";

const app = defineApp();
app.use(timeline);
export default app;
```

## Initialize Timeline

```ts
import { Timeline } from "convex-timeline";
import { components } from "./_generated/api.js";

// Create timeline with optional max nodes per scope
const timeline = new Timeline(components.timeline, {
  maxNodesPerScope: 100,
});
```

## Push State After Changes

Every mutation that modifies state should push to the timeline. This records the state for undo/redo.

```ts
export const addTodo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) throw new Error("Todo list not found");

    const newItems = [
      ...list.items,
      { id: crypto.randomUUID(), text: args.text, completed: false },
    ];

    // Update the database
    await ctx.db.patch(args.todoListId, { items: newItems });

    // Record state in timeline (scoped per todo list)
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.push(ctx, newItems);
  },
});
```

## Undo/Redo

Undo moves the head backward and returns the previous state. Apply it to your database.

```ts
export const undo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    count: v.optional(v.number()), // Undo multiple steps at once
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.undo(ctx, args.count);

    // null means we're at position 0 (before any state was pushed)
    await ctx.db.patch(args.todoListId, {
      items: state ?? [],
    });
  },
});

export const redo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.redo(ctx, args.count);

    // null means we're already at the latest state
    if (state !== null) {
      await ctx.db.patch(args.todoListId, { items: state });
    }
  },
});
```

## Query Timeline Status

Use status to enable/disable undo/redo buttons in your UI.

```ts
export const getTimelineStatus = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    return await todoTimeline.status(ctx);
    // Returns: { canUndo: boolean, canRedo: boolean, position: number | null, length: number }
  },
});
```

## Checkpoints

Checkpoints are named snapshots that persist even when timeline nodes are pruned. Useful for "save points" users can return to.

```ts
// Save current state as a named checkpoint
export const saveCheckpoint = mutation({
  args: {
    todoListId: v.id("todoLists"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.createCheckpoint(ctx, args.name);
  },
});

// Restore a checkpoint (pushes it as a new node, so it's undoable)
export const restoreCheckpoint = mutation({
  args: {
    todoListId: v.id("todoLists"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.restoreCheckpoint(ctx, args.name);

    await ctx.db.patch(args.todoListId, { items: state });
  },
});

// List all checkpoints
export const getCheckpoints = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    return await todoTimeline.listCheckpoints(ctx);
    // Returns: Array<{ name: string, position: number | null }>
  },
});
```

See [example.ts](./example.ts) for the full implementation.
