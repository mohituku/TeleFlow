import { z } from "zod";

export const aiIntentSchema = z.object({
  intent: z.string().min(1),
  customer: z.string().min(1),
  items: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.number().positive(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export type AiIntentOutput = z.infer<typeof aiIntentSchema>;
