import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody, validateParams } from "../middleware/validate";
import { messageCreateSchema, processMessageParamSchema } from "../types/message";
import { messageService } from "../services/messageService";
import { aiService } from "../services/aiService";
import { AppError } from "../middleware/errorHandler";

export const messageRouter = Router();

messageRouter.post(
  "/message",
  validateBody(messageCreateSchema),
  asyncHandler(async (req, res) => {
    const message = await messageService.createMessage(req.body);
    res.status(201).json({
      success: true,
      data: message,
    });
  }),
);

messageRouter.get(
  "/messages",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const messages = await messageService.listMessages(Number.isNaN(limit) ? 50 : limit);

    res.json({
      success: true,
      data: messages,
    });
  }),
);

messageRouter.post(
  "/process-message/:id",
  validateParams(processMessageParamSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
      throw new AppError("Message id is required.", 400);
    }

    const result = await aiService.processMessage(id);

    res.json({
      success: true,
      data: result,
    });
  }),
);
