import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createTodo,
  deleteTodo,
  listTodos,
  listAssignedToMe,
  listArchivedTodos,
  updateTodo,
  CreateTodoInput,
  UpdateTodoInput,
} from "../services/todoService";
import { createNotification } from "../services/notificationService";
import { ValidationError } from "../utils/errors";

export async function list(req: AuthenticatedRequest, res: Response) {
  const todos = listTodos(req.user!.uid);
  res.status(200).json(todos);
}

export async function assigned(req: AuthenticatedRequest, res: Response) {
  const todos = listAssignedToMe(req.user!.uid);
  res.status(200).json(todos);
}

export async function archived(req: AuthenticatedRequest, res: Response) {
  const todos = listArchivedTodos(req.user!.uid);
  res.status(200).json(todos);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const { title, priority, effort, estimatedMinutes, startDate, deadline, parentId, projectId, phaseId, assignedTo } = req.body as Partial<CreateTodoInput>;
  if (!title || !priority) {
    throw new ValidationError("Titre et priorité requis");
  }

  const todo = createTodo(req.user!.uid, { title, priority, effort, estimatedMinutes, startDate, deadline, parentId, projectId, phaseId, assignedTo });

  try {
    if (todo.assignedTo && todo.assignedTo !== req.user!.uid) {
      createNotification(
        todo.assignedTo,
        "task_assigned",
        "Tâche assignée",
        `${req.user!.email} vous a assigné la tâche "${todo.title}"`,
        { todoId: todo.id, assignerEmail: req.user!.email }
      );
    }
  } catch (err) {
    console.warn("[todo.create] notification failed:", err);
  }

  res.status(201).json(todo);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const input = req.body as UpdateTodoInput;
  const previousTodo = listTodos(req.user!.uid).find((t) => t.id === id);
  const todo = updateTodo(req.user!.uid, id, input);

  try {
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
  } catch (err) {
    console.warn("[todo.update] notification failed:", err);
  }

  res.status(200).json(todo);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const todo = deleteTodo(req.user!.uid, id);
  res.status(200).json(todo);
}
