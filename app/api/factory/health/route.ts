import { NextResponse } from "next/server";

import {
  getVideoFactoryHealthSnapshot,
  type VideoFactoryHealthSnapshot,
} from "@/lib/video-factory-diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getVideoFactoryHealthSnapshot();

  return NextResponse.json<VideoFactoryHealthSnapshot>(health, {
    status: 200,
  });
}
