import OpenAI from "openai";
import { prisma } from "../db/prisma";
import { AppError } from "../middleware/errorHandler";
import { aiIntentSchema } from "../types/ai";
import { parseJsonSafely } from "../utils/json";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { messageService } from "./messageService";
import { orderService } from "./orderService";

const llmKey = env.OPENAI_API_KEY ?? env.EMERGENT_LLM_KEY;
const openai = new OpenAI({
  apiKey: llmKey,
});

export const aiService = {
  async processMessage(messageId: string) {
    const message = await messageService.getMessageById(messageId);

    if (!message) {
      throw new AppError("Message not found.", 404);
    }

    const conversationHistory = await messageService.getConversationContext(
      message.tenantId,
      message.contactId,
      8,
    );

    const prompt = buildPrompt(conversationHistory, message.id);

    logger.info({ messageId, prompt }, "AI prompt generated");

    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are TeleFlow AI parser. Convert business chat into strict JSON with fields: intent, customer, items, confidence. Confidence must be 0 to 1.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const rawResponse = completion.choices[0]?.message?.content;

    if (!rawResponse) {
      throw new AppError("OpenAI returned empty response.", 502);
    }

    logger.info({ messageId, rawResponse }, "AI model response received");

    const parsedJson = parseJsonSafely(rawResponse);
    const validated = aiIntentSchema.safeParse(parsedJson);

    if (!validated.success) {
      throw new AppError(`AI response schema validation failed: ${validated.error.message}`, 422);
    }

    const structuredResult = validated.data;

    await prisma.aiActionLog.create({
      data: {
        messageId: message.id,
        prompt,
        response: {
          raw: rawResponse,
          parsed: structuredResult,
        },
        confidence: structuredResult.confidence,
        action: structuredResult.intent,
      },
    });

    // Auto-create order if confidence >= 0.7 and intent is create_order
    let order = null;
    if (
      structuredResult.intent === "create_order" &&
      structuredResult.confidence >= 0.7
    ) {
      try {
        order = await orderService.createOrderFromAiIntent({
          tenantId: message.tenantId,
          contactId: message.contactId,
          messageId: message.id,
          aiResult: structuredResult,
        });
        logger.info({ orderId: order?.id }, "Order auto-created from AI intent");
      } catch (err) {
        logger.error({ err }, "Failed to auto-create order from AI intent");
      }
    }

    return { ...structuredResult, order };
  },
};

const buildPrompt = (
  history: Array<{
    id: string;
    text: string | null;
    transcript: string | null;
    createdAt: Date;
  }>,
  latestMessageId: string,
) => {
  const historyText = history
    .map((entry) => {
      const content = entry.text || entry.transcript || "(voice-only message)";
      return `[${entry.createdAt.toISOString()}] ${entry.id === latestMessageId ? "LATEST" : "HISTORY"}: ${content}`;
    })
    .join("\n");

  return `Parse the latest message into structured business intent JSON.\n\nConversation history:\n${historyText}\n\nRules:\n1) Keep intent concise (e.g. create_order, update_inventory, payment_update, unknown).\n2) Infer customer name from message. If unavailable, return \"Unknown\".\n3) Extract item names and numeric quantities only.\n4) confidence must be decimal number between 0 and 1.\n5) Return JSON only.`;
};
