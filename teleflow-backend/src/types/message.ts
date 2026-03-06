import { z } from "zod";

export const messageCreateSchema = z
  .object({
    tenant_id: z.string().uuid(),
    contact_id: z.string().uuid(),
    text: z.string().min(1).max(5000).optional(),
    voice_url: z.string().url().optional(),
    transcript: z.string().max(10000).optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.text && !values.voice_url && !values.transcript) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "Provide at least one field: text, voice_url, or transcript.",
      });
    }
  });

export type MessageCreateInput = z.infer<typeof messageCreateSchema>;

export const processMessageParamSchema = z.object({
  id: z.string().uuid(),
});
