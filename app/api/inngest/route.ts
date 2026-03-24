import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { factoryRenderFunction } from "@/lib/inngest/functions/factory-render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [factoryRenderFunction],
});
