"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import {
  createTodoAction,
  searchTodosAction,
  toggleTodoAction,
  deleteTodoAction,
  bulkDeleteAction,
  setCompletedManyAction,
  type Todo,
  type Status,
  type FormState,
} from "./actions";

const initialState: FormState = { success: false, message: "" };

const BADGE: Record<Todo["priority"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

// Exercise 5: relative time
function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 50) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function Home() {
  // Exercise 1: form feedback (useActionState = new name of useFormState)
  const [state, formAction, adding] = useActionState(createTodoAction, initialState);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, startTransition] = useTransition();

  const load = useCallback(async () => {
    const data = await searchTodosAction(query, status);
    setTodos(data);
    setSelected((prev) => prev.filter((id) => data.some((t) => t.id === id)));
    setLoading(false);
  }, [query, status]);

  // Reload when search/filter changes (debounced) or after a todo is added
  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load, state]);

  // Exercise 5: keep "x minutes ago" fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      await load();
    });

  const visibleIds = todos.map((t) => t.id);
  const allSelected = todos.length > 0 && selected.length === todos.length;

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Todo App</h1>

      {/* Exercise 1 + 2: add form with priority selector */}
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="title"
          defaultValue={state.values?.title ?? ""}
          placeholder="What needs to be done?"
          className="min-w-48 flex-1 rounded border bg-transparent px-3 py-2"
        />
        <select
          name="priority"
          defaultValue={state.values?.priority ?? "medium"}
          className="rounded border bg-transparent px-3 py-2"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button
          disabled={adding}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
        {state.message && (
          <p className={`w-full text-sm ${state.success ? "text-green-600" : "text-red-600"}`}>
            {state.message}
          </p>
        )}
      </form>

      {/* Exercise 3: search + filter */}
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search todos..."
          className="flex-1 rounded border bg-transparent px-3 py-2"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className="rounded border bg-transparent px-3 py-2"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Exercise 4: bulk operations */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : visibleIds)}
          />
          Select all
        </label>
        <button
          disabled={!selected.length || busy}
          onClick={() => run(() => bulkDeleteAction(selected))}
          className="rounded border border-red-500 px-3 py-1 text-red-600 disabled:opacity-40"
        >
          Delete selected ({selected.length})
        </button>
        <button
          disabled={!todos.length || busy}
          onClick={() => run(() => setCompletedManyAction(visibleIds, true))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Mark all complete
        </button>
        <button
          disabled={!todos.length || busy}
          onClick={() => run(() => setCompletedManyAction(visibleIds, false))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Mark all incomplete
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p>Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-gray-500">No todos found.</p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-start gap-3 rounded border p-3">
              <input
                type="checkbox"
                className="mt-1.5"
                checked={selected.includes(t.id)}
                onChange={() => toggleSelect(t.id)}
              />

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={t.completed ? "line-through opacity-60" : ""}>{t.title}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${BADGE[t.priority]}`}>
                    {t.priority}
                  </span>
                </div>
                {/* Exercise 5: relative timestamps */}
                <p className="text-xs text-gray-500">
                  <span title={new Date(t.createdAt).toLocaleString()}>
                    Created {timeAgo(t.createdAt, now)}
                  </span>
                  {t.updatedAt !== t.createdAt && (
                    <span title={new Date(t.updatedAt).toLocaleString()}>
                      {" "}· Updated {timeAgo(t.updatedAt, now)}
                    </span>
                  )}
                </p>
              </div>

              <button
                disabled={busy}
                onClick={() => run(() => toggleTodoAction(t.id, !t.completed))}
                className="rounded border px-2 py-1 text-xs disabled:opacity-40"
              >
                {t.completed ? "Undo" : "Done"}
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => deleteTodoAction(t.id))}
                className="rounded border border-red-500 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}