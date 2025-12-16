import "./App.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Id } from "../convex/_generated/dataModel";
import { TimelineVisualization } from "./TimelineVisualization";

// Protected todo list IDs that should be read-only (e.g. demo todo lists)
const PROTECTED_TODO_LIST_IDS = [
  "j57f2jerav9yw1jsqsh8ya9aex7wqymv",
  "j57byynbsza01crvsc5yesvs0x7wqwn8",
];

const isProtectedList = (listId: Id<"todoLists"> | string): boolean => {
  return PROTECTED_TODO_LIST_IDS.includes(listId as string);
};

export default function App() {
  const todoLists = useQuery(api.example.getTodoLists);
  const createList = useMutation(api.example.createTodoList);
  const deleteList = useMutation(api.example.deleteTodoList);
  const [newListName, setNewListName] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"todoLists"> | null>(null);

  // Clear selection if the selected list no longer exists
  const prevTodoListsRef = useRef(todoLists);
  useEffect(() => {
    if (selectedId && todoLists && prevTodoListsRef.current !== todoLists) {
      const listExists = todoLists.some((list) => list._id === selectedId);
      if (!listExists) {
        // Use setTimeout to defer the state update and avoid synchronous setState in effect
        setTimeout(() => setSelectedId(null), 0);
      }
    }
    prevTodoListsRef.current = todoLists;
  }, [selectedId, todoLists]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const id = await createList({ name: newListName.trim() });
    setNewListName("");
    setSelectedId(id);
  };

  const handleDelete = async (listId: Id<"todoLists">) => {
    // Don't allow deleting protected lists
    if (isProtectedList(listId)) return;

    // Clear selection if the deleted list was selected
    if (selectedId === listId) {
      setSelectedId(null);
    }

    await deleteList({ todoListId: listId });
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
              <TodoListItem
                key={list._id}
                list={list}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDelete={handleDelete}
              />
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

function TodoListItem({
  list,
  selectedId,
  onSelect,
  onDelete,
}: {
  list: {
    _id: Id<"todoLists">;
    _creationTime: number;
    name: string;
    items: Array<{ id: string; text: string; completed: boolean }>;
  };
  selectedId: Id<"todoLists"> | null;
  onSelect: (id: Id<"todoLists">) => void;
  onDelete: (id: Id<"todoLists">) => void;
}) {
  const isProtected = isProtectedList(list._id);

  return (
    <div className={`list-item ${selectedId === list._id ? "active" : ""}`}>
      <button className="list-button" onClick={() => onSelect(list._id)}>
        <span className="list-name">{list.name}</span>
      </button>
      {!isProtected && (
        <button
          className="list-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(list._id);
          }}
          title="Delete list"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
      {isProtected && (
        <span className="read-only-badge" title="Read-only (demo list)">
          🔒
        </span>
      )}
    </div>
  );
}

function TodoPanel({ listId }: { listId: Id<"todoLists"> }) {
  const isReadOnly = isProtectedList(listId);
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

  // Timer logic for deletion countdown - must be called before any conditional returns
  const scheduledDeletionTime = useQuery(api.example.getScheduledDeletionTime, {
    todoListId: listId,
  });
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (scheduledDeletionTime === null || scheduledDeletionTime === undefined) {
      // Use setTimeout to defer the state update and avoid synchronous setState in effect
      setTimeout(() => setTimeRemaining(null), 0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = scheduledDeletionTime - now;
      setTimeRemaining(remaining > 0 ? remaining : 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [scheduledDeletionTime]);

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

  const formatTime = (ms: number): string => {
    if (ms <= 0) return "0s";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  return (
    <div className="todo-panel">
      {isReadOnly && (
        <div className="read-only-notice">🔒 This is a read-only demo list</div>
      )}
      <div className="todo-toolbar">
        {!isReadOnly && timeRemaining !== null && timeRemaining > 0 && (
          <div className="deletion-timer-panel">
            <span>⏱ {formatTime(timeRemaining)}</span>
            <span
              className="timer-info-icon"
              title="This todo list will auto delete in 5 mins"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
          </div>
        )}
        <div className="toolbar-actions">
          <button
            className="toolbar-btn"
            onClick={() => undo({ todoListId: listId })}
            disabled={!status.canUndo || isReadOnly}
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
            disabled={!status.canRedo || isReadOnly}
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
          placeholder={
            isReadOnly ? "Read-only list (demo)" : "Add a new todo..."
          }
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          disabled={isReadOnly}
        />
        <button type="submit" disabled={!newTodo.trim() || isReadOnly}>
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
              onClick={() => {
                if (!isReadOnly) {
                  handleToggle(todo.id, todo.completed);
                }
              }}
            >
              <input
                type="checkbox"
                className="todo-checkbox"
                checked={todo.completed}
                onChange={() => {
                  if (!isReadOnly) {
                    handleToggle(todo.id, todo.completed);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                disabled={isReadOnly}
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
                  {!isReadOnly && (
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
                  )}
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
            disabled={status.position === null || isReadOnly}
          />
          <button
            type="submit"
            disabled={
              status.position === null || !checkpointName.trim() || isReadOnly
            }
          >
            Save
          </button>
        </form>
        {checkpoints && checkpoints.length > 0 && (
          <div className="checkpoint-list">
            {checkpoints.map((checkpoint) => (
              <div key={checkpoint.name} className="checkpoint-item">
                <span className="checkpoint-name">{checkpoint.name}</span>
                {!isReadOnly && (
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
                )}
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
            className={`timeline-toggle-icon ${
              isTimelineExpanded ? "expanded" : ""
            }`}
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
              onNavigateToPosition={
                isReadOnly ? undefined : handleNavigateToPosition
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
