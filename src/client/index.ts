import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

/**
 * Timeline status returned by status()
 */
export interface TimelineStatus {
  canUndo: boolean;
  canRedo: boolean;
  position: number;
  length: number;
}

/**
 * Timeline component for undo/redo state management.
 *
 * Maintains a linear history of state snapshots organized by scope.
 * Supports named checkpoints that persist independently of the timeline.
 *
 * Terminology:
 * - Node: A state snapshot in the timeline
 * - Head: Current position (cursor) in the timeline
 * - Root: First node (position 1)
 * - Leaf: Most recent node
 * - Prune: Remove nodes ahead of head when pushing after undo
 *
 * @example
 * ```ts
 * import { Timeline } from "convex-timeline";
 * import { components } from "./_generated/api";
 *
 * const timeline = new Timeline(components.timeline);
 *
 * // In a mutation:
 * await timeline.push(ctx, "doc:123", { text: "Hello" });
 * const prev = await timeline.undo(ctx, "doc:123");
 * ```
 */
export class Timeline<TimelineScope extends string = string> {
  private maxNodesForScope: (scope: TimelineScope) => number | undefined;

  /**
   * Create a new Timeline instance.
   *
   * @param component - The timeline component API from components.timeline
   * @param options - Configuration options
   * @param options.maxNodesPerScope - Maximum nodes to retain per scope (default: unlimited).
   *   Can be a number (applies to all scopes) or a record mapping scope prefixes to limits.
   *   When using a record, keys are treated as prefixes and the longest matching prefix wins.
   *
   * @example
   * ```ts
   * // Unlimited history
   * const timeline = new Timeline(components.timeline);
   *
   * // Limit all scopes to 100 nodes
   * const timeline = new Timeline(components.timeline, {
   *   maxNodesPerScope: 100,
   * });
   *
   * // Different limits by prefix
   * const timeline = new Timeline(components.timeline, {
   *   maxNodesPerScope: {
   *     "doc:": 200,      // doc:123, doc:456, etc.
   *     "scratch:": 50,   // scratch:123, scratch:456, etc.
   *   },
   * });
   * ```
   */
  constructor(
    public component: ComponentApi,
    public options?: {
      maxNodesPerScope?: number | Record<string, number>;
    },
  ) {
    this.maxNodesForScope = (scope: TimelineScope) => {
      if (options?.maxNodesPerScope === undefined) {
        return undefined;
      }
      if (typeof options.maxNodesPerScope === "number") {
        return options.maxNodesPerScope;
      }
      // Find the longest matching prefix
      let bestMatch: { prefix: string; limit: number } | undefined;
      for (const [prefix, limit] of Object.entries(options.maxNodesPerScope)) {
        if (scope.startsWith(prefix)) {
          if (!bestMatch || prefix.length > bestMatch.prefix.length) {
            bestMatch = { prefix, limit };
          }
        }
      }
      return bestMatch?.limit;
    };
  }

  /**
   * Push a new state onto the timeline.
   *
   * If head is not at the leaf (after undo), nodes ahead of head are pruned.
   *
   * ```
   * Before: [A:1] -- [B:2] -- [C:3]  head=2 (after undo)
   * push(D)
   * After:  [A:1] -- [B:2] -- [D:3]  head=3 (C pruned)
   * ```
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param state - State to push
   */
  async push<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    state: unknown,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.push, {
      scope,
      document: state,
      maxNodes: this.maxNodesForScope(scope),
    });
  }

  /**
   * Move head backward in the timeline.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param count - Number of positions to move backward (default: 1)
   * @returns State at new head position, or null if at position 0
   */
  async undo<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    count: number = 1,
  ): Promise<unknown | null> {
    return await ctx.runMutation(this.component.lib.undo, {
      scope,
      count,
    });
  }

  /**
   * Move head forward in the timeline.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param count - Number of positions to move forward (default: 1)
   * @returns State at new head position, or null if already at leaf
   */
  async redo<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    count: number = 1,
  ): Promise<unknown | null> {
    return await ctx.runMutation(this.component.lib.redo, {
      scope,
      count,
    });
  }

  /**
   * Get the current state without modifying the timeline.
   *
   * @param ctx - Query or mutation context
   * @param scope - Timeline scope identifier
   * @returns Current state, or null if at position 0
   */
  async current<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<unknown | null> {
    return await ctx.runQuery(this.component.lib.getCurrent, {
      scope,
    });
  }

  /**
   * Get timeline status including navigation availability.
   *
   * @param ctx - Query or mutation context
   * @param scope - Timeline scope identifier
   * @returns Status object with canUndo, canRedo, position, and length
   */
  async status<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<TimelineStatus> {
    return await ctx.runQuery(this.component.lib.getStatus, {
      scope,
    });
  }

  /**
   * Create a named checkpoint of the current state.
   *
   * Checkpoints are independent snapshots that persist even when
   * timeline nodes are pruned. Use checkpoints to save important
   * states that you may want to restore later.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param name - Checkpoint name (must be unique within scope)
   */
  async checkpoint<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    name: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.checkpoint, {
      scope,
      name,
    });
  }

  /**
   * Restore a checkpoint by pushing its state as a new node.
   *
   * This is non-destructive: the checkpoint state is pushed as a new
   * node, so you can undo the restore operation.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param name - Checkpoint name to restore
   * @returns The restored state
   */
  async restoreCheckpoint<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    name: string,
  ): Promise<unknown> {
    return await ctx.runMutation(this.component.lib.restoreCheckpoint, {
      scope,
      name,
      maxNodes: this.maxNodesForScope(scope),
    });
  }

  /**
   * Get a checkpoint's document without restoring it.
   *
   * @param ctx - Query or mutation context
   * @param scope - Timeline scope identifier
   * @param name - Checkpoint name to retrieve
   * @returns The checkpoint's document, or null if not found
   */
  async getCheckpoint<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
    name: string,
  ): Promise<unknown | null> {
    return await ctx.runQuery(this.component.lib.getCheckpoint, {
      scope,
      name,
    });
  }

  /**
   * List all checkpoint names for a scope.
   *
   * @param ctx - Query or mutation context
   * @param scope - Timeline scope identifier
   * @returns Array of checkpoint names
   */
  async getCheckpoints<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<string[]> {
    return await ctx.runQuery(this.component.lib.getCheckpoints, {
      scope,
    });
  }

  /**
   * Delete a checkpoint.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   * @param name - Checkpoint name to delete
   */
  async deleteCheckpoint<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    name: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.deleteCheckpoint, {
      scope,
      name,
    });
  }

  /**
   * Clear all nodes from a scope, resetting head to 0.
   *
   * Checkpoints are preserved. Returns without error for non-existent scopes.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   */
  async clear<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.clear, {
      scope,
    });
  }

  /**
   * Delete a scope and all its data (nodes, checkpoints, and scope record).
   *
   * Returns without error for non-existent scopes.
   *
   * @param ctx - Mutation context
   * @param scope - Timeline scope identifier
   */
  async deleteScope<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.deleteScope, {
      scope,
    });
  }

  /**
   * Create a scoped facade with the scope pre-bound.
   *
   * Useful when working with a single scope repeatedly.
   *
   * @param scope - Timeline scope identifier
   * @returns Object with all timeline methods, scope pre-bound
   *
   * @example
   * ```ts
   * const docTimeline = timeline.for("doc:123");
   *
   * await docTimeline.push(ctx, { text: "Hello" });
   * await docTimeline.undo(ctx);
   * await docTimeline.checkpoint(ctx, "v1");
   * ```
   */
  for<Scope extends TimelineScope>(scope: Scope) {
    return {
      push: (ctx: MutationCtx, state: unknown) => this.push(ctx, scope, state),
      undo: (ctx: MutationCtx, count?: number) => this.undo(ctx, scope, count),
      redo: (ctx: MutationCtx, count?: number) => this.redo(ctx, scope, count),
      current: (ctx: QueryCtx) => this.current(ctx, scope),
      status: (ctx: QueryCtx) => this.status(ctx, scope),
      checkpoint: (ctx: MutationCtx, name: string) =>
        this.checkpoint(ctx, scope, name),
      restoreCheckpoint: (ctx: MutationCtx, name: string) =>
        this.restoreCheckpoint(ctx, scope, name),
      getCheckpoint: (ctx: QueryCtx, name: string) =>
        this.getCheckpoint(ctx, scope, name),
      getCheckpoints: (ctx: QueryCtx) => this.getCheckpoints(ctx, scope),
      deleteCheckpoint: (ctx: MutationCtx, name: string) =>
        this.deleteCheckpoint(ctx, scope, name),
      clear: (ctx: MutationCtx) => this.clear(ctx, scope),
      deleteScope: (ctx: MutationCtx) => this.deleteScope(ctx, scope),
    };
  }
}
