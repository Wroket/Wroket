import { capture, ExtApiError, fetchBootstrap, type BootstrapProject } from "../api";
import { connectBrowser, disconnectBrowser } from "../auth";
import {
  clearDraft,
  getAuth,
  getLastProjectId,
  loadDraft,
  saveDraft,
  setLastProjectId,
} from "../storage";
import { getActiveTabClip, isSupportedClipUrl, sourceHost } from "../tabContext";
import "./popup.css";

type Kind = "task" | "note";
type Priority = "low" | "medium" | "high";

const app = document.getElementById("app")!;

/** Mark body when the page is wider than the toolbar popup (opened as a tab). */
function syncViewportMode(): void {
  document.body.classList.toggle("is-wide", window.innerWidth > 360);
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMondayIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const add = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

async function render(): Promise<void> {
  syncViewportMode();
  const auth = await getAuth();
  if (!auth) {
    const icon = chrome.runtime.getURL("icons/icon48.png");
    app.innerHTML = `
      <header class="hdr">
        <div class="brand">
          <img src="${icon}" alt="" width="20" height="20" />
          <span>Wroket</span>
        </div>
      </header>
      <p class="muted">Capture web pages into tasks and notes.</p>
      <button id="connect" class="primary" type="button">Connect</button>
      <p id="err" class="err" hidden></p>
    `;
    app.querySelector("#connect")?.addEventListener("click", async () => {
      const err = app.querySelector("#err") as HTMLElement;
      err.hidden = true;
      try {
        await connectBrowser();
        await render();
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : "Connect failed";
        err.hidden = false;
      }
    });
    return;
  }

  app.innerHTML = `<p class="muted">Loading…</p>`;
  let projects: BootstrapProject[] = [];
  let locale = "en";
  try {
    const boot = await fetchBootstrap();
    projects = boot.projects.filter((p) => p.status !== "archived");
    locale = boot.me.locale === "fr" ? "fr" : "en";
  } catch (e) {
    if (e instanceof ExtApiError && e.status === 401) {
      await render();
      return;
    }
    app.innerHTML = `
      <p class="err">${e instanceof Error ? e.message : "Bootstrap failed"}</p>
      <button id="retry" type="button" class="primary">Retry</button>
      <button id="disconnect" type="button" class="linkish">Disconnect</button>
    `;
    app.querySelector("#retry")?.addEventListener("click", () => void render());
    app.querySelector("#disconnect")?.addEventListener("click", async () => {
      await disconnectBrowser();
      await render();
    });
    return;
  }

  const ctx = await getActiveTabClip();
  const draft = await loadDraft();
  const lastProject = await getLastProjectId();
  const fr = locale === "fr";
  const supported = isSupportedClipUrl(ctx.url);
  const host = sourceHost(ctx.url);

  const titleDefault =
    draft?.title ||
    (ctx.selection ? ctx.selection.slice(0, 120) : ctx.title) ||
    (supported ? ctx.url : "");

  const disconnectLabel = fr ? "Déconnecter" : "Disconnect";
  const unsupportedMsg = fr
    ? "Ouvrez une page web (http/https), puis cliquez l’icône Wroket dans la barre d’outils."
    : "Open a web page (http/https), then click the Wroket icon in the toolbar.";

  app.innerHTML = `
    <header class="hdr">
      <div class="brand">
        <img src="${chrome.runtime.getURL("icons/icon48.png")}" alt="" width="20" height="20" />
        <span>Wroket</span>
      </div>
      <button id="disconnect" type="button" class="linkish">${disconnectLabel}</button>
    </header>
    ${
      supported
        ? ""
        : `<p class="banner warn" role="status">${unsupportedMsg}</p>`
    }
    <label class="lbl" for="title">${fr ? "Titre" : "Title"}</label>
    <input id="title" type="text" maxlength="500" ${supported ? "" : "disabled"} />
    <div class="row kinds" role="group" aria-label="${fr ? "Type" : "Kind"}">
      <button type="button" data-kind="task" class="chip active">${fr ? "Tâche" : "Task"}</button>
      <button type="button" data-kind="note" class="chip">${fr ? "Note" : "Note"}</button>
    </div>
    <label class="lbl" for="project">${fr ? "Projet" : "Project"}</label>
    <select id="project" ${supported ? "" : "disabled"}>
      <option value="">${fr ? "Aucun" : "None"}</option>
      ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
    </select>
    <div id="task-only" class="task-only">
      <div class="row" role="group" aria-label="${fr ? "Échéance" : "Deadline"}">
        <button type="button" data-dl="today" class="chip">${fr ? "Aujourd’hui" : "Today"}</button>
        <button type="button" data-dl="tomorrow" class="chip">${fr ? "Demain" : "Tomorrow"}</button>
        <button type="button" data-dl="nextweek" class="chip">${fr ? "Sem. pro" : "Next week"}</button>
        <button type="button" data-dl="clear" class="chip muted-chip">${fr ? "Effacer" : "Clear"}</button>
      </div>
      <input id="deadline" type="hidden" value="" />
      <label class="lbl" for="priority">${fr ? "Priorité" : "Priority"}</label>
      <select id="priority" ${supported ? "" : "disabled"}>
        <option value="high">${fr ? "Haute" : "High"}</option>
        <option value="medium" selected>${fr ? "Moyenne" : "Medium"}</option>
        <option value="low">${fr ? "Basse" : "Low"}</option>
      </select>
    </div>
    ${
      ctx.selection
        ? `<p class="excerpt" title="${escapeHtml(ctx.selection)}">${escapeHtml(ctx.selection.slice(0, 220))}${ctx.selection.length > 220 ? "…" : ""}</p>`
        : ""
    }
    ${
      supported
        ? `<div class="source" title="${escapeHtml(ctx.url)}">
            <span class="source-label">${fr ? "Source" : "Source"}</span>
            <span class="source-host">${escapeHtml(host || ctx.url)}</span>
            ${
              ctx.title && ctx.title !== host
                ? `<span class="source-title">${escapeHtml(ctx.title)}</span>`
                : ""
            }
          </div>`
        : ""
    }
    <p id="err" class="err" hidden></p>
    <div id="success" class="success" hidden></div>
    <div class="actions">
      <button id="capture" class="primary" type="button" ${supported ? "" : "disabled"}>
        ${fr ? "Capturer" : "Capture"}
      </button>
    </div>
    <p class="hint muted">${fr ? "Entrée = capturer · Ctrl+Entrée = ouvrir" : "Enter = capture · Ctrl+Enter = open"}</p>
  `;

  const titleEl = app.querySelector("#title") as HTMLInputElement;
  const projectEl = app.querySelector("#project") as HTMLSelectElement;
  const priorityEl = app.querySelector("#priority") as HTMLSelectElement;
  const deadlineEl = app.querySelector("#deadline") as HTMLInputElement;
  const taskOnlyEl = app.querySelector("#task-only") as HTMLElement;
  const errEl = app.querySelector("#err") as HTMLElement;
  const successEl = app.querySelector("#success") as HTMLElement;
  let kind: Kind = draft?.kind ?? "task";

  titleEl.value = titleDefault;
  if (draft?.projectId) projectEl.value = draft.projectId;
  else if (lastProject) projectEl.value = lastProject;
  if (draft?.priority) priorityEl.value = draft.priority;
  if (draft?.deadline) deadlineEl.value = draft.deadline;

  const syncDeadlineChips = () => {
    const v = deadlineEl.value;
    app.querySelectorAll("[data-dl]").forEach((el) => {
      const key = el.getAttribute("data-dl");
      let match = false;
      if (key === "today") match = v === isoDateOffset(0);
      else if (key === "tomorrow") match = v === isoDateOffset(1);
      else if (key === "nextweek") match = v === nextMondayIso();
      el.classList.toggle("active", match);
    });
  };
  syncDeadlineChips();

  const setKind = (k: Kind) => {
    kind = k;
    app.querySelectorAll("[data-kind]").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-kind") === k);
    });
    taskOnlyEl.hidden = k !== "task";
  };
  setKind(kind);

  app.querySelectorAll("[data-kind]").forEach((el) => {
    el.addEventListener("click", () => setKind(el.getAttribute("data-kind") as Kind));
  });
  app.querySelectorAll("[data-dl]").forEach((el) => {
    el.addEventListener("click", () => {
      const v = el.getAttribute("data-dl");
      if (v === "today") deadlineEl.value = isoDateOffset(0);
      else if (v === "tomorrow") deadlineEl.value = isoDateOffset(1);
      else if (v === "nextweek") deadlineEl.value = nextMondayIso();
      else deadlineEl.value = "";
      syncDeadlineChips();
    });
  });

  app.querySelector("#disconnect")?.addEventListener("click", async () => {
    await disconnectBrowser();
    await render();
  });

  const persistDraft = async () => {
    await saveDraft({
      title: titleEl.value,
      kind,
      projectId: projectEl.value || null,
      priority: priorityEl.value as Priority,
      deadline: deadlineEl.value || null,
      sourceUrl: ctx.url,
      sourceTitle: ctx.title,
      excerpt: ctx.selection,
      savedAt: Date.now(),
    });
  };

  const doCapture = async (openAfter: boolean) => {
    errEl.hidden = true;
    successEl.hidden = true;
    const title = titleEl.value.trim();
    if (!title) {
      errEl.textContent = fr ? "Titre requis" : "Title required";
      errEl.hidden = false;
      return;
    }
    if (!isSupportedClipUrl(ctx.url)) {
      errEl.textContent = unsupportedMsg;
      errEl.hidden = false;
      return;
    }
    await persistDraft();
    const clientId = crypto.randomUUID();
    const captureBtn = app.querySelector("#capture") as HTMLButtonElement;
    captureBtn.disabled = true;
    try {
      const result = await capture({
        clientId,
        kind,
        title,
        projectId: projectEl.value || null,
        deadline: kind === "task" ? deadlineEl.value || null : null,
        priority: kind === "task" ? (priorityEl.value as Priority) : undefined,
        content: kind === "note" ? ctx.selection || undefined : undefined,
        source: {
          url: ctx.url.slice(0, 2000),
          title: ctx.title.slice(0, 500) || undefined,
          excerpt: ctx.selection || undefined,
          via: "chrome_ext",
        },
      });
      await setLastProjectId(projectEl.value || null);
      await clearDraft();
      successEl.hidden = false;
      successEl.innerHTML = `
        <span>${fr ? "Enregistré" : "Saved"}</span>
        <a href="${result.openUrl}" target="_blank" rel="noreferrer">${fr ? "Ouvrir" : "Open"}</a>
        ${
          result.scheduleUrl
            ? `<a href="${result.scheduleUrl}" target="_blank" rel="noreferrer">${fr ? "Planifier" : "Schedule"}</a>`
            : ""
        }
        <button type="button" id="again" class="linkish">${fr ? "Nouvelle" : "New"}</button>
      `;
      successEl.querySelector("#again")?.addEventListener("click", () => void render());
      if (openAfter) await chrome.tabs.create({ url: result.openUrl });
    } catch (e) {
      await persistDraft();
      if (e instanceof ExtApiError && (e.status === 402 || e.code?.includes("QUOTA"))) {
        errEl.innerHTML = `${escapeHtml(e.message)} — <a href="https://wroket.com/pricing" target="_blank" rel="noreferrer">Upgrade</a>`;
      } else if (e instanceof ExtApiError && e.status === 401) {
        errEl.textContent = fr ? "Reconnectez l’extension" : "Reconnect the extension";
        setTimeout(() => void render(), 800);
      } else {
        errEl.textContent = e instanceof Error ? e.message : "Capture failed";
      }
      errEl.hidden = false;
    } finally {
      captureBtn.disabled = !supported;
    }
  };

  app.querySelector("#capture")?.addEventListener("click", () => void doCapture(false));
  titleEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      void doCapture(ev.ctrlKey || ev.metaKey);
    }
  });
  if (supported) {
    titleEl.focus();
    titleEl.select();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.addEventListener("resize", syncViewportMode);
syncViewportMode();
void render();
