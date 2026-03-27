import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createTodo,
  deleteTodo,
  listTodos,
  listAssignedToMe,
  updateTodo,
  CreateTodoInput,
  UpdateTodoInput,
} from "../services/todoService";
import { createNotification } from "../services/notificationService";

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const todos = listTodos(req.user!.uid);
    res.status(200).json(todos);
  } catch (err) {
    console.error("[todo.list]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function assigned(req: AuthenticatedRequest, res: Response) {
  try {
    const todos = listAssignedToMe(req.user!.uid);
    res.status(200).json(todos);
  } catch (err) {
    console.error("[todo.assigned]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const { title, priority, effort, deadline, parentId, assignedTo } = req.body as Partial<CreateTodoInput>;
    if (!title || !priority) {
      res.status(400).json({ message: "Titre et priorité requis" });
      return;
    }

    const todo = createTodo(req.user!.uid, { title, priority, effort, deadline, parentId, assignedTo });

    if (todo.assignedTo && todo.assignedTo !== req.user!.uid) {
      createNotification(
        todo.assignedTo,
        "task_assigned",
        "Tâche assignée",
        `${req.user!.email} vous a assigné la tâche "${todo.title}"`,
        { todoId: todo.id, assignerEmail: req.user!.email }
      );
    }

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
    const previousTodo = listTodos(req.user!.uid).find((t) => t.id === id);
    const todo = updateTodo(req.user!.uid, id, input);

    if (
      input.assignedTo &&
      input.assignedTo !== req.user!.uid &&
      input.assignedTo !== previousTodo?.assignedTo
    ) {
      createNotification(
        input.assignedTo,
        "task_assigned",
        "Tâche assignée",
        `${req.user!.email} vous a assigné la tâche "${todo.title}"`,
        { todoId: todo.id, assignerEmail: req.user!.email }
      );
    }

    if (
      input.assignmentStatus === "declined" &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_declined",
        "Tâche refusée",
        `${req.user!.email} a refusé la tâche "${todo.title}"`,
        { todoId: todo.id, declinerEmail: req.user!.email }
      );
    }

    if (
      input.assignmentStatus === "accepted" &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_accepted",
        "Tâche acceptée",
        `${req.user!.email} a accepté la tâche "${todo.title}"`,
        { todoId: todo.id, accepterEmail: req.user!.email }
      );
    }

    if (
      input.status === "completed" &&
      todo.assignedTo &&
      todo.assignedTo === req.user!.uid &&
      todo.userId !== req.user!.uid
    ) {
      createNotification(
        todo.userId,
        "task_completed",
        "Tâche accomplie",
        `${req.user!.email} a terminé la tâche "${todo.title}"`,
        { todoId: todo.id, assigneeEmail: req.user!.email }
      );
    }

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
