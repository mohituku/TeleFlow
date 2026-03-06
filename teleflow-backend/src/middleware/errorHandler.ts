import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  logger.error(
    {
      err: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      statusCode,
    },
    "Request failed",
  );

  res.status(statusCode).json({
    success: false,
    error: error.message,
  });
};
