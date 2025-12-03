import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  scopes: defineTable({
    name: v.string(),
    head: v.number(), // 0 = before any nodes
  }).index("by_name", ["name"]),

  nodes: defineTable({
    scope: v.id("scopes"),
    document: v.any(),
    index: v.number(), // 1-indexed position in timeline
  })
    .index("by_scope", ["scope"])
    .index("by_scope_index", ["scope", "index"]),

  // Checkpoints persist independently of timeline nodes
  checkpoints: defineTable({
    scope: v.id("scopes"),
    name: v.string(),
    document: v.any(),
    position: v.number(), // Position where checkpoint was created
  })
    .index("by_scope", ["scope"])
    .index("by_scope_name", ["scope", "name"])
    .index("by_scope_position", ["scope", "position"]),
});
