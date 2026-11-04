import type { AuthUser } from "../authService";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "../contactService";
import {
  createDatabaseRow,
  createUserDatabase,
  deleteDatabaseRow,
  deleteUserDatabase,
  getUserDatabase,
  listDatabaseRows,
  listUserDatabases,
  sanitizeColumnInput,
  updateDatabaseRow,
  updateUserDatabase,
  type DatabaseColumnDef,
  type DatabaseColumnType,
} from "../userDatabaseService";
import { ValidationError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { optionalString, requireString } from "./types";

const COLUMN_TYPE_ENUM = [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
  "email",
  "phone",
  "relation",
];

function parseColumnsInput(raw: unknown): DatabaseColumnDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
    .map((c) =>
      sanitizeColumnInput({
        id: typeof c.id === "string" ? c.id : undefined,
        name: String(c.name ?? "").trim(),
        type: (typeof c.type === "string" ? c.type : "text") as DatabaseColumnType,
        options: Array.isArray(c.options)
          ? c.options.filter((o): o is string => typeof o === "string")
          : undefined,
        relationDatabaseId:
          typeof c.relationDatabaseId === "string" ? c.relationDatabaseId : undefined,
      }),
    );
}

/**
 * Allows the LLM to pass row values keyed either by column `id` or by column `name`.
 */
function resolveRowValuesByColIdOrName(
  columns: DatabaseColumnDef[],
  rawValues: unknown,
): Record<string, string | number | boolean | null> {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    return {};
  }
  const byId = new Set(columns.map((c) => c.id));
  const byLowerName = new Map(columns.map((c) => [c.name.toLowerCase(), c.id]));
  const out: Record<string, string | number | boolean | null> = {};

  for (const [key, val] of Object.entries(rawValues as Record<string, unknown>)) {
    const colId = byId.has(key) ? key : byLowerName.get(key.trim().toLowerCase());
    if (!colId) continue;
    if (
      val === null ||
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      out[colId] = val;
    }
  }
  return out;
}

export const databasesAndContactsToolDefs: McpToolDef[] = [
  {
    name: "list_user_databases",
    description:
      "List the user's custom databases (Notion/Monday-style tables and boards) with their column definitions.",
    requiredScope: "notes:read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_user_database",
    description: "Get a custom user database by id along with all its rows.",
    requiredScope: "notes:read",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string", description: "Database id" },
      },
      required: ["databaseId"],
    },
  },
  {
    name: "create_user_database",
    description:
      "Create a new custom database (table/board) with typed columns (text, number, date, select, checkbox, email, phone, relation).",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Database name" },
        columns: {
          type: "array",
          description: "Initial columns",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: COLUMN_TYPE_ENUM },
              options: { type: "array", items: { type: "string" } },
              relationDatabaseId: { type: "string" },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_user_database",
    description:
      "Update a user database's name, column schema, defaultView ('table' | 'board'), or boardGroupColumnId.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        name: { type: "string" },
        defaultView: { type: "string", enum: ["table", "board"] },
        boardGroupColumnId: { type: ["string", "null"] },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: COLUMN_TYPE_ENUM },
              options: { type: "array", items: { type: "string" } },
              relationDatabaseId: { type: "string" },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["databaseId"],
    },
  },
  {
    name: "delete_user_database",
    description: "Archive/delete a custom user database by id.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
      },
      required: ["databaseId"],
    },
  },
  {
    name: "add_database_row",
    description:
      "Add a row to a custom user database. Values can be keyed either by column id or by column name.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        values: {
          type: "object",
          description: "Key-value map (columnId or columnName -> string | number | boolean | null)",
        },
      },
      required: ["databaseId", "values"],
    },
  },
  {
    name: "update_database_row",
    description:
      "Update a row in a custom user database. Values can be keyed either by column id or by column name.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        rowId: { type: "string" },
        values: {
          type: "object",
          description: "Key-value map (columnId or columnName -> string | number | boolean | null)",
        },
      },
      required: ["databaseId", "rowId", "values"],
    },
  },
  {
    name: "delete_database_row",
    description: "Delete a row from a custom user database.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        rowId: { type: "string" },
      },
      required: ["databaseId", "rowId"],
    },
  },
  {
    name: "list_contacts",
    description: "List or search contacts in the user's Wroket address book.",
    requiredScope: "notes:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional search query (name, email, company, tag)" },
      },
    },
  },
  {
    name: "create_contact",
    description:
      "Create a contact in the user's Wroket address book (at least one of firstName, lastName, email, or phone is required).",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        company: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: ["string", "null"] },
      },
    },
  },
  {
    name: "update_contact",
    description: "Update an existing contact in the user's Wroket address book.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        company: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: ["string", "null"] },
      },
      required: ["contactId"],
    },
  },
  {
    name: "delete_contact",
    description: "Archive/delete a contact by id.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
      },
      required: ["contactId"],
    },
  },
];

function listUserDatabasesHandler(user: AuthUser, _args: Record<string, unknown>) {
  return { databases: listUserDatabases(user.uid) };
}

function getUserDatabaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  const db = getUserDatabase(user.uid, databaseId);
  const rows = listDatabaseRows(user.uid, databaseId);
  return {
    database: db,
    rowCount: rows.length,
    rows,
  };
}

function createUserDatabaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const name = requireString(args, "name");
  const columns = parseColumnsInput(args.columns);
  const db = createUserDatabase(user.uid, { name, columns });
  return { database: db };
}

function updateUserDatabaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  const defaultView =
    args.defaultView === "table" || args.defaultView === "board" ? args.defaultView : undefined;
  const boardGroupColumnId =
    args.boardGroupColumnId === null
      ? null
      : typeof args.boardGroupColumnId === "string"
        ? args.boardGroupColumnId
        : undefined;
  const columns = Array.isArray(args.columns) ? parseColumnsInput(args.columns) : undefined;
  const db = updateUserDatabase(user.uid, databaseId, {
    name: optionalString(args, "name"),
    defaultView,
    boardGroupColumnId,
    columns,
  });
  return { database: db };
}

function deleteUserDatabaseHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  deleteUserDatabase(user.uid, databaseId);
  return { deleted: true, databaseId };
}

function addDatabaseRowHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  const db = getUserDatabase(user.uid, databaseId);
  const resolved = resolveRowValuesByColIdOrName(db.columns, args.values);
  const row = createDatabaseRow(user.uid, databaseId, resolved);
  return { row };
}

function updateDatabaseRowHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  const rowId = requireString(args, "rowId");
  const db = getUserDatabase(user.uid, databaseId);
  const resolved = resolveRowValuesByColIdOrName(db.columns, args.values);
  const row = updateDatabaseRow(user.uid, databaseId, rowId, resolved);
  return { row };
}

function deleteDatabaseRowHandler(user: AuthUser, args: Record<string, unknown>) {
  const databaseId = requireString(args, "databaseId");
  const rowId = requireString(args, "rowId");
  deleteDatabaseRow(user.uid, databaseId, rowId);
  return { deleted: true, databaseId, rowId };
}

function listContactsHandler(user: AuthUser, args: Record<string, unknown>) {
  const query = optionalString(args, "query");
  const contacts = listContacts(user.uid, query);
  return { count: contacts.length, contacts };
}

function createContactHandler(user: AuthUser, args: Record<string, unknown>) {
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const contact = createContact(user.uid, {
    firstName: optionalString(args, "firstName"),
    lastName: optionalString(args, "lastName"),
    company: args.company === null ? null : optionalString(args, "company"),
    email: args.email === null ? null : optionalString(args, "email"),
    phone: args.phone === null ? null : optionalString(args, "phone"),
    tags,
    notes: args.notes === null ? null : optionalString(args, "notes"),
  });
  return { contact };
}

function updateContactHandler(user: AuthUser, args: Record<string, unknown>) {
  const contactId = requireString(args, "contactId");
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const contact = updateContact(user.uid, contactId, {
    firstName: optionalString(args, "firstName"),
    lastName: optionalString(args, "lastName"),
    company:
      args.company === null
        ? null
        : typeof args.company === "string"
          ? args.company
          : undefined,
    email:
      args.email === null
        ? null
        : typeof args.email === "string"
          ? args.email
          : undefined,
    phone:
      args.phone === null
        ? null
        : typeof args.phone === "string"
          ? args.phone
          : undefined,
    tags,
    notes:
      args.notes === null
        ? null
        : typeof args.notes === "string"
          ? args.notes
          : undefined,
  });
  return { contact };
}

function deleteContactHandler(user: AuthUser, args: Record<string, unknown>) {
  const contactId = requireString(args, "contactId");
  deleteContact(user.uid, contactId);
  return { deleted: true, contactId };
}

void ValidationError;

export const databasesAndContactsHandlers: Record<string, McpToolHandler> = {
  list_user_databases: listUserDatabasesHandler,
  get_user_database: getUserDatabaseHandler,
  create_user_database: createUserDatabaseHandler,
  update_user_database: updateUserDatabaseHandler,
  delete_user_database: deleteUserDatabaseHandler,
  add_database_row: addDatabaseRowHandler,
  update_database_row: updateDatabaseRowHandler,
  delete_database_row: deleteDatabaseRowHandler,
  list_contacts: listContactsHandler,
  create_contact: createContactHandler,
  update_contact: updateContactHandler,
  delete_contact: deleteContactHandler,
};
