import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

/**
 * Push a new state node onto the timeline.
 *
 * If the head is not at the leaf (i.e., user has undone), this prunes
 * all nodes ahead of the current head before inserting the new node.
 *
 * Timeline behavior:
 *   Before: [A:1] -- [B:2] -- [C:3]  head=2 (after undo)
 *   push(D)
 *   After:  [A:1] -- [B:2] -- [D:3]  head=3 (C pruned)
 */
export const push = mutation({
  args: {
    scope: v.string(),
    document: v.any(),
    maxNodes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    // Auto-create scope if it doesn't exist
    if (!scope) {
      const scopeId = await ctx.db.insert("scopes", {
        name: args.scope,
        head: 0,
      });
      scope = await ctx.db.get(scopeId);
      if (!scope) {
        throw new Error("Failed to create scope");
      }
    }

    // Prune nodes ahead of current head (handles push-after-undo)
    const nodesToPrune = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
      .filter((q) => q.gt(q.field("index"), scope.head))
      .collect();

    for (const node of nodesToPrune) {
      await ctx.db.delete(node._id);
    }

    // Insert new node at head + 1
    const newIndex = scope.head + 1;
    await ctx.db.insert("nodes", {
      scope: scope._id,
      document: args.document,
      index: newIndex,
    });

    // Update head to point to new node
    await ctx.db.patch(scope._id, {
      head: newIndex,
    });

    // Prune oldest nodes if we exceed maxNodes
    if (args.maxNodes !== undefined && args.maxNodes > 0) {
      const allNodes = await ctx.db
        .query("nodes")
        .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
        .collect();

      if (allNodes.length > args.maxNodes) {
        // Sort by index ascending to find oldest
        allNodes.sort((a, b) => a.index - b.index);
        const nodesToDelete = allNodes.slice(
          0,
          allNodes.length - args.maxNodes,
        );
        for (const node of nodesToDelete) {
          await ctx.db.delete(node._id);
        }
      }
    }

    return null;
  },
});

/**
 * Move head backward in the timeline.
 * Returns the state at the new head position, or null if at position 0.
 */
export const undo = mutation({
  args: {
    scope: v.string(),
    count: v.optional(v.number()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return null;
    }

    const countToMove = args.count ?? 1;
    const newHead = Math.max(0, scope.head - countToMove);

    await ctx.db.patch(scope._id, {
      head: newHead,
    });

    if (newHead === 0) {
      return null;
    }

    const node = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", newHead),
      )
      .unique();

    return node?.document ?? null;
  },
});

/**
 * Move head forward in the timeline.
 * Returns the state at the new head position, or null if already at leaf.
 */
export const redo = mutation({
  args: {
    scope: v.string(),
    count: v.optional(v.number()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return null;
    }

    // Find the leaf (highest index)
    const leafNode = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
      .order("desc")
      .first();

    const maxIndex = leafNode?.index ?? 0;
    const countToMove = args.count ?? 1;
    const newHead = Math.min(maxIndex, scope.head + countToMove);

    await ctx.db.patch(scope._id, {
      head: newHead,
    });

    if (newHead === 0) {
      return null;
    }

    const node = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", newHead),
      )
      .unique();

    return node?.document ?? null;
  },
});

/**
 * Get the current state without modifying the timeline.
 * Returns null if head is at position 0 (before any state).
 */
export const getCurrent = query({
  args: {
    scope: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope || scope.head === 0) {
      return null;
    }

    const node = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", scope.head),
      )
      .unique();

    return node?.document ?? null;
  },
});

/**
 * Get timeline status including navigation availability and position info.
 */
export const getStatus = query({
  args: {
    scope: v.string(),
  },
  returns: v.object({
    canUndo: v.boolean(),
    canRedo: v.boolean(),
    position: v.number(),
    length: v.number(),
  }),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return {
        canUndo: false,
        canRedo: false,
        position: 0,
        length: 0,
      };
    }

    // Count total nodes
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    const length = nodes.length;
    const leafIndex = nodes.reduce((max, n) => Math.max(max, n.index), 0);

    return {
      canUndo: scope.head > 0,
      canRedo: scope.head < leafIndex,
      position: scope.head,
      length,
    };
  },
});

/**
 * Create a named checkpoint of the current state.
 * Checkpoints are independent of the timeline and persist through pruning.
 */
export const checkpoint = mutation({
  args: {
    scope: v.string(),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      throw new Error(`Scope "${args.scope}" not found`);
    }

    if (scope.head === 0) {
      throw new Error("Cannot checkpoint at position 0 (no state)");
    }

    // Get current state
    const currentNode = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", scope.head),
      )
      .unique();

    if (!currentNode) {
      throw new Error("Current state not found");
    }

    // Check if checkpoint with this name already exists
    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (existing) {
      // Update existing checkpoint
      await ctx.db.patch(existing._id, {
        document: currentNode.document,
      });
    } else {
      // Create new checkpoint
      await ctx.db.insert("checkpoints", {
        scope: scope._id,
        name: args.name,
        document: currentNode.document,
      });
    }

    return null;
  },
});

/**
 * Restore a checkpoint by pushing its state as a new node.
 * This is non-destructive - you can undo the restore.
 */
export const restoreCheckpoint = mutation({
  args: {
    scope: v.string(),
    name: v.string(),
    maxNodes: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      throw new Error(`Scope "${args.scope}" not found`);
    }

    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (!checkpoint) {
      throw new Error(`Checkpoint "${args.name}" not found`);
    }

    // Prune nodes ahead of current head
    const nodesToPrune = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
      .filter((q) => q.gt(q.field("index"), scope.head))
      .collect();

    for (const node of nodesToPrune) {
      await ctx.db.delete(node._id);
    }

    // Push checkpoint state as new node
    const newIndex = scope.head + 1;
    await ctx.db.insert("nodes", {
      scope: scope._id,
      document: checkpoint.document,
      index: newIndex,
    });

    await ctx.db.patch(scope._id, {
      head: newIndex,
    });

    // Prune oldest nodes if we exceed maxNodes
    if (args.maxNodes !== undefined && args.maxNodes > 0) {
      const allNodes = await ctx.db
        .query("nodes")
        .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
        .collect();

      if (allNodes.length > args.maxNodes) {
        allNodes.sort((a, b) => a.index - b.index);
        const nodesToDelete = allNodes.slice(
          0,
          allNodes.length - args.maxNodes,
        );
        for (const node of nodesToDelete) {
          await ctx.db.delete(node._id);
        }
      }
    }

    return checkpoint.document;
  },
});

/**
 * List all checkpoint names for a scope.
 */
export const getCheckpoints = query({
  args: {
    scope: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return [];
    }

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    return checkpoints.map((c) => c.name);
  },
});

/**
 * Delete a checkpoint.
 */
export const deleteCheckpoint = mutation({
  args: {
    scope: v.string(),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return null;
    }

    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (checkpoint) {
      await ctx.db.delete(checkpoint._id);
    }

    return null;
  },
});
