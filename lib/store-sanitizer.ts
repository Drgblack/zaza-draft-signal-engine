import { z } from "zod";

export function sanitizeGroupedStore<TValue>(
  input: unknown,
  valueSchema: z.ZodType<TValue>,
  scope: string,
): Record<string, TValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const sanitized: Record<string, TValue> = {};

  for (const [key, value] of Object.entries(input)) {
    const parsedValue = valueSchema.safeParse(value);

    if (!parsedValue.success) {
      console.warn(`${scope}: dropping invalid persisted group for ${key}.`, parsedValue.error);
      continue;
    }

    sanitized[key] = parsedValue.data;
  }

  return sanitized;
}
