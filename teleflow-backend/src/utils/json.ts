export const parseJsonSafely = (rawText: string): unknown => {
  const direct = tryParse(rawText);
  if (direct.ok) {
    return direct.value;
  }

  const firstCurly = rawText.indexOf("{");
  const lastCurly = rawText.lastIndexOf("}");

  if (firstCurly === -1 || lastCurly === -1 || firstCurly >= lastCurly) {
    throw new Error("AI response does not include valid JSON object.");
  }

  const sliced = rawText.slice(firstCurly, lastCurly + 1);
  const parsed = tryParse(sliced);

  if (!parsed.ok) {
    throw new Error("Failed to parse AI response JSON.");
  }

  return parsed.value;
};

const tryParse = (input: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false };
  }
};
