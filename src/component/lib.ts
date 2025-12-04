import type { Id } from "./_generated/dataModel.js";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";

/**
 * Prune nodes ahead of current head and insert a new node.
 * Also invalidates checkpoint positions when their nodes are pruned.
 * @see lib.test.ts "checkpoint position becomes null when its node is pruned"
 */
async function pruneAheadAndInsert(
  ctx: MutationCtx,
  scopeId: Id<"scopes">,
  currentHead: number | null,
  document: unknown,
): Promise<number> {
  // If head is null, we're before any nodes, so prune all nodes
  // If head is a number, prune nodes with index > head
  const nodesToPrune =
    currentHead === null
      ? await ctx.db
          .query("nodes")
          .withIndex("by_scope", (q) => q.eq("scope", scopeId))
          .collect()
      : await ctx.db
          .query("nodes")
          .withIndex("by_scope_index", (q) => q.eq("scope", scopeId))
          .filter((q) => q.gt(q.field("index"), currentHead))
          .collect();

  const prunedPositions = new Set(nodesToPrune.map((n) => n.index));

  for (const node of nodesToPrune) {
    await ctx.db.delete(node._id);
  }

  if (prunedPositions.size > 0) {
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope", (q) => q.eq("scope", scopeId))
      .collect();

    for (const checkpoint of checkpoints) {
      if (
        checkpoint.position !== null &&
        prunedPositions.has(checkpoint.position)
      ) {
        await ctx.db.patch(checkpoint._id, { position: null });
      }
    }
  }

  // 0-indexed: if head is null, new index is 0; otherwise head + 1
  const newIndex = currentHead === null ? 0 : currentHead + 1;
  await ctx.db.insert("nodes", {
    scope: scopeId,
    document,
    index: newIndex,
  });

  return newIndex;
}

/**
 * Prune oldest nodes if count exceeds maxNodes.
 * Also invalidates checkpoint positions when their nodes are pruned.
 */
async function pruneOldestIfNeeded(
  ctx: MutationCtx,
  scopeId: Id<"scopes">,
  maxNodes: number,
): Promise<void> {
  if (maxNodes <= 0) return;

  const allNodes = await ctx.db
    .query("nodes")
    .withIndex("by_scope_index", (q) => q.eq("scope", scopeId))
    .order("asc")
    .collect();

  if (allNodes.length > maxNodes) {
    const nodesToDelete = allNodes.slice(0, allNodes.length - maxNodes);
    const prunedPositions = new Set(nodesToDelete.map((n) => n.index));

    for (const node of nodesToDelete) {
      await ctx.db.delete(node._id);
    }

    // Invalidate checkpoints at pruned positions
    // see lib.test.ts "checkpoint position becomes null when its node is pruned"
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope", (q) => q.eq("scope", scopeId))
      .collect();

    for (const checkpoint of checkpoints) {
      if (
        checkpoint.position !== null &&
        prunedPositions.has(checkpoint.position)
      ) {
        await ctx.db.patch(checkpoint._id, { position: null });
      }
    }
  }
}

/**
 * Push a new state node onto the timeline.
 *
 * If head is not at the leaf (after undo), prunes all nodes ahead of head first.
 *
 * ```
 * Before: [A:1] -- [B:2] -- [C:3]  head=2 (after undo)
 * push(D)
 * After:  [A:1] -- [B:2] -- [D:3]  head=3 (C pruned)
 * ```
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

    if (!scope) {
      const scopeId = await ctx.db.insert("scopes", {
        name: args.scope,
        head: null, // null = before any nodes
      });
      scope = await ctx.db.get(scopeId);
      if (!scope) throw new Error("Failed to create scope");
    }

    const newIndex = await pruneAheadAndInsert(
      ctx,
      scope._id,
      scope.head,
      args.document,
    );

    await ctx.db.patch(scope._id, { head: newIndex });

    if (args.maxNodes !== undefined) {
      await pruneOldestIfNeeded(ctx, scope._id, args.maxNodes);
    }

    return null;
  },
});

/**
 * Move head backward in the timeline.
 * Returns the state at the new head position, or null if head becomes null.
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

    if (!scope) return null;

    // If head is null, already at the beginning
    if (scope.head === null) return null;

    const count = args.count ?? 1;
    // 0-indexed: going below 0 means head becomes null
    const newHead = scope.head - count < 0 ? null : scope.head - count;
    await ctx.db.patch(scope._id, { head: newHead });

    if (newHead === null) return null;

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

    if (!scope) return null;

    const count = args.count ?? 1;

    // If count is 0, return current state without moving (no-op)
    if (count === 0) {
      if (scope.head === null) return null;
      const head = scope.head;
      const node = await ctx.db
        .query("nodes")
        .withIndex("by_scope_index", (q) =>
          q.eq("scope", scope._id).eq("index", head),
        )
        .unique();
      return node?.document ?? null;
    }

    const leafNode = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
      .order("desc")
      .first();

    if (!leafNode) return null;

    const maxIndex = leafNode.index;
    // 0-indexed: if head is null, start from -1 so adding count moves to correct position
    const currentPosition = scope.head ?? -1;
    const newHead = Math.min(maxIndex, currentPosition + count);

    await ctx.db.patch(scope._id, { head: newHead });

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
 * Get the current document without modifying the timeline.
 * Returns null if head is null (before any document).
 */
export const getCurrentDocument = query({
  args: { scope: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope || scope.head === null) return null;

    const head = scope.head;
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", head),
      )
      .unique();

    return node?.document ?? null;
  },
});

/** Get timeline status including navigation availability and position info. */
export const getStatus = query({
  args: { scope: v.string() },
  returns: v.object({
    canUndo: v.boolean(),
    canRedo: v.boolean(),
    position: v.union(v.number(), v.null()),
    length: v.number(),
  }),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) {
      return { canUndo: false, canRedo: false, position: null, length: 0 };
    }

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    // 0-indexed: max index is length - 1, but we need to handle empty case
    const leafIndex =
      nodes.length > 0 ? Math.max(...nodes.map((n) => n.index)) : null;

    return {
      canUndo: scope.head !== null,
      canRedo:
        scope.head === null
          ? nodes.length > 0
          : leafIndex !== null && scope.head < leafIndex,
      position: scope.head,
      length: nodes.length,
    };
  },
});

/**
 * Create a named checkpoint of the current state.
 * Checkpoints persist independently of the timeline through pruning.
 */
export const createCheckpoint = mutation({
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

    if (!scope)
      throw new Error(
        `Timeline scope "${args.scope}" not found. Use push() to create a new scope.`,
      );
    if (scope.head === null)
      throw new Error(
        "Cannot create checkpoint: timeline is at the beginning (no state). Push a state first.",
      );

    const head = scope.head;
    const currentNode = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", head),
      )
      .unique();

    if (!currentNode) throw new Error("Current state not found");

    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        document: currentNode.document,
        position: scope.head,
      });
    } else {
      await ctx.db.insert("checkpoints", {
        scope: scope._id,
        name: args.name,
        document: currentNode.document,
        position: scope.head,
      });
    }

    return null;
  },
});

/**
 * Restore a checkpoint by pushing its state as a new node.
 * Non-destructive: you can undo the restore.
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

    if (!scope)
      throw new Error(
        `Timeline scope "${args.scope}" not found. Use push() to create a new scope.`,
      );

    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (!checkpoint)
      throw new Error(
        `Checkpoint "${args.name}" not found in scope "${args.scope}". Use createCheckpoint() to create a checkpoint.`,
      );

    const newIndex = await pruneAheadAndInsert(
      ctx,
      scope._id,
      scope.head,
      checkpoint.document,
    );

    await ctx.db.patch(scope._id, { head: newIndex });

    if (args.maxNodes !== undefined) {
      await pruneOldestIfNeeded(ctx, scope._id, args.maxNodes);
    }

    return checkpoint.document;
  },
});

/** List all checkpoints for a scope with their names and positions. */
export const listCheckpoints = query({
  args: { scope: v.string() },
  returns: v.array(
    v.object({ name: v.string(), position: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return [];

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    return checkpoints.map((c) => ({ name: c.name, position: c.position }));
  },
});

/** Delete a checkpoint. */
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

    if (!scope) return null;

    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    if (checkpoint) await ctx.db.delete(checkpoint._id);

    return null;
  },
});

/**
 * Clear all nodes from a scope, resetting head to null.
 * Checkpoints are preserved.
 */
export const clear = mutation({
  args: { scope: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return null;

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    await ctx.db.patch(scope._id, { head: null });

    return null;
  },
});

/** Get a checkpoint's document without restoring it. */
export const getCheckpointDocument = query({
  args: {
    scope: v.string(),
    name: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return null;

    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope_name", (q) =>
        q.eq("scope", scope._id).eq("name", args.name),
      )
      .unique();

    return checkpoint?.document ?? null;
  },
});

/** Delete a scope and all its data (nodes, checkpoints, and scope record). */
export const deleteScope = mutation({
  args: { scope: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return null;

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_scope", (q) => q.eq("scope", scope._id))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
    }

    await ctx.db.delete(scope._id);

    return null;
  },
});

/**
 * Get document at a specific position without moving head.
 * Returns null for negative positions or out-of-bounds.
 */
export const getDocumentAtPosition = query({
  args: {
    scope: v.string(),
    position: v.number(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    // 0-indexed: position 0 is valid, negative is not
    if (args.position < 0) return null;

    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return null;

    const node = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) =>
        q.eq("scope", scope._id).eq("index", args.position),
      )
      .unique();

    return node?.document ?? null;
  },
});

/**
 * List all nodes for a scope with their positions.
 * Returns array of { position, document } sorted by position.
 */
export const listNodes = query({
  args: { scope: v.string() },
  returns: v.array(
    v.object({
      position: v.number(),
      document: v.any(),
    }),
  ),
  handler: async (ctx, args) => {
    const scope = await ctx.db
      .query("scopes")
      .withIndex("by_name", (q) => q.eq("name", args.scope))
      .unique();

    if (!scope) return [];

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_scope_index", (q) => q.eq("scope", scope._id))
      .order("asc")
      .collect();

    return nodes.map((node) => ({
      position: node.index,
      document: node.document,
    }));
  },
});
