export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
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

/** HTTP 409 with optional machine-readable code for clients. */
export class ConflictError extends AppError {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(409, message);
  }
}
