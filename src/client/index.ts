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

export interface TimelineStatus {
  canUndo: boolean;
  canRedo: boolean;
  position: number;
  length: number;
}

export interface Checkpoint {
  name: string;
  position: number | null;
}

/**
 * Timeline component for undo/redo state management.
 *
 * Maintains a linear history of state snapshots organized by scope.
 * Supports named checkpoints that persist independently of the timeline.
 *
 * @example
 * ```ts
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
   * @param component - The timeline component API from components.timeline
   * @param options.maxNodesPerScope - Max nodes per scope. Can be a number or
   *   a record mapping scope prefixes to limits (longest matching prefix wins).
   */
  constructor(
    public component: ComponentApi,
    public options?: {
      maxNodesPerScope?: number | Record<string, number>;
    },
  ) {
    this.maxNodesForScope = (scope: TimelineScope) => {
      if (options?.maxNodesPerScope === undefined) return undefined;
      if (typeof options.maxNodesPerScope === "number") {
        return options.maxNodesPerScope;
      }
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
   * If head is not at the leaf (after undo), nodes ahead of head are pruned.
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

  /** Move head backward. Returns state at new position, or null if at position 0. */
  async undo<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    count: number = 1,
  ): Promise<unknown | null> {
    return await ctx.runMutation(this.component.lib.undo, { scope, count });
  }

  /** Move head forward. Returns state at new position, or null if at leaf. */
  async redo<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    count: number = 1,
  ): Promise<unknown | null> {
    return await ctx.runMutation(this.component.lib.redo, { scope, count });
  }

  /** Get current document without modifying timeline. Null if at position 0. */
  async currentDocument<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<unknown | null> {
    return await ctx.runQuery(this.component.lib.getCurrentDocument, { scope });
  }

  /** Get timeline status: canUndo, canRedo, position, length. */
  async status<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<TimelineStatus> {
    return await ctx.runQuery(this.component.lib.getStatus, { scope });
  }

  /**
   * Create a named checkpoint of the current state.
   * Checkpoints persist even when timeline nodes are pruned.
   */
  async createCheckpoint<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    name: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.createCheckpoint, { scope, name });
  }

  /**
   * Restore a checkpoint by pushing its state as a new node.
   * Non-destructive: you can undo the restore.
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

  /** Get a checkpoint's document without restoring it. */
  async getCheckpointDocument<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
    name: string,
  ): Promise<unknown | null> {
    return await ctx.runQuery(this.component.lib.getCheckpointDocument, {
      scope,
      name,
    });
  }

  /** List all checkpoints for a scope with their names and positions. */
  async listCheckpoints<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<Checkpoint[]> {
    return await ctx.runQuery(this.component.lib.listCheckpoints, { scope });
  }

  /** Delete a checkpoint. */
  async deleteCheckpoint<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
    name: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.deleteCheckpoint, { scope, name });
  }

  /** Clear all nodes from a scope, resetting head to 0. Checkpoints preserved. */
  async clear<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.clear, { scope });
  }

  /** Delete a scope and all its data (nodes, checkpoints, scope record). */
  async deleteScope<Scope extends TimelineScope>(
    ctx: MutationCtx,
    scope: Scope,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.deleteScope, { scope });
  }

  /** Get document at a specific position without moving head. */
  async getDocumentAtPosition<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
    position: number,
  ): Promise<unknown | null> {
    return await ctx.runQuery(this.component.lib.getDocumentAtPosition, {
      scope,
      position,
    });
  }

  /** List all nodes for a scope with their positions and documents. */
  async listNodes<Scope extends TimelineScope>(
    ctx: QueryCtx,
    scope: Scope,
  ): Promise<Array<{ position: number; document: unknown }>> {
    return await ctx.runQuery(this.component.lib.listNodes, { scope });
  }

  /**
   * Create a scoped facade with the scope pre-bound.
   *
   * @example
   * ```ts
   * const docTimeline = timeline.forScope("doc:123");
   * await docTimeline.push(ctx, { text: "Hello" });
   * await docTimeline.undo(ctx);
   * ```
   */
  forScope<Scope extends TimelineScope>(scope: Scope) {
    return {
      push: (ctx: MutationCtx, document: unknown) =>
        this.push(ctx, scope, document),
      undo: (ctx: MutationCtx, count?: number) => this.undo(ctx, scope, count),
      redo: (ctx: MutationCtx, count?: number) => this.redo(ctx, scope, count),
      currentDocument: (ctx: QueryCtx) => this.currentDocument(ctx, scope),
      status: (ctx: QueryCtx) => this.status(ctx, scope),
      createCheckpoint: (ctx: MutationCtx, name: string) =>
        this.createCheckpoint(ctx, scope, name),
      restoreCheckpoint: (ctx: MutationCtx, name: string) =>
        this.restoreCheckpoint(ctx, scope, name),
      getCheckpointDocument: (ctx: QueryCtx, name: string) =>
        this.getCheckpointDocument(ctx, scope, name),
      listCheckpoints: (ctx: QueryCtx) => this.listCheckpoints(ctx, scope),
      deleteCheckpoint: (ctx: MutationCtx, name: string) =>
        this.deleteCheckpoint(ctx, scope, name),
      clear: (ctx: MutationCtx) => this.clear(ctx, scope),
      deleteScope: (ctx: MutationCtx) => this.deleteScope(ctx, scope),
      getDocumentAtPosition: (ctx: QueryCtx, position: number) =>
        this.getDocumentAtPosition(ctx, scope, position),
      listNodes: (ctx: QueryCtx) => this.listNodes(ctx, scope),
    };
  }
}
