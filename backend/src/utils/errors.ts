export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code?: string) {
    super(404, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code?: string) {
    super(403, message, code);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code?: string) {
    super(400, message, code);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(
    message = "Payment required",
    public readonly code?: string,
  ) {
    super(402, message);
  }
}

/** HTTP 409 with optional machine-readable code and conflict list for clients. */
export class ConflictError extends AppError {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly conflicts?: Array<{ id: string; title: string; start: string; end: string }>,
  ) {
    super(409, message, code);
  }
}

/** HTTP 422 — constraint mismatch with optional structured details for modals. */
export class UnprocessableEntityError extends AppError {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(422, message, code);
  }
}
