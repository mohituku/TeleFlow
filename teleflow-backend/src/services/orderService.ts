import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

export const orderService = {
  async createOrderFromAiIntent(params: {
    tenantId: string;
    contactId: string;
    messageId: string;
    aiResult: {
      intent: string;
      customer: string;
      items: Array<{ name: string; quantity: number }>;
      confidence: number;
    };
  }) {
    const { tenantId, contactId, messageId, aiResult } = params;

    if (aiResult.intent !== "create_order") {
      return null;
    }

    logger.info({ tenantId, messageId, items: aiResult.items }, "Creating order from AI intent");

    const order = await prisma.order.create({
      data: {
        tenantId,
        contactId,
        messageId,
        status: "pending",
        totalAmount: 0,
        items: {
          create: aiResult.items.map((item) => ({
            itemName: item.name,
            quantity: item.quantity,
            unitPrice: 0,
          })),
        },
      },
      include: { items: true },
    });

    // Upsert inventory for each item (deduct stock)
    for (const item of aiResult.items) {
      const existing = await prisma.inventory.findUnique({
        where: {
          tenantId_productName: { tenantId, productName: item.name },
        },
      });

      if (existing) {
        await prisma.inventory.update({
          where: { id: existing.id },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      } else {
        await prisma.inventory.create({
          data: {
            tenantId,
            productName: item.name,
            stockQuantity: 0,
          },
        });
      }
    }

    logger.info({ orderId: order.id }, "Order created successfully");
    return order;
  },

  async createOrderManual(params: {
    tenantId: string;
    contactId: string;
    messageId?: string;
    items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  }) {
    const { tenantId, contactId, messageId, items } = params;

    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * (item.unitPrice ?? 0),
      0,
    );

    const order = await prisma.order.create({
      data: {
        tenantId,
        contactId,
        messageId: messageId || null,
        status: "pending",
        totalAmount,
        items: {
          create: items.map((item) => ({
            itemName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? 0,
          })),
        },
      },
      include: { items: true },
    });

    return order;
  },

  async listOrders(tenantId?: string, limit?: number) {
    return prisma.order.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit ?? 50,
      include: {
        items: true,
        contact: true,
      },
    });
  },

  async getOrderById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        contact: true,
      },
    });
  },

  async listInventory(tenantId?: string) {
    return prisma.inventory.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { updatedAt: "desc" },
    });
  },

  async upsertInventoryItem(
    tenantId: string,
    productName: string,
    stockQuantity: number,
  ) {
    return prisma.inventory.upsert({
      where: {
        tenantId_productName: { tenantId, productName },
      },
      update: { stockQuantity },
      create: { tenantId, productName, stockQuantity },
    });
  },

  async getDashboardStats(tenantId?: string) {
    const where = tenantId ? { tenantId } : undefined;

    const [totalOrders, pendingOrders, confirmedOrders, totalMessages, totalAiActions, inventoryCount] =
      await Promise.all([
        prisma.order.count({ where }),
        prisma.order.count({ where: { ...where, status: "pending" } }),
        prisma.order.count({ where: { ...where, status: "confirmed" } }),
        prisma.message.count({ where }),
        prisma.aiActionLog.count(),
        prisma.inventory.count({ where }),
      ]);

    return {
      totalOrders,
      pendingOrders,
      confirmedOrders,
      totalMessages,
      totalAiActions,
      inventoryCount,
    };
  },
};
