import OpenAI from "openai";
import { prisma } from "../db/prisma";
import { AppError } from "../middleware/errorHandler";
import { aiIntentSchema } from "../types/ai";
import { parseJsonSafely } from "../utils/json";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { messageService } from "./messageService";
import { orderService } from "./orderService";

/* ─── OpenAI client (only created if API key exists) ─── */
const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    })
  : null;

/* ─── Local deterministic parser (fallback when no LLM key) ─── */
const ITEM_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /(\d+(?:\.\d+)?)\s*kg\s+(\w+)/gi, name: "" },
  { regex: /(\d+(?:\.\d+)?)\s*liter?\s+(\w+)/gi, name: "" },
  { regex: /(\d+)\s*packet\s+(\w+)/gi, name: "" },
  { regex: /(\d+)\s*(?:pcs?|pieces?|bottles?|bags?|boxes?|packs?)\s+(\w+)/gi, name: "" },
];

function localParse(text: string): {
  intent: string;
  customer: string;
  items: Array<{ name: string; quantity: number }>;
  confidence: number;
} {
  const items: Array<{ name: string; quantity: number }> = [];
  const lowerText = text.toLowerCase();

  // Pattern: "Nkg item" or "N liter item" or "N packet item"
  const qtyItemRegex = /(\d+(?:\.\d+)?)\s*(kg|kgs|liter|litre|litres|liters|packet|packets|pcs|piece|pieces|bottle|bottles|bag|bags|box|boxes|pack|packs)?\s+(\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = qtyItemRegex.exec(text)) !== null) {
    const qty = parseFloat(match[1]);
    const item = match[3];
    if (qty > 0 && item && item.length > 1) {
      items.push({ name: item, quantity: qty });
    }
  }

  // Also try: "N item" (just number + word)
  if (items.length === 0) {
    const simpleRegex = /(\d+)\s+(\w{2,})/gi;
    while ((match = simpleRegex.exec(text)) !== null) {
      const qty = parseInt(match[1], 10);
      const item = match[2];
      // skip common non-item words
      const skip = ["ne", "ko", "se", "me", "hai", "ho", "ka", "ki", "ke", "aur", "bhi", "kal", "aaj"];
      if (qty > 0 && item && !skip.includes(item.toLowerCase())) {
        items.push({ name: item, quantity: qty });
      }
    }
  }

  // Extract customer name (heuristic: look for proper noun patterns)
  let customer = "Unknown";
  const namePatterns = [
    /(\b[A-Z][a-z]{2,})\s+(?:ne|ko|ka|ki|ke|bought|ordered|wants)/i,
    /(?:for|to)\s+(\b[A-Z][a-z]{2,})/i,
    /(\b[A-Z][a-z]{2,})\s+(?:bhejna|bhejo|dena|de do)/i,
  ];
  for (const pat of namePatterns) {
    const nameMatch = text.match(pat);
    if (nameMatch) {
      customer = nameMatch[1];
      break;
    }
  }

  const hasItems = items.length > 0;
  const intent = hasItems ? "create_order" : "unknown";
  const confidence = hasItems ? 0.82 : 0.3;

  return { intent, customer, items, confidence };
}

/* ─── Main AI service ─── */
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

    const textContent = message.text || message.transcript || "";
    let structuredResult;
    let rawResponse: string;

    if (openai) {
      /* ── LLM path ── */
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

      rawResponse = completion.choices[0]?.message?.content ?? "";

      if (!rawResponse) {
        throw new AppError("OpenAI returned empty response.", 502);
      }

      logger.info({ messageId, rawResponse }, "AI model response received");

      const parsedJson = parseJsonSafely(rawResponse);
      const validated = aiIntentSchema.safeParse(parsedJson);

      if (!validated.success) {
        throw new AppError(`AI response schema validation failed: ${validated.error.message}`, 422);
      }

      structuredResult = validated.data;
    } else {
      /* ── Local fallback parser ── */
      logger.info({ messageId }, "Using local AI parser (no LLM key configured)");
      structuredResult = localParse(textContent);
      rawResponse = JSON.stringify(structuredResult);
    }

    await prisma.aiActionLog.create({
      data: {
        messageId: message.id,
        prompt: openai ? buildPrompt(conversationHistory, message.id) : `[local-parse] ${textContent}`,
        response: JSON.stringify({
          raw: rawResponse,
          parsed: structuredResult,
        }),
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
