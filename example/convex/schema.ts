import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  todoLists: defineTable({
    name: v.string(),
    // Store todos as an array in a single document - makes undo/redo trivial
    items: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        completed: v.boolean(),
      }),
    ),
  }),
});
