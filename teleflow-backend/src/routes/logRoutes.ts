import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { logService } from "../services/logService";

export const logRouter = Router();

logRouter.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const logs = await logService.listLogs(Number.isNaN(limit) ? 50 : limit);

    res.json({
      success: true,
      data: logs,
    });
  }),
);
