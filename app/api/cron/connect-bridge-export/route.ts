import { NextRequest, NextResponse } from "next/server";

import { POST as createBridgeExport } from "@/app/api/connect-bridge/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveProvidedSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) {
    return headerSecret;
  }

  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  return querySecret ?? "";
}

async function handleCronRequest(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!expectedSecret) {
    console.error("[cron/connect-bridge-export] missing CRON_SECRET");
    return NextResponse.json(
      {
        success: false,
        message: "Bridge export cron is not configured.",
        error: "Missing CRON_SECRET.",
      },
      { status: 503 },
    );
  }

  const providedSecret = resolveProvidedSecret(request);
  if (providedSecret !== expectedSecret) {
    return NextResponse.json(
      {
        success: false,
        message: "Bridge export cron is unauthorized.",
        error: "Invalid cron secret.",
      },
      { status: 401 },
    );
  }

  const internalRequest = new Request(new URL("/api/connect-bridge", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      action: "create_export",
    }),
  });

  return createBridgeExport(internalRequest);
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}
