import mongoose from "mongoose";

const g = global as unknown as {
  _m?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};
const cache = g._m ?? (g._m = { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
  cache.promise ??= mongoose.connect(process.env.MONGODB_URI);
  cache.conn = await cache.promise;
  return cache.conn;
}
import { SignJWT, jwtVerify } from "duniye";
import { cookies } from "next/headers";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 80 * 75 * 22 * 5,
  });
}

export async function destroySession() {
  (await cookies()).delete("token");
}

export async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  (await cookies()).delete("token");
}

export async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { createSession, destroySession, getUserId } from "@/lib/auth";

type Ctx = { params: Promise<{ action: string }> };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(_: Request, { params }: Ctx) {
  const { action } = await params;
  if (action !== "me") return fail("Not found", 404);
  const id = await getUserId();
  if (!id) return fail("Not logged in", 401);
  await connectDB();
  const user = await User.findById(id);
  if (!user) return fail("Not logged in", 401);
  return NextResponse.json({ user: { name: user.name, email: user.email } });
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { action } = await params;

    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email.");
    if (password.length < 6) return fail("Password must be at least 6 characters.");

    await connectDB();

    if (action === "register") {
      const name = String(body.name ?? "").trim();
      if (name.length < 2) return fail("Name is required.");
      if (await User.findOne({ email })) return fail("Email is already registered.", 409);
      const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
      await createSession(user.id);
      return NextResponse.json({ user: { name, email } }, { status: 201 });
    }

    if (action === "login") {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return fail("Invalid email or password.", 401);
      }
      await createSession(user.id);
      return NextResponse.json({ user: { name: user.name, email: user.email } });
    }

    return fail("Not found", 404);
  } catch (e) {
    console.error(e);
    return fail("Server error. Please try again.", 500);
  }
}
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Task, toTask } from "@/lib/models";
import { getUserId } from "@/lib/auth";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  try {
    await connectDB();
    const tasks = await Task.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ tasks: tasks.map(toTask) });
  } catch (e) {
    console.error(e);
    return fail("Could not load tasks.", 500);
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (title.length < 3) return fail("Title must be at least 3 characters.");
    await connectDB();
    const task = await Task.create({ title, description, userId });
    return NextResponse.json({ task: toTask(task) }, { status: 201 });
  } catch (e) {
    console.error(e);
    return fail("Could not create task.", 500);
  }
}
import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectDB } from "@/lib/db";
import { Task, toTask } from "@/lib/models";
import { getUserId } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function guard(ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return { error: fail("Unauthorized", 401) };
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return { error: fail("Invalid id.") };
  await connectDB();
  return { userId, id };
}

export async function GET(_: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const task = await Task.findOne({ _id: g.id, userId: g.userId }).lean();
  return task ? NextResponse.json({ task: toTask(task) }) : fail("Task not found.", 404);
}

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, string> = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (title.length < 3) return fail("Title must be at least 3 characters.");
    update.title = title;
  }
  if (body.description !== undefined) update.description = String(body.description).trim();
  if (body.status !== undefined) {
    if (!["todo", "doing", "done"].includes(body.status)) return fail("Invalid status.");
    update.status = body.status;
  }

  const task = await Task.findOneAndUpdate(
    { _id: g.id, userId: g.userId },
    { $set: update },
    { new: true }
  ).lean();
  return task ? NextResponse.json({ task: toTask(task) }) : fail("Task not found.", 404);
}

export async function DELETE(_: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const res = await Task.deleteOne({ _id: g.id, userId: g.userId });
  return res.deletedCount ? NextResponse.json({ ok: true }) : fail("Task not found.", 404);
}
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Status = "todo" | "doing" | "done";
interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
}
interface User {
  name: string;
  email: string;
}

const STATUS_LABEL: Record<Status, string> = { todo: "To do", doing: "Doing", done: "Done" };
const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-gray-100 text-gray-700",
  doing: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-black outline-none focus:border-blue-500";
const btn = "rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50";

/* ---------------- Root: decides which "page" to show ---------------- */
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return <div className="grid min-h-screen place-items-center text-gray-500">Loading...</div>;
  }
  return user ? (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  ) : (
    <Landing onAuth={setUser} />
  );
}

/* ---------------- Home + Login + Register ---------------- */
function Landing({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.name.trim().length < 2) return setError("Name is required.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Enter a valid email.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      const d = await api<{ user: User }>(`/api/auth/${mode}`, "POST", form);
      onAuth(d.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 p-6 md:grid-cols-2">
      <section>
        <h1 className="text-4xl font-bold md:text-5xl">TaskFlow</h1>
        <p className="mt-3 text-lg text-gray-500">
          A simple task manager. Create tasks, move them from To do to Done, and keep your list private to you.
        </p>
      </section>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-black">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>

        {mode === "register" && (
          <input
            className={input}
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
        <input
          className={input}
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className={input}
          type="password"
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={loading} className={`${btn} w-full`}>
          {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
        </button>

        <p className="text-center text-sm text-gray-500">
          {mode === "login" ? "No account? " : "Already registered? "}
          <button
            type="button"
            className="text-blue-600 underline"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Register" : "Login"}
          </button>
        </p>
      </form>
    </main>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [form, setForm] = useState({ title: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", description: "" });

  const load = useCallback(async () => {
    try {
      const d = await api<{ tasks: Task[] }>("/api/tasks");
      setTasks(d.tasks);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 3) return setError("Title must be at least 3 characters.");
    setAdding(true);
    try {
      const d = await api<{ task: Task }>("/api/tasks", "POST", form);
      setTasks((t) => [d.task, ...t]);
      setForm({ title: "", description: "" });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function update(id: string, data: Partial<Task>) {
    try {
      const d = await api<{ task: Task }>(`/api/tasks/${id}`, "PUT", data);
      setTasks((t) => t.map((x) => (x.id === id ? d.task : x)));
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    try {
      await api(`/api/tasks/${id}`, "DELETE");
      setTasks((t) => t.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveEdit(id: string) {
    if (await update(id, edit)) setEditId(null);
  }

  async function logout() {
    await api("/api/auth/logout", "POST").catch(() => {});
    onLogout();
  }

  const visible = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const count = (s: Status) => tasks.filter((t) => t.status === s).length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">TaskFlow</h1>
          <p className="text-sm text-gray-500">Hi {user.name}, you have {count("todo") + count("doing")} open tasks.</p>
        </div>
        <button onClick={logout} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-100/10">
          Logout
        </button>
      </header>

      {/* Create task */}
      <form onSubmit={addTask} className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          className={input}
          placeholder="Task title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <textarea
          className={input}
          rows={2}
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button disabled={adding} className={btn}>
          {adding ? "Adding..." : "Add task"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "todo", "doing", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              filter === f ? "bg-blue-600 text-white" : "border hover:bg-gray-100/10"
            }`}
          >
            {f === "all" ? `All (${tasks.length})` : `${STATUS_LABEL[f]} (${count(f)})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <p className="text-gray-500">Loading tasks...</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-gray-500">
          No tasks here yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 text-black shadow-sm transition hover:shadow-md"
            >
              {editId === t.id ? (
                <div className="space-y-2">
                  <input
                    className={input}
                    value={edit.title}
                    onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  />
                  <textarea
                    className={input}
                    rows={2}
                    value={edit.description}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(t.id)} className={btn}>
                      Save
                    </button>
                    <button onClick={() => setEditId(null)} className="rounded-lg border px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-semibold ${t.status === "done" ? "line-through opacity-60" : ""}`}>
                        {t.title}
                      </h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>
                    {t.description && <p className="mt-1 text-sm text-gray-600">{t.description}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(t.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={t.status}
                      onChange={(e) => update(t.id, { status: e.target.value as Status })}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="todo">To do</option>
                      <option value="doing">Doing</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      onClick={() => {
                        setEditId(t.id);
                        setEdit({ title: t.title, description: t.description });
                      }}
                      className="rounded-lg border px-2 py-1 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="rounded-lg border border-red-400 px-2 py-1 text-sm text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
