import Link from "next/link";

import { InfluencerGraphPanel } from "@/components/influencers/influencer-graph-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";

export const dynamic = "force-dynamic";

export default async function InfluencersPage() {
  const state = await buildInfluencerGraphState();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Relationship memory</Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {state.summary.influencerCount} influencer{state.summary.influencerCount === 1 ? "" : "s"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Influencer Graph</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight relationship memory for who has been contacted, what was said, and which relationships need a calm follow-up next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/signals" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open signals
          </Link>
        </CardContent>
      </Card>

      <InfluencerGraphPanel rows={state.rows} summary={state.summary} />
    </div>
  );
}
