import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody } from "../middleware/validate";
import { createOrderSchema, upsertInventorySchema } from "../types/order";
import { orderService } from "../services/orderService";
import { prisma } from "../db/prisma";

export const orderRouter = Router();

// GET /orders
orderRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const limit = Number(req.query.limit ?? 50);
    const orders = await orderService.listOrders(tenantId, Number.isNaN(limit) ? 50 : limit);
    res.json({ success: true, data: orders });
  }),
);

// GET /orders/:id
orderRouter.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.params.id);
    res.json({ success: true, data: order });
  }),
);

// POST /orders
orderRouter.post(
  "/orders",
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const { tenantId, contactId, messageId, items } = req.body;
    const order = await orderService.createOrderManual({ tenantId, contactId, messageId, items });
    res.status(201).json({ success: true, data: order });
  }),
);

// GET /inventory
orderRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const inventory = await orderService.listInventory(tenantId);
    res.json({ success: true, data: inventory });
  }),
);

// POST /inventory
orderRouter.post(
  "/inventory",
  validateBody(upsertInventorySchema),
  asyncHandler(async (req, res) => {
    const { tenantId, productName, stockQuantity } = req.body;
    const item = await orderService.upsertInventoryItem(tenantId, productName, stockQuantity);
    res.json({ success: true, data: item });
  }),
);

// GET /stats
orderRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const stats = await orderService.getDashboardStats(tenantId);
    res.json({ success: true, data: stats });
  }),
);

// POST /demo/seed
orderRouter.post(
  "/demo/seed",
  asyncHandler(async (_req, res) => {
    const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
    const DEMO_CONTACT_ID = "00000000-0000-0000-0000-000000000002";

    await prisma.tenant.upsert({
      where: { id: DEMO_TENANT_ID },
      update: { name: "Demo Shop" },
      create: { id: DEMO_TENANT_ID, name: "Demo Shop" },
    });

    await prisma.contact.upsert({
      where: { id: DEMO_CONTACT_ID },
      update: { name: "Demo Customer" },
      create: {
        id: DEMO_CONTACT_ID,
        tenantId: DEMO_TENANT_ID,
        name: "Demo Customer",
      },
    });

    res.json({ success: true, message: "Demo data seeded" });
  }),
);
