import Link from "next/link";

import { ConnectBridgePanel } from "@/components/connect/connect-bridge-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appendAuditEventsSafe } from "@/lib/audit";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import {
  buildZazaConnectBridgeSummary,
  getLatestZazaConnectExport,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEFAULT_IMPORT_TEMPLATE = {
  contextId: "zaza-connect-import-example",
  sourceApp: "zaza_connect",
  importedAt: new Date().toISOString(),
  relationshipStageHints: [
    {
      hintId: "relationship-example",
      name: "Teacher creator",
      relationshipStage: "contacted",
      tags: ["teacher", "creator"],
      note: "Responds best to calm product-trust framing.",
    },
  ],
  creatorRelevanceTags: [
    {
      tagId: "creator-tag-example",
      label: "Parent trust",
      keywords: ["parent", "trust", "communication"],
      note: "Useful creator theme for current collaboration outreach.",
    },
  ],
  outreachCampaignThemes: [
    {
      themeId: "theme-example",
      label: "Product trust",
      keywords: ["trust", "teacher-first", "overview"],
      campaignLabel: "Trust push",
      note: "Zaza Connect is seeing better response quality around calm trust language.",
    },
  ],
  collaborationOpportunities: [
    {
      opportunityId: "collab-example",
      label: "Teacher workflow collaboration",
      keywords: ["workflow", "teacher workload", "communication"],
      relatedCampaign: "Trust push",
      note: "Good fit for a collaboration-oriented follow-up.",
    },
  ],
  replyContextSignals: [
    {
      replySignalId: "reply-example",
      label: "Calm non-hype replies",
      keywords: ["calm", "trust", "teacher"],
      note: "Keep reply tone observational and low pressure.",
    },
  ],
  notes: "Compact example payload for bridge testing.",
};

export default async function ConnectBridgePage() {
  const [importedContexts, latestExport, influencerGraph] = await Promise.all([
    listImportedZazaConnectContexts(),
    getLatestZazaConnectExport(),
    buildInfluencerGraphState(),
  ]);

  const summary = buildZazaConnectBridgeSummary({
    latestExport,
    importedContexts,
    influencerGraphSummary: influencerGraph.summary,
  });

  await appendAuditEventsSafe([
    {
      signalId: `connect-bridge:${new Date().toISOString().slice(0, 10)}`,
      eventType: "ZAZA_CONNECT_BRIDGE_REFERENCED",
      actor: "operator",
      summary: "Viewed the Zaza Connect bridge.",
      metadata: {
        importCount: summary.importCount,
        exportCount: summary.exportCount,
        influencerRelevantExportCount: summary.influencerRelevantExportCount,
      },
    },
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Zaza Connect bridge</Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Loose coupling only</Badge>
          </div>
          <CardTitle className="text-3xl">Cross-App Zaza Connect Integration</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Export compact content intelligence for Zaza Connect and import bounded outreach or relationship context back into the signal engine without creating a hard runtime dependency.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
          <Link href="/influencers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open influencer graph
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Imports</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.importCount}</p>
          <p className="mt-1 text-sm text-slate-600">Saved Zaza Connect context snapshots.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Exports</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.exportCount}</p>
          <p className="mt-1 text-sm text-slate-600">Portable content-intelligence snapshots created here.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Imported themes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.importedThemeCount}</p>
          <p className="mt-1 text-sm text-slate-600">Campaign and outreach themes available for content context.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Collab opportunities</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.collaborationOpportunityCount}</p>
          <p className="mt-1 text-sm text-slate-600">Light collaboration hints imported from Zaza Connect.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Influencer-relevant posts</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.influencerRelevantExportCount}</p>
          <p className="mt-1 text-sm text-slate-600">Current export items most relevant to outreach and creator context.</p>
        </div>
      </div>

      <ConnectBridgePanel initialPayloadText={JSON.stringify(DEFAULT_IMPORT_TEMPLATE, null, 2)} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Latest Export</CardTitle>
            <CardDescription>
              The most recent bridge snapshot that Zaza Connect can consume without a live sync dependency.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!latestExport ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No bridge export has been created yet.
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Generated</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDateTime(latestExport.generatedAt)}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {latestExport.strongContentCandidates.length} strong candidates · {latestExport.influencerRelevantPosts.length} influencer-relevant posts · {latestExport.distributionOpportunities.length} distribution opportunities
                  </p>
                </div>
                <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  {JSON.stringify(latestExport, null, 2)}
                </pre>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imported Context</CardTitle>
            <CardDescription>
              Bounded relationship, theme, and collaboration context imported from Zaza Connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Latest import</p>
              <p className="mt-2 text-sm text-slate-700">
                {summary.latestImportAt ? formatDateTime(summary.latestImportAt) : "No import recorded yet."}
              </p>
            </div>
            {summary.topNotes.map((note) => (
              <div key={note} className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                {note}
              </div>
            ))}
            {importedContexts.slice(0, 3).map((context) => (
              <div key={context.contextId} className="rounded-2xl bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{context.sourceApp}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {formatDateTime(context.importedAt)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  {context.outreachCampaignThemes.length} theme{context.outreachCampaignThemes.length === 1 ? "" : "s"} · {context.collaborationOpportunities.length} collaboration opportunit{context.collaborationOpportunities.length === 1 ? "y" : "ies"} · {context.relationshipStageHints.length} relationship hint{context.relationshipStageHints.length === 1 ? "" : "s"}
                </p>
                {context.notes ? (
                  <p className="mt-2 text-sm text-slate-600">{context.notes}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
