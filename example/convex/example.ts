import { mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { Timeline } from "convex-timeline";
import { v } from "convex/values";

export const timeline = new Timeline<string>(components.timeline, {
  maxNodesPerScope: 100, // Keep last 100 nodes per scope
});

export const createTodoList = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("todoLists"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("todoLists", {
      name: args.name,
      items: [],
    });
  },
});

export const deleteTodoList = mutation({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) throw new Error("Todo list not found");

    // Delete the timeline scope data
    await timeline.deleteScope(ctx, `todos:${args.todoListId}`);

    // Delete the todo list
    await ctx.db.delete(args.todoListId);

    return null;
  },
});

export const getTodoLists = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("todoLists"),
      _creationTime: v.number(),
      name: v.string(),
      items: v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          completed: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("todoLists").collect();
  },
});

export const getTodos = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      text: v.string(),
      completed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    return list?.items ?? [];
  },
});

// --- Todo Mutations with Timeline ---

export const addTodo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) throw new Error("Todo list not found");

    const newItems = [
      ...list.items,
      { id: crypto.randomUUID(), text: args.text, completed: false },
    ];

    await ctx.db.patch(args.todoListId, { items: newItems });

    // Record state in timeline
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.push(ctx, newItems);

    return null;
  },
});

export const updateTodo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    todoId: v.string(),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) throw new Error("Todo list not found");

    const newItems = list.items.map((item) =>
      item.id === args.todoId
        ? {
            ...item,
            ...(args.text !== undefined && { text: args.text }),
            ...(args.completed !== undefined && { completed: args.completed }),
          }
        : item,
    );

    await ctx.db.patch(args.todoListId, { items: newItems });

    // Record state in timeline
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.push(ctx, newItems);

    return null;
  },
});

export const deleteTodo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    todoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) throw new Error("Todo list not found");

    const newItems = list.items.filter((item) => item.id !== args.todoId);

    await ctx.db.patch(args.todoListId, { items: newItems });

    // Record state in timeline
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.push(ctx, newItems);

    return null;
  },
});

// --- Timeline Operations ---

export const undo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.undo(ctx, args.count);

    // null means we're at position 0 (no state), use empty array
    await ctx.db.patch(args.todoListId, {
      items:
        (state as Array<{ id: string; text: string; completed: boolean }>) ??
        [],
    });

    return null;
  },
});

export const redo = mutation({
  args: {
    todoListId: v.id("todoLists"),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.redo(ctx, args.count);

    // Only update if we actually moved forward
    if (state !== null) {
      await ctx.db.patch(args.todoListId, {
        items: state as Array<{ id: string; text: string; completed: boolean }>,
      });
    }

    return null;
  },
});

export const getTimelineStatus = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.object({
    canUndo: v.boolean(),
    canRedo: v.boolean(),
    position: v.union(v.number(), v.null()),
    length: v.number(),
  }),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    return await todoTimeline.status(ctx);
  },
});

// --- Checkpoint Operations ---

export const saveCheckpoint = mutation({
  args: {
    todoListId: v.id("todoLists"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.createCheckpoint(ctx, args.name);
    return null;
  },
});

export const restoreCheckpoint = mutation({
  args: {
    todoListId: v.id("todoLists"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const state = await todoTimeline.restoreCheckpoint(ctx, args.name);

    await ctx.db.patch(args.todoListId, {
      items: state as Array<{ id: string; text: string; completed: boolean }>,
    });

    return null;
  },
});

export const getCheckpoints = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.array(
    v.object({ name: v.string(), position: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    return await todoTimeline.listCheckpoints(ctx);
  },
});

export const deleteCheckpoint = mutation({
  args: {
    todoListId: v.id("todoLists"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    await todoTimeline.deleteCheckpoint(ctx, args.name);
    return null;
  },
});

export const getAllTimelineNodes = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.array(
    v.object({
      position: v.number(),
      document: v.any(),
    }),
  ),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    return await todoTimeline.listNodes(ctx);
  },
});

export const getCheckpointPositions = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const todoTimeline = timeline.forScope(`todos:${args.todoListId}`);
    const checkpoints = await todoTimeline.listCheckpoints(ctx);
    return checkpoints
      .map((c) => c.position)
      .filter((p): p is number => p !== null);
  },
});
