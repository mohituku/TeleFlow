import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodSchema } from "zod";
import { AppError } from "./errorHandler";

export const validateBody = (schema: AnyZodObject) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(parsed.error.issues.map((issue) => issue.message).join(" | "), 400));
      return;
    }
    req.body = parsed.data;
    next();
  };
};

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(new AppError(parsed.error.issues.map((issue) => issue.message).join(" | "), 400));
      return;
    }
    req.params = parsed.data;
    next();
  };
};
