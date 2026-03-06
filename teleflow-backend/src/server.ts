import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import { healthRouter } from "./routes/healthRoutes";
import { logRouter } from "./routes/logRoutes";
import { messageRouter } from "./routes/messageRoutes";
import { logger } from "./utils/logger";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(
  pinoHttp({
    logger,
  }),
);

const routers = [healthRouter, messageRouter, logRouter];
for (const route of routers) {
  app.use(route);
  app.use("/api", route);
}

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "TeleFlow backend is running");
});

const shutdown = async () => {
  logger.info("Shutting down TeleFlow backend...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
