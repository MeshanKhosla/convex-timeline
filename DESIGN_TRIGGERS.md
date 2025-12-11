# Design Document: Automatic Timeline Tracking with Triggers

## Overview

This document proposes adding an optional trigger system to `convex-timeline`
that automatically tracks state changes to Convex tables, eliminating the need
for manual `timeline.push()` calls in every mutation.

## Motivation

### Current State (Explicit API)

Users must manually call `timeline.push()` after every state change:

```typescript
export const addTodo = mutation({
  handler: async (ctx, args) => {
    // Business logic
    const newItems = [...list.items, newTodo];
    await ctx.db.patch(args.todoListId, { items: newItems });

    // Manual tracking - easy to forget
    await timeline.push(ctx, `todos:${args.todoListId}`, newItems);
  },
});
```

**Problems:**

- Easy to forget tracking calls
- Boilerplate in every mutation
- Inconsistent tracking if some mutations miss it
- Users must remember to track after every change

### Proposed State (Trigger-Based)

Users can optionally enable automatic tracking:

```typescript
// Setup once
const triggers = new Triggers<DataModel>();
triggers.register("todoLists", timeline.trigger("todos"));
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

// Mutations automatically tracked - no manual push() needed
export const addTodo = mutation({
  handler: async (ctx, args) => {
    const newItems = [...list.items, newTodo];
    await ctx.db.patch(args.todoListId, { items: newItems });
    // Timeline automatically updated via trigger
  },
});
```

**Benefits:**

- Automatic tracking - can't forget
- Less boilerplate
- Consistent tracking across all mutations
- Setup once, works everywhere

## Design Goals

1. **Optional**: Triggers should be opt-in, not required
2. **Flexible**: Support different scope naming strategies
3. **Performant**: Minimal overhead when enabled
4. **Composable**: Work with existing explicit API
5. **Type-safe**: Leverage TypeScript for safety

## API Design

### Component API

Add a new method to the Timeline component:

````typescript
class Timeline<TimelineScope extends string = string> {
  /**
   * Creates a trigger function that automatically tracks changes to a table.
   *
   * @param scopeStrategy - How to generate scope names from document IDs
   *   - String: Prefix for all documents (e.g., "todos:" → "todos:abc123")
   *   - Function: Custom scope generator (id) => scope
   *
   * @returns A trigger function that can be registered with Triggers
   *
   * @example
   * ```ts
   * const triggers = new Triggers<DataModel>();
   * triggers.register("todoLists", timeline.trigger("todos:"));
   * ```
   */
  trigger(
    scopeStrategy: string | ((id: Id<any>) => TimelineScope),
  ): (ctx: TriggerCtx, change: TableChange) => Promise<void>;
}
````

### Scope Strategy Options

**Option 1: String Prefix (Simple)**

```typescript
timeline.trigger("todos:");
// Document ID "abc123" → scope "todos:abc123"
```

**Option 2: Function (Flexible)**

```typescript
timeline.trigger((id: Id<"todoLists">) => `todos:${id}`);
// Full control over scope naming
```

**Option 3: Per-Table Configuration**

```typescript
timeline.trigger({
  todoLists: (id) => `todos:${id}`,
  documents: (id) => `docs:${id}`,
});
```

We'll start with Options 1 and 2 for simplicity.

## Implementation Details

### Trigger Function

```typescript
trigger(
  scopeStrategy: string | ((id: Id<any>) => TimelineScope)
): (ctx: TriggerCtx, change: TableChange) => Promise<void> {
  const getScope = typeof scopeStrategy === "string"
    ? (id: Id<any>) => `${scopeStrategy}${id}` as TimelineScope
    : scopeStrategy;

  return async (ctx: TriggerCtx, change: TableChange) => {
    const scope = getScope(change.id);

    switch (change.type) {
      case "insert":
      case "update": {
        const doc = await ctx.db.get(change.id);
        if (doc) {
          await this.push(ctx, scope, doc);
        }
        break;
      }
      case "delete": {
        // Push null to represent deletion
        await this.push(ctx, scope, null);
        break;
      }
    }
  };
}
```

### Integration with Convex Triggers

Users will need to set up triggers in their `convex.config.ts` or mutation
wrapper:

```typescript
import { Triggers } from "convex/server";
import { customMutation, customCtx } from "convex/server";

const triggers = new Triggers<DataModel>();
const timeline = new Timeline(components.timeline);

// Register trigger for each table
triggers.register("todoLists", timeline.trigger("todos:"));
triggers.register("documents", timeline.trigger("docs:"));

// Wrap mutations
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

## Behavior Details

### What Gets Tracked

- **Insert**: Full document state is pushed
- **Update**: Full document state after update is pushed
- **Delete**: `null` is pushed to represent deletion

### Scope Naming

The scope is generated from the document ID using the provided strategy. This
ensures:

- Each document has its own timeline
- Scopes are consistent across operations
- Multiple tables can use different naming strategies

### Interaction with Explicit API

Triggers and explicit `push()` calls can coexist:

```typescript
// Automatic tracking via trigger
await ctx.db.patch(id, { items: newItems });
// → Automatically pushed to timeline

// Manual push still works
await timeline.push(ctx, "custom-scope", customState);
// → Works independently
```

### Performance Considerations

1. **Overhead**: One extra query per mutation (to get document after change)
2. **Batching**: Triggers run in the same transaction, so no extra round-trips
3. **Selective Tracking**: Users can still use explicit API for
   performance-critical paths

## Edge Cases

### Empty Scope Names

```typescript
// Should validate
timeline.trigger(""); // Error: scope prefix cannot be empty
```

### Concurrent Modifications

- Triggers run in the same transaction, so no race conditions
- If document is deleted between trigger and get, handle gracefully

### Nested Transactions

- Triggers should work correctly with nested transactions
- Each transaction gets its own timeline entry

### maxNodes Configuration

- Triggers respect the `maxNodesPerScope` configuration
- Pruning happens automatically when limits are reached

## Examples

### Example 1: Simple Todo List

```typescript
// Setup
const timeline = new Timeline(components.timeline, {
  maxNodesPerScope: 100,
});
const triggers = new Triggers<DataModel>();
triggers.register("todoLists", timeline.trigger("todos:"));

// Mutations (no manual tracking needed)
export const addTodo = mutation({
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.todoListId);
    await ctx.db.patch(args.todoListId, {
      items: [...list.items, newTodo],
    });
    // Automatically tracked!
  },
});
```

### Example 2: Multiple Tables

```typescript
const triggers = new Triggers<DataModel>();

// Different scope strategies per table
triggers.register("todoLists", timeline.trigger("todos:"));
triggers.register(
  "documents",
  timeline.trigger((id) => `doc:${id}`),
);
triggers.register("users", timeline.trigger("user:"));

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

### Example 3: Mixed Approach

```typescript
// Some tables use triggers
triggers.register("todoLists", timeline.trigger("todos:"));

// Some mutations use explicit tracking
export const bulkUpdate = mutation({
  handler: async (ctx, args) => {
    // Multiple changes, track once at the end
    for (const change of args.changes) {
      await ctx.db.patch(change.id, change.patch);
    }
    await timeline.push(ctx, "bulk-update", finalState);
  },
});
```

## Migration Path

### For Existing Users

1. **No Breaking Changes**: Existing explicit API continues to work
2. **Opt-in**: Users can gradually adopt triggers
3. **Coexistence**: Can use both approaches in the same app

### Migration Steps

1. Install updated package
2. Set up triggers (optional)
3. Remove manual `push()` calls (optional)
4. Test that undo/redo still works

## Future Enhancements

### 1. Conditional Tracking

```typescript
timeline.trigger("todos:", {
  shouldTrack: (change) => {
    // Only track if items actually changed
    return change.type === "update" && change.field === "items";
  },
});
```

### 2. Custom Document Transformation

```typescript
timeline.trigger("todos:", {
  transform: (doc) => {
    // Only track specific fields
    return { items: doc.items };
  },
});
```

### 3. Batch Tracking

```typescript
timeline.trigger("todos:", {
  batch: true, // Collect multiple changes, push once
});
```

### 4. Attribution Support

```typescript
timeline.trigger("todos:", {
  attribution: async (ctx) => ({
    userId: (await ctx.auth.getUserIdentity())?.subject,
    timestamp: Date.now(),
  }),
});
```

## Alternatives Considered

### Alternative 1: Middleware Pattern

Instead of triggers, use middleware:

```typescript
const timelineMiddleware = timeline.middleware("todos:");
export const mutation = timelineMiddleware(rawMutation);
```

**Rejected**: Less flexible, harder to compose with other middleware.

### Alternative 2: Decorator Pattern

```typescript
@TimelineTrack("todos:")
export const addTodo = mutation({ ... });
```

**Rejected**: Requires decorator support, less explicit.

### Alternative 3: Wrapper Function

```typescript
export const addTodo = timeline.track("todos:", mutation({ ... }));
```

**Rejected**: Changes mutation signature, harder to type.

## Testing Strategy

1. **Unit Tests**: Test trigger function in isolation
2. **Integration Tests**: Test with actual Convex triggers
3. **Edge Cases**: Test concurrent modifications, deletions, etc.
4. **Performance Tests**: Measure overhead of trigger system

## Open Questions

1. **Should triggers respect `maxNodesPerScope`?** ✅ Yes
2. **Should we support filtering which changes to track?** Future enhancement
3. **How to handle errors in triggers?** Fail the mutation (current Convex
   behavior)
4. **Should triggers be async?** Yes, they already are

## Conclusion

Adding triggers to `convex-timeline` provides a convenient way to automatically
track state changes while maintaining the flexibility of the explicit API. The
design is:

- **Simple**: Easy to understand and use
- **Flexible**: Supports multiple scope strategies
- **Non-breaking**: Existing code continues to work
- **Performant**: Minimal overhead when enabled

This enhancement makes the component more accessible to users who want automatic
tracking without sacrificing the power and control of the explicit API.
