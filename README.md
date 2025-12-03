# Convex Timeline

A Convex component for undo/redo state management with named checkpoints.

## Overview

Timeline maintains a linear history of state snapshots organized by scope. It
provides:

- **Undo/Redo**: Navigate backward and forward through state history
- **Checkpoints**: Named snapshots that persist independently of the timeline
- **Automatic Pruning**: Configurable limits to prevent unbounded growth

## Installation

```sh
npm install convex-timeline
```

Add the component to your Convex app:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config.js";

const app = defineApp();
app.use(timeline);

export default app;
```

## Quick Start

```ts
// convex/example.ts
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Timeline } from "convex-timeline";
import { v } from "convex/values";

const timeline = new Timeline(components.timeline);

export const updateDocument = mutation({
  args: { docId: v.id("documents"), content: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const docTimeline = timeline.for(`doc:${args.docId}`);

    await ctx.db.patch(args.docId, { content: args.content });
    // Also push the change to the timeline scope
    await docTimeline.push(ctx, args.content);
    return null;
  },
});

export const undo = mutation({
  args: { docId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const docTimeline = timeline.for(`doc:${args.docId}`);

    const content = await docTimeline.undo(ctx);
    if (content !== null) {
      await ctx.db.patch(args.docId, { content: content as string });
    }
    return null;
  },
});

export const redo = mutation({
  args: { docId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const docTimeline = timeline.for(`doc:${args.docId}`);

    const content = await docTimeline.redo(ctx);
    if (content !== null) {
      await ctx.db.patch(args.docId, { content: content as string });
    }
    return null;
  },
});

export const getStatus = query({
  args: { docId: v.id("documents") },
  returns: v.object({
    canUndo: v.boolean(),
    canRedo: v.boolean(),
    position: v.number(),
    length: v.number(),
  }),
  handler: async (ctx, args) => {
    return await timeline.for(`doc:${args.docId}`).status(ctx);
  },
});
```

## API Reference

### Constructor

```ts
// Unlimited history (default)
const timeline = new Timeline(components.timeline);

// Limit all scopes to 100 nodes
const timeline = new Timeline(components.timeline, {
  maxNodesPerScope: 100,
});

// Different limits by prefix (longest matching prefix wins)
const timeline = new Timeline(components.timeline, {
  maxNodesPerScope: {
    "doc:": 200, // matches doc:123, doc:456, etc.
    "scratch:": 50, // matches scratch:abc, scratch:xyz, etc.
  },
});
```

Options:

- `maxNodesPerScope`: Maximum nodes to retain per scope. When a push would
  exceed this limit, the oldest nodes are pruned to make room. Can be a number
  (applies to all scopes) or a record mapping scope prefixes to limits. When
  using a record, the longest matching prefix determines the limit.

### Core Methods

#### `push(ctx, scope, state)`

Push a new state onto the timeline. If the head is not at the leaf (after undo),
nodes ahead of head are pruned first.

```ts
await timeline.push(ctx, "doc:123", { text: "Hello" });
```

#### `undo(ctx, scope, count?)`

Move head backward. Returns the state at the new position, or `null` if at
position 0.

```ts
const previousState = await timeline.undo(ctx, "doc:123");
const twoBack = await timeline.undo(ctx, "doc:123", 2);
```

#### `redo(ctx, scope, count?)`

Move head forward. Returns the state at the new position, or `null` if already
at leaf.

```ts
const nextState = await timeline.redo(ctx, "doc:123");
```

#### `current(ctx, scope)`

Get the current state without modifying the timeline.

```ts
const state = await timeline.current(ctx, "doc:123");
```

#### `status(ctx, scope)`

Get timeline status for UI state.

```ts
const { canUndo, canRedo, position, length } = await timeline.status(
  ctx,
  "doc:123",
);
```

### Checkpoint Methods

Checkpoints are named snapshots stored independently of the timeline. They
persist even when nodes are pruned.

#### `checkpoint(ctx, scope, name)`

Save the current state as a named checkpoint.

```ts
await timeline.checkpoint(ctx, "doc:123", "before-refactor");
```

#### `restoreCheckpoint(ctx, scope, name)`

Restore a checkpoint by pushing its state as a new node. This is
non-destructive - you can undo the restore.

```ts
const state = await timeline.restoreCheckpoint(
  ctx,
  "doc:123",
  "before-refactor",
);
```

#### `getCheckpoints(ctx, scope)`

List all checkpoint names for a scope.

```ts
const names = await timeline.getCheckpoints(ctx, "doc:123");
// ["before-refactor", "v1", "v2"]
```

#### `deleteCheckpoint(ctx, scope, name)`

Delete a checkpoint.

```ts
await timeline.deleteCheckpoint(ctx, "doc:123", "before-refactor");
```

### Scoped Facade

For convenience when working with a single scope:

```ts
const docTimeline = timeline.for("doc:123");

await docTimeline.push(ctx, newState);
await docTimeline.undo(ctx);
await docTimeline.checkpoint(ctx, "v1");
```

## Terminology

| Term       | Description                               |
| ---------- | ----------------------------------------- |
| Node       | A state snapshot in the timeline          |
| Head       | Current position (cursor) in the timeline |
| Root       | First node (position 1)                   |
| Leaf       | Most recent node                          |
| Prune      | Remove nodes ahead of head when pushing   |
| Checkpoint | Named snapshot independent of timeline    |

## Behavior

### Timeline Structure

```
Initial state after three pushes:

    [ A ] ----> [ B ] ----> [ C ]
      1           2           3
                             head

After undo (head moves back, C still exists):

    [ A ] ----> [ B ] ----> [ C ]
      1           2           3
                 head

After push(D) (C is pruned, D takes its place):

    [ A ] ----> [ B ] ----> [ D ]
      1           2           3
                             head
```

### Checkpoints

Checkpoints are stored separately from the timeline and persist through pruning:

```
    [ A ] ----> [ B ] ----> [ C ]
                             head
                              |
                  checkpoint("v1") saves C's state
                              |
                              v
                   +------------------+
                   | Checkpoint Store |
                   | "v1" -> C        |
                   +------------------+

Even after C is pruned, checkpoint "v1" still holds C's state.
```

### Restoring Checkpoints

Restoring a checkpoint pushes that state as a new node. This means you can undo
a restore to get back to where you were before:

```
1. Create checkpoint "v1" at C:

    [ A ] ----> [ B ] ----> [ C ]       Checkpoints: { "v1": C }
                            head

2. Push more states:

    [ A ] ----> [ B ] ----> [ C ] ----> [ D ] ----> [ E ]
                                                    head

3. Restore checkpoint "v1" (pushes C as new node):

    [ A ] ----> [ B ] ----> [ C ] ----> [ D ] ----> [ E ] ----> [ C' ]
                                                                head

4. Undo the restore (back to E):

    [ A ] ----> [ B ] ----> [ C ] ----> [ D ] ----> [ E ] ----> [ C' ]
                                                    head
```

### Return Values

- `null` from `undo()`/`redo()`/`current()` means position 0 (before any state)
- If `status().canUndo` is true, `undo()` will return non-null
- If `status().canRedo` is true, `redo()` will return non-null

## Example

See the [example](./example) directory for a complete todo app with undo/redo
and checkpoints.

```sh
cd example
npm install
npm run dev
```

## License

MIT
