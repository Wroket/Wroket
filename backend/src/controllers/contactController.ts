import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  suggestContacts,
  listArchivedContacts,
  restoreArchivedContact,
  permanentlyDeleteArchivedContact,
  type CreateContactInput,
  type UpdateContactInput,
} from "../services/contactService";
import { ValidationError } from "../utils/errors";

export function list(req: AuthenticatedRequest, res: Response): void {
  const rawQ = typeof req.query.q === "string" ? req.query.q : "";
  const q = rawQ.trim();
  if (q.length > 200) throw new ValidationError("Requête trop longue");
  const contacts = listContacts(req.user!.uid, q || undefined);
  res.status(200).json({ contacts });
}

export function suggest(req: AuthenticatedRequest, res: Response): void {
  const rawQ = typeof req.query.q === "string" ? req.query.q : "";
  const q = rawQ.trim();
  if (q.length > 200) throw new ValidationError("Requête trop longue");
  const suggestions = suggestContacts(req.user!.uid, q);
  res.status(200).json({ suggestions });
}

export function getOne(req: AuthenticatedRequest, res: Response): void {
  const contact = getContactById(req.user!.uid, req.params.id as string);
  res.status(200).json(contact);
}

export function create(req: AuthenticatedRequest, res: Response): void {
  const input = req.body as CreateContactInput;
  const contact = createContact(req.user!.uid, input);
  res.status(201).json(contact);
}

export function update(req: AuthenticatedRequest, res: Response): void {
  const input = req.body as UpdateContactInput;
  const contact = updateContact(req.user!.uid, req.params.id as string, input);
  res.status(200).json(contact);
}

export function remove(req: AuthenticatedRequest, res: Response): void {
  deleteContact(req.user!.uid, req.params.id as string);
  res.status(204).send();
}

export function listArchived(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ contacts: listArchivedContacts(req.user!.uid) });
}

export function restoreArchived(req: AuthenticatedRequest, res: Response): void {
  const contact = restoreArchivedContact(req.user!.uid, req.params.id as string);
  res.status(200).json(contact);
}

export function purgeArchived(req: AuthenticatedRequest, res: Response): void {
  permanentlyDeleteArchivedContact(req.user!.uid, req.params.id as string);
  res.status(204).send();
}
