import { prisma } from "../db/prisma";

export const logService = {
  async listLogs(limit = 50) {
    return prisma.aiActionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
