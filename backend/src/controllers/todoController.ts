import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  CreateTodoInput,
  UpdateTodoInput,
} from "../services/todoService";

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const todos = listTodos(req.user!.uid);
    res.status(200).json(todos);
  } catch (err) {
    console.error("[todo.list]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const { title, priority, effort, deadline } = req.body as Partial<CreateTodoInput>;
    if (!title || !priority) {
      res.status(400).json({ message: "Titre et priorité requis" });
      return;
    }

    const todo = createTodo(req.user!.uid, { title, priority, effort, deadline });
    res.status(201).json(todo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.warn("[todo.create] %s", message);
    res.status(400).json({ message });
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const input = req.body as UpdateTodoInput;
    const todo = updateTodo(req.user!.uid, id, input);
    res.status(200).json(todo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message === "Tâche introuvable" ? 404 : 400;
    console.warn("[todo.update] %s", message);
    res.status(status).json({ message });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const todo = deleteTodo(req.user!.uid, id);
    res.status(200).json(todo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message === "Tâche introuvable" ? 404 : 400;
    console.warn("[todo.remove] %s", message);
    res.status(status).json({ message });
  }
}
