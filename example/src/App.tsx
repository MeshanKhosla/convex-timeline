import "./App.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";
import { Id } from "../convex/_generated/dataModel";
import { TimelineVisualization } from "./TimelineVisualization";

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
        <h1>
          Todo Timeline{" "}
          <span className="header-subtitle">
            - Powered by{" "}
            <a
              href="https://github.com/MeshanKhosla/convex-timeline"
              target="_blank"
              rel="noopener noreferrer"
              className="header-link"
            >
              convex-timeline
            </a>
          </span>
        </h1>
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
            <button type="submit" disabled={!newListName.trim()}>
              Create List
            </button>
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
            <div className="empty-state">Select a list or create a new one</div>
          )}
        </main>
      </div>
    </div>
  );
}

function TodoPanel({ listId }: { listId: Id<"todoLists"> }) {
  const todos = useQuery(api.example.getTodos, { todoListId: listId });
  const status = useQuery(api.example.getTimelineStatus, {
    todoListId: listId,
  });
  const checkpoints = useQuery(api.example.getCheckpoints, {
    todoListId: listId,
  });
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
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);

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

  const handleNavigateToPosition = async (targetPosition: number) => {
    if (status === undefined) return;

    // If already at the target position, do nothing
    if (status.position === targetPosition) return;

    // If current position is null (before any nodes), redo to reach target
    if (status.position === null) {
      await redo({ todoListId: listId, count: targetPosition + 1 });
      return;
    }

    // Calculate the difference
    const diff = targetPosition - status.position;

    if (diff > 0) {
      // Need to redo forward
      await redo({ todoListId: listId, count: diff });
    } else {
      // Need to undo backward
      await undo({ todoListId: listId, count: -diff });
    }
  };

  const handleEdit = (id: string, text: string) => {
    setEditId(id);
    setEditText(text);
  };

  const handleSave = async () => {
    if (!editId || !editText.trim()) return;
    await updateTodo({
      todoListId: listId,
      todoId: editId,
      text: editText.trim(),
    });
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
        <div className="toolbar-actions">
          <button
            className="toolbar-btn"
            onClick={() => undo({ todoListId: listId })}
            disabled={!status.canUndo}
            title="Undo"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5" />
            </svg>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => redo({ todoListId: listId })}
            disabled={!status.canRedo}
            title="Redo"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-5-5M21 10l-5 5" />
            </svg>
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
        <button type="submit" disabled={!newTodo.trim()}>
          Add
        </button>
      </form>

      <div className="todo-list">
        {todos.length === 0 ? (
          <div className="todo-empty">No todos yet</div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="todo-item"
              onClick={() => handleToggle(todo.id, todo.completed)}
            >
              <input
                type="checkbox"
                className="todo-checkbox"
                checked={todo.completed}
                onChange={() => handleToggle(todo.id, todo.completed)}
                onClick={(e) => e.stopPropagation()}
              />

              {editId === todo.id ? (
                <form
                  className="edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="save-btn"
                    disabled={!editText.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`todo-text ${todo.completed ? "completed" : ""}`}
                  >
                    {todo.text}
                  </span>
                  <div
                    className="todo-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="action-btn"
                      onClick={() => handleEdit(todo.id, todo.text)}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn danger"
                      onClick={() =>
                        deleteTodo({ todoListId: listId, todoId: todo.id })
                      }
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
            disabled={status.position === null}
          />
          <button
            type="submit"
            disabled={status.position === null || !checkpointName.trim()}
          >
            Save
          </button>
        </form>
        {checkpoints && checkpoints.length > 0 && (
          <div className="checkpoint-list">
            {checkpoints.map((checkpoint) => (
              <div key={checkpoint.name} className="checkpoint-item">
                <span className="checkpoint-name">{checkpoint.name}</span>
                <div className="checkpoint-actions">
                  <button
                    className="action-btn"
                    onClick={() =>
                      restoreCheckpoint({
                        todoListId: listId,
                        name: checkpoint.name,
                      })
                    }
                  >
                    Restore
                  </button>
                  <button
                    className="action-btn danger"
                    onClick={() =>
                      deleteCheckpoint({
                        todoListId: listId,
                        name: checkpoint.name,
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="timeline-section">
        <button
          className="timeline-toggle"
          onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
        >
          <span className="timeline-toggle-text">Timeline Visualization</span>
          <svg
            className={`timeline-toggle-icon ${isTimelineExpanded ? "expanded" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div
          className={`timeline-content ${isTimelineExpanded ? "expanded" : ""}`}
        >
          <div className="timeline-content-inner">
            <TimelineVisualization
              listId={listId}
              currentPosition={status.position}
              onNavigateToPosition={handleNavigateToPosition}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
