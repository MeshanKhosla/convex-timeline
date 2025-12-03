import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Scopes track the current head position in each timeline
  scopes: defineTable({
    name: v.string(),
    head: v.number(), // Current head position (0 = before any nodes)
  }).index("by_name", ["name"]),

  // Nodes are state snapshots in the timeline graph
  nodes: defineTable({
    scope: v.id("scopes"),
    document: v.any(),
    index: v.number(), // Position in timeline (1 = root, increments from there)
  })
    .index("by_scope", ["scope"])
    .index("by_scope_index", ["scope", "index"]),

  // Checkpoints are named snapshots independent of the timeline
  // They persist even when nodes are pruned
  checkpoints: defineTable({
    scope: v.id("scopes"),
    name: v.string(),
    document: v.any(),
  })
    .index("by_scope", ["scope"])
    .index("by_scope_name", ["scope", "name"]),
});
