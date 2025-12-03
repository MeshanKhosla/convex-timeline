import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("create todo list", async () => {
    const t = initConvexTest();
    const listId = await t.mutation(api.example.createTodoList, {
      name: "My List",
    });
    expect(listId).toBeDefined();

    const lists = await t.query(api.example.getTodoLists, {});
    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("My List");
  });

  test("add todo and undo", async () => {
    const t = initConvexTest();
    const listId = await t.mutation(api.example.createTodoList, {
      name: "My List",
    });

    await t.mutation(api.example.addTodo, {
      todoListId: listId,
      text: "Buy milk",
    });

    let todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("Buy milk");

    await t.mutation(api.example.undo, { todoListId: listId });

    todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(0);
  });

  test("undo and redo", async () => {
    const t = initConvexTest();
    const listId = await t.mutation(api.example.createTodoList, {
      name: "My List",
    });

    await t.mutation(api.example.addTodo, { todoListId: listId, text: "A" });
    await t.mutation(api.example.addTodo, { todoListId: listId, text: "B" });

    let todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(2);

    await t.mutation(api.example.undo, { todoListId: listId });
    todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("A");

    await t.mutation(api.example.redo, { todoListId: listId });
    todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(2);
  });

  test("checkpoint and restore", async () => {
    const t = initConvexTest();
    const listId = await t.mutation(api.example.createTodoList, {
      name: "My List",
    });

    await t.mutation(api.example.addTodo, { todoListId: listId, text: "A" });
    await t.mutation(api.example.saveCheckpoint, {
      todoListId: listId,
      name: "v1",
    });

    await t.mutation(api.example.addTodo, { todoListId: listId, text: "B" });
    await t.mutation(api.example.addTodo, { todoListId: listId, text: "C" });

    let todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(3);

    await t.mutation(api.example.restoreCheckpoint, {
      todoListId: listId,
      name: "v1",
    });

    todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("A");

    // Can undo the restore
    await t.mutation(api.example.undo, { todoListId: listId });
    todos = await t.query(api.example.getTodos, { todoListId: listId });
    expect(todos).toHaveLength(3);
  });
});
