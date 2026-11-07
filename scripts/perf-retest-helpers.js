/**
 * Browser console helpers for PERF multi-account retests.
 * Paste into DevTools on wroket.com while logged in as the organizer.
 *
 * Usage:
 *   Object.assign(window.__retest || (window.__retest = {}), PerfRetestHelpers.install());
 *   await window.__retest.seedPerf({ ... });
 *   await window.__retest.cleanupPerf();
 *
 * No user data is stored in git — this file is API orchestration only.
 */
(function (root) {
  const API = "https://api.wroket.com";
  const TITLE_PREFIX = "PERF retest";

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   */
  async function api(method, path, body) {
    const t0 = performance.now();
    const res = await fetch(API + path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 400) };
    }
    return { status: res.status, ms: Math.round(performance.now() - t0), body: parsed };
  }

  function isPerfTitle(value) {
    return /PERF\s+retest/i.test(String(value || ""));
  }

  function asArray(body) {
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.items)) return body.items;
    if (body && Array.isArray(body.todos)) return body.todos;
    return [];
  }

  /**
   * Seed a PERF team, project, assigned todos, optional books, and notes.
   * @param {{
   *   assigneeEmails: string[],
   *   assignCounts?: number[],
   *   bookCount?: number,
   *   noteCount?: number,
   *   dayOffset?: number,
   * }} opts
   */
  async function seedPerf(opts) {
    const emails = opts.assigneeEmails || [];
    if (emails.length < 1) throw new Error("assigneeEmails required");
    const assignCounts = opts.assignCounts || emails.map(() => 4);
    const bookCount = opts.bookCount ?? 0;
    const noteCount = opts.noteCount ?? 4;
    const dayOffset = opts.dayOffset ?? 14;
    const stamp = new Date().toISOString().slice(0, 10);
    const latencies = { assign: [], book: [], note: [] };

    const me = await api("GET", "/auth/me");
    if (me.status !== 200) throw new Error("not authenticated as organizer");

    const team = await api("POST", "/teams", {
      name: `${TITLE_PREFIX} ${stamp}`,
      memberEmails: emails,
    });
    if (team.status >= 400) {
      // Fallback alias used by older clients
      const team2 = await api("POST", "/teams", {
        name: `${TITLE_PREFIX} ${stamp}`,
        members: emails,
      });
      if (team2.status >= 400) throw new Error("team create failed: " + team2.status);
      Object.assign(team, team2);
    }
    const teamId = team.body && (team.body.id || team.body.teamId);
    if (!teamId) throw new Error("team id missing");

    const project = await api("POST", "/projects", {
      name: `${TITLE_PREFIX} A`,
      teamId,
    });
    if (project.status >= 400) throw new Error("project create failed");
    const projectId = project.body.id;

    const todos = [];
    let n = 0;
    for (let i = 0; i < emails.length; i++) {
      const count = assignCounts[i] || 0;
      for (let k = 0; k < count; k++) {
        n += 1;
        const suffix = Math.random().toString(36).slice(2, 6);
        const created = await api("POST", "/todos", {
          title: `${TITLE_PREFIX} #${n} ${suffix}`,
          priority: "medium",
          projectId,
        });
        if (created.status >= 400) throw new Error("todo create failed @" + n);
        const todoId = created.body.id;
        const assigned = await api("PUT", `/todos/${todoId}`, {
          assignedToEmail: emails[i],
          assignmentStatus: "pending",
        });
        latencies.assign.push(assigned.ms);
        if (assigned.status >= 400) throw new Error("assign failed @" + n);
        todos.push(assigned.body || created.body);
      }
    }

    const books = [];
    for (let i = 0; i < Math.min(bookCount, todos.length); i++) {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + dayOffset + i);
      start.setUTCHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const booked = await api("POST", `/calendar/book/${todos[i].id}`, {
        start: start.toISOString(),
        end: end.toISOString(),
        force: true,
      });
      latencies.book.push(booked.ms);
      books.push({ id: todos[i].id, status: booked.status, ms: booked.ms });
    }

    const notes = [];
    for (let i = 1; i <= noteCount; i++) {
      const created = await api("POST", "/notes", {
        title: `${TITLE_PREFIX} note ${i}`,
        content: `retest ${i}`,
      });
      latencies.note.push(created.ms);
      if (created.status >= 400) throw new Error("note create failed");
      const noteId = created.body.id;
      const shareBody =
        i <= Math.ceil(noteCount / 2)
          ? { teamId }
          : { collaboratorEmail: emails[Math.min(i - 1, emails.length - 1)], canWrite: true };
      const shared = await api("PUT", `/notes/${noteId}/share`, shareBody);
      notes.push({ id: noteId, shareStatus: shared.status });
    }

    const p50 = (arr) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor((s.length - 1) * 0.5)];
    };

    return {
      teamId,
      projectId,
      todoCount: todos.length,
      bookCount: books.length,
      noteCount: notes.length,
      latencies: {
        assignP50: p50(latencies.assign),
        bookP50: p50(latencies.book),
        noteP50: p50(latencies.note),
        assign: latencies.assign,
        book: latencies.book,
      },
      books,
      notes,
    };
  }

  /** Delete PERF seed objects owned by the current session. */
  async function cleanupPerf() {
    const results = { slots: [], todos: [], notes: [], projects: [], team: null };

    const todosRes = await api("GET", "/todos");
    const todos = asArray(todosRes.body).filter((t) => isPerfTitle(t.title));
    for (const t of todos) {
      if (t.scheduledSlot) {
        const c = await api("DELETE", `/calendar/slot/${t.id}`);
        results.slots.push({ id: String(t.id).slice(0, 8), status: c.status });
      }
    }
    for (const t of todos) {
      const d = await api("DELETE", `/todos/${t.id}`);
      results.todos.push({ id: String(t.id).slice(0, 8), status: d.status });
    }

    const notesRes = await api("GET", "/notes");
    const notes = asArray(notesRes.body).filter((n) => isPerfTitle(n.title || n.name));
    for (const n of notes) {
      const d = await api("DELETE", `/notes/${n.id}`);
      results.notes.push({ id: String(n.id).slice(0, 8), status: d.status });
    }

    const projectsRes = await api("GET", "/projects");
    const projects = asArray(projectsRes.body).filter((p) => isPerfTitle(p.name));
    for (const p of projects) {
      const d = await api("DELETE", `/projects/${p.id}`);
      results.projects.push({ id: String(p.id).slice(0, 8), status: d.status });
    }

    const teamsRes = await api("GET", "/teams");
    const teams = asArray(teamsRes.body).filter((t) => isPerfTitle(t.name));
    for (const t of teams) {
      const d = await api("DELETE", `/teams/${t.id}`);
      results.team = { id: String(t.id).slice(0, 8), status: d.status };
    }

    const vTodos = asArray((await api("GET", "/todos")).body).filter((t) => isPerfTitle(t.title));
    const vNotes = asArray((await api("GET", "/notes")).body).filter((n) =>
      isPerfTitle(n.title || n.name),
    );
    const vTeams = asArray((await api("GET", "/teams")).body).filter((t) => isPerfTitle(t.name));

    return {
      results,
      remain: {
        todos: vTodos.length,
        notes: vNotes.length,
        team: vTeams[0] ? vTeams[0].name : null,
      },
    };
  }

  function install() {
    return { api, seedPerf, cleanupPerf, TITLE_PREFIX };
  }

  const PerfRetestHelpers = { install, api, seedPerf, cleanupPerf };
  root.PerfRetestHelpers = PerfRetestHelpers;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = PerfRetestHelpers;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
