import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import {
  createNoteFolder,
  deleteNoteFolder,
  listNoteFolderSummaries,
  listArchivedNoteFolderSummaries,
  ensureNoteFolder,
  purgeNoteFoldersForOwner,
  isProjectLinkedNoteFolder,
} from "./noteFolderService";
import { createNote, purgeNotesRuntimeForUid, listNotes } from "./noteService";
import { createProject, updateProject } from "./projectService";
import {
  cascadeProjectNoteFoldersOnDelete,
  cascadeProjectNoteFoldersOnArchive,
  cascadeProjectNoteFoldersOnRestore,
} from "./projectNoteFolderCascade";

beforeEach(() => {
  const store = getStore();
  store.notes = {};
  store.noteFolders = {};
  store.archivedNoteFolders = {};
  store.projects = {};
});

describe("noteFolderService", () => {
  it("creates an empty persisted folder", () => {
    const uid = "folder-create";
    const folder = createNoteFolder(uid, "Projets");
    expect(folder.name).toBe("Projets");
    const list = listNoteFolderSummaries(uid);
    expect(list).toHaveLength(1);
    expect(list[0]?.noteCount).toBe(0);
    expect(list[0]?.persisted).toBe(true);
  });

  it("auto-persists folder when a note is assigned", () => {
    const uid = "folder-note";
    createNote(uid, { title: "A", folder: "Legacy" });
    const list = listNoteFolderSummaries(uid);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Legacy");
    expect(list[0]?.noteCount).toBe(1);
    expect(list[0]?.persisted).toBe(true);
  });

  it("merges persisted empty folder with note folders", () => {
    const uid = "folder-merge";
    createNoteFolder(uid, "Vide");
    createNote(uid, { title: "B", folder: "Autre" });
    const names = listNoteFolderSummaries(uid).map((f) => f.name);
    expect(names).toEqual(["Autre", "Vide"]);
  });

  it("rejects duplicate folder names", () => {
    const uid = "folder-dup";
    createNoteFolder(uid, "Clients");
    expect(() => createNoteFolder(uid, "Clients")).toThrow(/existe déjà/i);
  });

  it("deletes a persisted empty folder", () => {
    const uid = "folder-del";
    createNoteFolder(uid, "À supprimer");
    deleteNoteFolder(uid, "À supprimer");
    expect(listNoteFolderSummaries(uid)).toHaveLength(0);
  });

  it("ensureNoteFolder is idempotent", () => {
    const uid = "folder-ensure";
    ensureNoteFolder(uid, "Auto");
    ensureNoteFolder(uid, "Auto");
    expect(listNoteFolderSummaries(uid)).toHaveLength(1);
    expect(listNoteFolderSummaries(uid)[0]?.persisted).toBe(true);
  });

  it("creates a folder named after the project when creating a project note", () => {
    const uid = "proj-note-folder";
    const project = createProject(uid, "u@test.com", { name: "Mon Projet" });
    const note = createNote(uid, { title: "Doc", projectId: project.id });
    expect(note.folder).toBe("Mon Projet");
    const folders = listNoteFolderSummaries(uid);
    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe("Mon Projet");
    expect(folders[0]?.persisted).toBe(true);
    expect(folders[0]?.noteCount).toBe(1);
    expect(folders[0]?.projectId).toBe(project.id);
  });

  it("blocks manual deletion of a project-linked folder", () => {
    const uid = "proj-folder-block";
    const project = createProject(uid, "u@test.com", { name: "Bloqué" });
    createNote(uid, { title: "Doc", projectId: project.id });
    expect(isProjectLinkedNoteFolder(uid, "Bloqué")).toBe(true);
    expect(() => deleteNoteFolder(uid, "Bloqué")).toThrow(/projet/i);
  });

  it("removes project folder and detaches notes when project is deleted", () => {
    const uid = "proj-folder-cascade";
    const project = createProject(uid, "u@test.com", { name: "Cascade" });
    const created = createNote(uid, { title: "Doc", projectId: project.id });
    expect(created.folder).toBe("Cascade");
    cascadeProjectNoteFoldersOnDelete(project.id);
    expect(listNoteFolderSummaries(uid).some((f) => f.name === "Cascade")).toBe(false);
    const remaining = listNotes(uid).find((n) => n.id === created.id);
    expect(remaining).toBeDefined();
    expect(remaining?.folder).toBeUndefined();
    expect(remaining?.projectId).toBeUndefined();
  });

  it("archives project folder when project is archived and restores on reactivation", () => {
    const uid = "proj-folder-archive";
    const project = createProject(uid, "u@test.com", { name: "Archivé" });
    createNote(uid, { title: "Doc", projectId: project.id });
    expect(listNoteFolderSummaries(uid).some((f) => f.name === "Archivé")).toBe(true);

    updateProject(uid, "u@test.com", project.id, { status: "archived" });
    cascadeProjectNoteFoldersOnArchive(project.id);
    expect(listNoteFolderSummaries(uid).some((f) => f.name === "Archivé")).toBe(false);
    expect(listArchivedNoteFolderSummaries(uid).some((f) => f.name === "Archivé")).toBe(true);

    updateProject(uid, "u@test.com", project.id, { status: "active" });
    cascadeProjectNoteFoldersOnRestore(project.id);
    expect(listNoteFolderSummaries(uid).some((f) => f.name === "Archivé")).toBe(true);
    expect(listArchivedNoteFolderSummaries(uid)).toHaveLength(0);
  });

  afterEach(() => {
    for (const uid of ["folder-create", "folder-note", "folder-merge", "folder-dup", "folder-del", "folder-ensure", "proj-note-folder", "proj-folder-block", "proj-folder-cascade", "proj-folder-archive"]) {
      purgeNotesRuntimeForUid(uid);
      purgeNoteFoldersForOwner(uid);
    }
    getStore().projects = {};
  });
});
