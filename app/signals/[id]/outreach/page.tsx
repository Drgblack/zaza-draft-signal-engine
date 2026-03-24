import Link from "next/link";
import { notFound } from "next/navigation";

import { OutreachPanel } from "@/components/outreach/outreach-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getSignalWithFallback } from "@/lib/signal-repository";
import { listInfluencers } from "@/lib/influencer-graph";
import {
  buildZazaConnectSignalHints,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";

export default async function SignalOutreachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, influencers, importedContexts] = await Promise.all([
    getSignalWithFallback(id),
    listInfluencers(),
    listImportedZazaConnectContexts(),
  ]);

  if (!result.signal) {
    notFound();
  }

  const bridgeHints = buildZazaConnectSignalHints({
    signal: result.signal,
    importedContexts,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Outreach branch</Badge>
          </div>
          <CardTitle className="text-3xl">Influencer & Outreach Content</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Generate short outreach, partnership, collaboration, and reply-support copy from this signal without turning the system into a CRM or messaging engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <Link href={`/signals/${result.signal.recordId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to record
          </Link>
          <Link href={`/signals/${result.signal.recordId}/review`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open final review
          </Link>
          <Link href={`/signals/${result.signal.recordId}/generate`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Review drafts
          </Link>
          <Link href="/influencers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open relationship memory
          </Link>
          <Link href="/replies" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open safe replies
          </Link>
          <Link href="/connect-bridge" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open Zaza Connect bridge
          </Link>
        </CardContent>
      </Card>

      <OutreachPanel signal={result.signal} influencers={influencers} bridgeHints={bridgeHints} />
    </div>
  );
}
