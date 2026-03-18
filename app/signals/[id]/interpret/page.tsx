import Link from "next/link";
import { notFound } from "next/navigation";

import { InterpretationWorkbench } from "@/components/signals/interpretation-workbench";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback } from "@/lib/airtable";
import { buildInitialInterpretationFromSignal } from "@/lib/interpreter";

export const dynamic = "force-dynamic";

export default async function InterpretSignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSignalWithFallback(id);

  if (!result.signal) {
    notFound();
  }

  const initialInterpretation = buildInitialInterpretationFromSignal(result.signal);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Interpret Signal</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            This is the V1 editorial judgement layer: classify the signal, surface the professional risk, and choose the right hook and packaging direction before any draft generation exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          <Link href="/signals" className="text-[color:var(--accent)] underline underline-offset-4">
            Back to signals
          </Link>
        </CardContent>
      </Card>

      <InterpretationWorkbench signal={result.signal} initialInterpretation={initialInterpretation} source={result.source} />
    </div>
  );
}
