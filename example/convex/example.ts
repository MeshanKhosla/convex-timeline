import { internalMutation, mutation, query } from "./_generated/server.js";
import { components, internal } from "./_generated/api.js";
import { Timeline } from "convex-timeline";
import { v } from "convex/values";

export const timeline = new Timeline<string>(components.timeline, {
  maxNodesPerScope: 100, // Keep last 100 nodes per scope
});

// Protected todo list IDs that should never be deleted or modified, e.g. the demo todo lists
const PROTECTED_TODO_LIST_IDS = [
  "j57f2jerav9yw1jsqsh8ya9aex7wqymv",
  "j57byynbsza01crvsc5yesvs0x7wqwn8",
];

const isProtectedList = (listId: string): boolean => {
  return PROTECTED_TODO_LIST_IDS.includes(listId);
};

const throwIfProtected = (listId: string) => {
  if (isProtectedList(listId)) {
    throw new Error("This todo list is read-only and cannot be modified");
  }
};

// Time until deletion (5 minutes in milliseconds)
const DELETION_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// Internal helper to increment counter (called directly from mutations)
const incrementCounter = async (ctx: any) => {
  // Get or create the counter document (there should only be one)
  const counter = await ctx.db.query("todoCounter").first();

  if (counter) {
    await ctx.db.patch(counter._id, {
      totalTodoListsCreated: counter.totalTodoListsCreated + 1,
    });
  } else {
    await ctx.db.insert("todoCounter", {
      totalTodoListsCreated: 1,
    });
  }
};

export const createTodoList = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("todoLists"),
  handler: async (ctx, args) => {
    const todoListId = await ctx.db.insert("todoLists", {
      name: args.name,
      items: [],
    });

    // Increment the counter
    await incrementCounter(ctx);

    // Schedule deletion after 5 minutes (only for non-protected lists)
    if (!isProtectedList(todoListId as string)) {
      await ctx.scheduler.runAfter(
        DELETION_DELAY_MS,
        internal.example.scheduledDeleteTodoList,
        { todoListId },
      );
    }

    return todoListId;
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

    // Prevent deletion of protected lists
    throwIfProtected(args.todoListId as string);

    // Cancel any scheduled deletion for this list
    const scheduledFunctions = await ctx.db.system
      .query("_scheduled_functions")
      .collect();

    for (const scheduled of scheduledFunctions) {
      if (scheduled.name?.includes("scheduledDeleteTodoList")) {
        const scheduledArgs = scheduled.args?.[0];
        if (
          scheduledArgs &&
          typeof scheduledArgs === "object" &&
          "todoListId" in scheduledArgs &&
          scheduledArgs.todoListId === args.todoListId
        ) {
          const state = scheduled.state;
          if (
            state &&
            typeof state === "object" &&
            "kind" in state &&
            state.kind === "pending"
          ) {
            await ctx.scheduler.cancel(scheduled._id);
          }
        }
      }
    }

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

    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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

    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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

    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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
    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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
    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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
    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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
    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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
    // Prevent modification of protected lists
    throwIfProtected(args.todoListId as string);

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

// --- Scheduled Deletion ---

// Internal mutation to handle scheduled deletion
export const scheduledDeleteTodoList = internalMutation({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    if (!list) {
      // List already deleted, nothing to do
      return null;
    }

    // Double-check it's not protected (shouldn't happen, but safety check)
    if (isProtectedList(args.todoListId as string)) {
      return null;
    }

    // Delete the timeline scope data
    await timeline.deleteScope(ctx, `todos:${args.todoListId}`);

    // Delete the todo list
    await ctx.db.delete(args.todoListId);

    return null;
  },
});

// Query to get scheduled deletion time for a todo list
export const getScheduledDeletionTime = query({
  args: {
    todoListId: v.id("todoLists"),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    // Check if list is protected
    if (isProtectedList(args.todoListId as string)) {
      return null;
    }

    // Query scheduled functions to find deletion time
    const scheduledFunctions = await ctx.db.system
      .query("_scheduled_functions")
      .collect();

    for (const scheduled of scheduledFunctions) {
      // Check if this is our deletion function for this todo list
      // The name format is "modulePath:functionName"
      if (scheduled.name?.includes("scheduledDeleteTodoList")) {
        // Args is an array, first element is the args object
        const scheduledArgs = scheduled.args?.[0];
        if (
          scheduledArgs &&
          typeof scheduledArgs === "object" &&
          "todoListId" in scheduledArgs &&
          scheduledArgs.todoListId === args.todoListId
        ) {
          // Check if it's still pending
          const state = scheduled.state;
          if (
            state &&
            typeof state === "object" &&
            "kind" in state &&
            state.kind === "pending"
          ) {
            return scheduled.scheduledTime;
          }
        }
      }
    }

    return null;
  },
});
