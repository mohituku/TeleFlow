import { z } from "zod";

export const orderItemInputSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
});

export const createOrderSchema = z.object({
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  items: z.array(orderItemInputSchema).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const upsertInventorySchema = z.object({
  tenantId: z.string().uuid(),
  productName: z.string().min(1),
  stockQuantity: z.number().min(0),
});

export type UpsertInventoryInput = z.infer<typeof upsertInventorySchema>;
