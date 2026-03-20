import Link from "next/link";

import { SafeReplyPanel } from "@/components/replies/safe-reply-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSafeReplyState } from "@/lib/safe-replies";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const safeReplies = await buildSafeReplyState();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Safe reply layer</Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Suggest-only by default</Badge>
          </div>
          <CardTitle className="text-3xl">Safe Autonomous Reply Handling</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Low-risk replies can be staged and approved for manual sending. Ambiguous, emotional, legal,
            payment, policy, or support-sensitive replies stay in manual review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <Link href="/influencers" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open relationship memory
          </Link>
          <Link href="/digest" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Back to digest
          </Link>
        </CardContent>
      </Card>

      <SafeReplyPanel initialRows={safeReplies.rows} initialSummary={safeReplies.summary} />
    </div>
  );
}
