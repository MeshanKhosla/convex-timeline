import "./App.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  const todoLists = useQuery(api.example.getTodoLists);
  const createList = useMutation(api.example.createTodoList);
  const [newListName, setNewListName] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"todoLists"> | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const id = await createList({ name: newListName.trim() });
    setNewListName("");
    setSelectedId(id);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Todo Lists</h1>
        <p>With undo/redo powered by Timeline</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <span className="sidebar-header">Lists</span>

          <form className="create-form" onSubmit={handleCreate}>
            <input
              type="text"
              placeholder="New list name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button type="submit">Create List</button>
          </form>

          <div className="lists">
            {todoLists?.map((list) => (
              <button
                key={list._id}
                className={`list-button ${selectedId === list._id ? "active" : ""}`}
                onClick={() => setSelectedId(list._id)}
              >
                {list.name}
              </button>
            ))}
          </div>
        </aside>

        <main className="main-panel">
          {selectedId ? (
            <TodoPanel listId={selectedId} />
          ) : (
            <div className="empty-state">
              Select a list or create a new one
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function TodoPanel({ listId }: { listId: Id<"todoLists"> }) {
  const todos = useQuery(api.example.getTodos, { todoListId: listId });
  const status = useQuery(api.example.getTimelineStatus, { todoListId: listId });
  const checkpoints = useQuery(api.example.getCheckpoints, { todoListId: listId });
  const addTodo = useMutation(api.example.addTodo);
  const updateTodo = useMutation(api.example.updateTodo);
  const deleteTodo = useMutation(api.example.deleteTodo);
  const undo = useMutation(api.example.undo);
  const redo = useMutation(api.example.redo);
  const saveCheckpoint = useMutation(api.example.saveCheckpoint);
  const restoreCheckpoint = useMutation(api.example.restoreCheckpoint);
  const deleteCheckpoint = useMutation(api.example.deleteCheckpoint);

  const [newTodo, setNewTodo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [checkpointName, setCheckpointName] = useState("");

  if (todos === undefined || status === undefined) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading...
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    await addTodo({ todoListId: listId, text: newTodo.trim() });
    setNewTodo("");
  };

  const handleToggle = (id: string, completed: boolean) => {
    updateTodo({ todoListId: listId, todoId: id, completed: !completed });
  };

  const handleEdit = (id: string, text: string) => {
    setEditId(id);
    setEditText(text);
  };

  const handleSave = async () => {
    if (!editId || !editText.trim()) return;
    await updateTodo({ todoListId: listId, todoId: editId, text: editText.trim() });
    setEditId(null);
    setEditText("");
  };

  const handleCancel = () => {
    setEditId(null);
    setEditText("");
  };

  const handleSaveCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointName.trim()) return;
    await saveCheckpoint({ todoListId: listId, name: checkpointName.trim() });
    setCheckpointName("");
  };

  return (
    <div className="todo-panel">
      <div className="todo-toolbar">
        <h2 className="todo-title">Todos</h2>
        <div className="toolbar-actions">
          <span className="position-indicator">
            {status.position} / {status.length}
          </span>
          <button
            className="toolbar-btn"
            onClick={() => undo({ todoListId: listId })}
            disabled={!status.canUndo}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5" />
            </svg>
            Undo
          </button>
          <button
            className="toolbar-btn"
            onClick={() => redo({ todoListId: listId })}
            disabled={!status.canRedo}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-5-5M21 10l-5 5" />
            </svg>
            Redo
          </button>
        </div>
      </div>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Add a new todo..."
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <div className="todo-list">
        {todos.length === 0 ? (
          <div className="todo-empty">No todos yet</div>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} className="todo-item">
              <input
                type="checkbox"
                className="todo-checkbox"
                checked={todo.completed}
                onChange={() => handleToggle(todo.id, todo.completed)}
              />

              {editId === todo.id ? (
                <form
                  className="edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                  }}
                >
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="save-btn">Save</button>
                  <button type="button" className="cancel-btn" onClick={handleCancel}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`todo-text ${todo.completed ? "completed" : ""}`}
                    onDoubleClick={() => handleEdit(todo.id, todo.text)}
                  >
                    {todo.text}
                  </span>
                  <div className="todo-actions">
                    <button
                      className="action-btn"
                      onClick={() => handleEdit(todo.id, todo.text)}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn danger"
                      onClick={() => deleteTodo({ todoListId: listId, todoId: todo.id })}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="checkpoints-section">
        <h3 className="checkpoints-title">Checkpoints</h3>
        <form className="checkpoint-form" onSubmit={handleSaveCheckpoint}>
          <input
            type="text"
            placeholder="Checkpoint name..."
            value={checkpointName}
            onChange={(e) => setCheckpointName(e.target.value)}
            disabled={status.position === 0}
          />
          <button type="submit" disabled={status.position === 0}>
            Save
          </button>
        </form>
        {checkpoints && checkpoints.length > 0 && (
          <div className="checkpoint-list">
            {checkpoints.map((name) => (
              <div key={name} className="checkpoint-item">
                <span className="checkpoint-name">{name}</span>
                <div className="checkpoint-actions">
                  <button
                    className="action-btn"
                    onClick={() => restoreCheckpoint({ todoListId: listId, name })}
                  >
                    Restore
                  </button>
                  <button
                    className="action-btn danger"
                    onClick={() => deleteCheckpoint({ todoListId: listId, name })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
