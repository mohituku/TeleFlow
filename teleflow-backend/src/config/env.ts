import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().min(1),
    EMERGENT_LLM_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((values, ctx) => {
    if (!values.OPENAI_API_KEY && !values.EMERGENT_LLM_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either OPENAI_API_KEY or EMERGENT_LLM_KEY must be provided.",
        path: ["OPENAI_API_KEY"],
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
