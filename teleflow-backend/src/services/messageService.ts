import { prisma } from "../db/prisma";
import { MessageCreateInput } from "../types/message";

export const messageService = {
  async createMessage(input: MessageCreateInput) {
    await ensureTenantAndContact(input.tenant_id, input.contact_id);

    return prisma.message.create({
      data: {
        tenantId: input.tenant_id,
        contactId: input.contact_id,
        text: input.text,
        voiceUrl: input.voice_url,
        transcript: input.transcript,
      },
    });
  },

  async listMessages(limit = 50) {
    return prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async getMessageById(id: string) {
    return prisma.message.findUnique({
      where: { id },
    });
  },

  async getConversationContext(tenantId: string, contactId: string, take = 10) {
    const context = await prisma.message.findMany({
      where: {
        tenantId,
        contactId,
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return context.reverse();
  },
};

const ensureTenantAndContact = async (tenantId: string, contactId: string): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `Tenant-${tenantId.slice(0, 8)}`,
      },
    });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    await prisma.contact.create({
      data: {
        id: contactId,
        tenantId,
        name: `Contact-${contactId.slice(0, 6)}`,
      },
    });
    return;
  }

  if (contact.tenantId !== tenantId) {
    throw new Error("Contact does not belong to provided tenant.");
  }
};
