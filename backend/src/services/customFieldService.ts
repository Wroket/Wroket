import { getEntitlementsForUid } from "./authService";
import { getProjectById, type ProjectCustomFieldDef } from "./projectService";
import { ForbiddenError, NotFoundError, PaymentRequiredError, ValidationError } from "../utils/errors";

export function assertCustomFieldsEntitlement(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new PaymentRequiredError(
      "Les champs personnalisés nécessitent le palier Small teams ou supérieur.",
      "CUSTOM_FIELDS_PLAN_REQUIRED",
    );
  }
}

export function validateCustomFieldValues(
  projectId: string | null,
  defs: ProjectCustomFieldDef[],
  values: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  if (!values || typeof values !== "object") return {};
  if (!projectId) {
    throw new ValidationError("Les champs personnalisés nécessitent un projet");
  }
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  const fieldDefs = defs.length > 0 ? defs : (project.customFieldDefs ?? []);
  const defById = new Map(fieldDefs.map((d) => [d.id, d]));
  const out: Record<string, string | number | boolean | null> = {};

  for (const [fieldId, raw] of Object.entries(values)) {
    const def = defById.get(fieldId);
    if (!def) continue;
    if (raw === null || raw === undefined || raw === "") {
      out[fieldId] = null;
      continue;
    }
    switch (def.type) {
      case "text": {
        if (typeof raw !== "string") throw new ValidationError(`Champ « ${def.name} » : texte attendu`);
        out[fieldId] = raw.trim().substring(0, 500);
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) throw new ValidationError(`Champ « ${def.name} » : nombre attendu`);
        out[fieldId] = n;
        break;
      }
      case "date": {
        if (typeof raw !== "string") throw new ValidationError(`Champ « ${def.name} » : date attendue`);
        const d = new Date(raw);
        if (isNaN(d.getTime())) throw new ValidationError(`Champ « ${def.name} » : date invalide`);
        out[fieldId] = d.toISOString().split("T")[0];
        break;
      }
      case "select": {
        if (typeof raw !== "string") throw new ValidationError(`Champ « ${def.name} » : option attendue`);
        if (!def.options?.includes(raw)) {
          throw new ValidationError(`Champ « ${def.name} » : option invalide`);
        }
        out[fieldId] = raw;
        break;
      }
      case "checkbox": {
        out[fieldId] = raw === true || raw === "true";
        break;
      }
      default:
        break;
    }
  }
  return out;
}
