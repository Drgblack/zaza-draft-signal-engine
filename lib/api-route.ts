import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export async function readJsonBody(request: Request) {
  return request.json().catch(() => null);
}

export async function parseJsonBody<TSchema>(
  request: Request,
  schema: ZodSchema<TSchema>,
) {
  const payload = await readJsonBody(request);
  return schema.safeParse(payload);
}

export function jsonSuccess<TBody>(body: TBody, init?: { status?: number }) {
  return NextResponse.json<TBody>(body, {
    status: init?.status ?? 200,
  });
}

export function jsonError<TBody>(
  body: TBody,
  status = 500,
) {
  return NextResponse.json<TBody>(body, {
    status,
  });
}
