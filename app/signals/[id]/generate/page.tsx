import Link from "next/link";
import { notFound } from "next/navigation";

import { GenerationWorkbench } from "@/components/signals/generation-workbench";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback } from "@/lib/airtable";
import { buildInitialGenerationFromSignal, toGenerationInputFromSignal } from "@/lib/generator";

export const dynamic = "force-dynamic";

export default async function GenerateSignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSignalWithFallback(id);

  if (!result.signal) {
    notFound();
  }

  const generationInput = toGenerationInputFromSignal(result.signal);
  const initialGeneration = buildInitialGenerationFromSignal(result.signal);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Generate Drafts</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Turn one interpreted signal into fixed-format draft assets for X, LinkedIn, Reddit, image direction, and short-form video. Drafts should follow the current scenario angle first, the saved interpretation second, and the source evidence third. Everything stays editable and human-reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/signals/${result.signal.recordId}`} className="text-[color:var(--accent)] underline underline-offset-4">
              Back to record
            </Link>
            <Link href="/signals" className="text-[color:var(--accent)] underline underline-offset-4">
              Back to signals
            </Link>
            <Link href={`/signals/${result.signal.recordId}/interpret`} className="text-[color:var(--accent)] underline underline-offset-4">
              Return to interpretation
            </Link>
          </div>
        </CardContent>
      </Card>

      <GenerationWorkbench
        signal={result.signal}
        generationInput={generationInput}
        initialGeneration={initialGeneration}
        source={result.source}
      />
    </div>
  );
}
