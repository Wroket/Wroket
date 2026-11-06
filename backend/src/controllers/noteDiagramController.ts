/**
 * Photo → workflow graph preview, and saving that graph on the note.
 * The recognize call does not persist the image or the proposal.
 */
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authController";
import type { RequestWithId } from "../middlewares/requestId";
import {
  assertDiagramEnabledFor,
  getDiagramConfigFor,
  proposeDiagramForUser,
  sanitizeDiagramProposal,
} from "../services/diagramService";
import { resolveNoteAccess, saveNoteDiagram, type NoteDiagram } from "../services/noteService";
import { NotFoundError, ValidationError } from "../utils/errors";

/** GET /notes/diagram/config */
export async function getDiagramConfig(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  res.status(200).json(getDiagramConfigFor(user.uid, user.email));
}

/**
 * POST /notes/:noteId/diagram — multipart file + consent=yes.
 * Returns `{ nodes, edges }` and stores nothing.
 */
export async function recognizeDiagram(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  assertDiagramEnabledFor(user.uid, user.email);
  const access = resolveNoteAccess(user.uid, user.email ?? "", noteId);
  if (!access?.canWrite) throw new NotFoundError("Note introuvable");
  const consent = (req.body as Record<string, unknown> | undefined)?.consent;
  if (consent !== "yes") {
    throw new ValidationError(
      "Confirmez l'envoi de l'image pour proposer un schéma",
      "DIAGRAM_CONSENT_REQUIRED",
    );
  }
  if (!req.file) {
    throw new ValidationError("Image manquante", "DIAGRAM_UNSUPPORTED_TYPE");
  }
  const proposal = await proposeDiagramForUser({
    uid: user.uid,
    email: user.email,
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    requestId: (req as unknown as RequestWithId).id,
  });
  res.status(200).json(proposal);
}

/** PUT /notes/:noteId/diagram — persist a graph the user confirmed. `{ diagram: { nodes, edges } | null }`. */
export async function saveDiagram(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  const access = resolveNoteAccess(user.uid, user.email ?? "", noteId);
  if (!access?.canWrite) throw new NotFoundError("Note introuvable");
  const body = (req.body ?? {}) as { diagram?: unknown; blockId?: unknown };
  let diagram: NoteDiagram | null = null;
  if (body.diagram != null) {
    const proposal = sanitizeDiagramProposal(body.diagram);
    if (proposal.nodes.length === 0) {
      throw new ValidationError("Le schéma ne contient aucune étape", "DIAGRAM_EMPTY");
    }
    diagram = { nodes: proposal.nodes, edges: proposal.edges, updatedAt: new Date().toISOString() };
  }
  const blockId = typeof body.blockId === "string" ? body.blockId : undefined;
  const note = saveNoteDiagram(access.ownerUid, noteId, diagram, blockId);
  res.status(200).json(note);
}
