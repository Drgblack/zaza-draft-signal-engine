import Link from "next/link";

import { PostingAssistantPanel } from "@/components/posting/posting-assistant-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAuditEvents } from "@/lib/audit";
import { buildDistributionBundles, buildDistributionSummary } from "@/lib/distribution";
import { buildSignalNarrativeSequence, findNarrativeSequenceStep } from "@/lib/narrative-sequences";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildSafePostingEligibilityMap, buildSafePostingInsights, loadSafePostingEvaluationData } from "@/lib/safe-posting";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PostingPage() {
  const safePostingData = await loadSafePostingEvaluationData();
  const strategy = safePostingData.strategy;
  const packages = await listPostingAssistantPackages();
  const activePackages = packages.filter((pkg) => pkg.status === "staged_for_posting");
  const postedPackages = packages.filter((pkg) => pkg.status === "posted");
  const platforms = Array.from(new Set(activePackages.map((pkg) => pkg.platform)));
  const signalsById = new Map(safePostingData.signals.map((signal) => [signal.recordId, signal]));
  const sequenceByPackageId = Object.fromEntries(
    packages.map((pkg) => {
      const signal = signalsById.get(pkg.signalId);
      const sequence = signal ? buildSignalNarrativeSequence({ signal, strategy }) : null;
      return [pkg.packageId, sequence ? findNarrativeSequenceStep(sequence, pkg.platform) : null];
    }),
  );
  const auditEvents = await listAuditEvents({
    signalIds: activePackages.map((pkg) => pkg.signalId),
  });
  const distributionBundles = buildDistributionBundles({
    packages: activePackages,
    sequenceByPackageId,
  });
  const distributionSummary = buildDistributionSummary(distributionBundles);
  const safePostingEligibilityByPackageId = buildSafePostingEligibilityMap({
    packages,
    candidateBySignalId: safePostingData.approvalCandidateBySignalId,
    tuning: safePostingData.tuning,
    experiments: safePostingData.experiments,
  });
  const safePostingInsights = buildSafePostingInsights({
    packages,
    eligibilityByPackageId: safePostingEligibilityByPackageId,
  });
  const safeModeEnabled = safePostingData.tuning.settings.safeModePosting === "enabled";
  const requireConfirmation =
    safePostingData.tuning.settings.safeModePostingConfirmation === "required";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
              {activePackages.length} ready to post
            </Badge>
            <Badge
              className={
                safeModeEnabled
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-slate-100 text-slate-700 ring-slate-200"
              }
            >
              Safe mode {safeModeEnabled ? "enabled" : "disabled"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Confirmation {requireConfirmation ? "required" : "optional"}
            </Badge>
            {packages[0]?.updatedAt ? (
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                Updated {formatDateTime(packages[0].updatedAt)}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-3xl">Posting Assistant</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Manual-confirmed posting packages assembled from final review, publish prep, and selected assets so the last execution step stays fast and inspectable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Safe-mode controls
          </Link>
          <Link href="/weekly-pack" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/review?view=ready_to_approve" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review queue
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Staged packages</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{activePackages.length}</p>
          <p className="mt-1 text-sm text-slate-600">Manual-ready packages awaiting platform confirmation.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Confirmed posted</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{postedPackages.length}</p>
          <p className="mt-1 text-sm text-slate-600">Packages already confirmed into posting memory.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution bundles</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{distributionSummary.bundleCount}</p>
          <p className="mt-1 text-sm text-slate-600">{platforms.length > 0 ? platforms.join(" · ") : "No platform staged yet."}</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Multi-platform sets</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {distributionSummary.multiPlatformBundleCount}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {distributionSummary.sequencedBundleCount > 0
              ? `${distributionSummary.sequencedBundleCount} bundle${distributionSummary.sequencedBundleCount === 1 ? "" : "s"} already align to a narrative sequence.`
              : "Grouped platform variants are ready for manual execution when staged."}
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Prepared distribution events</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {auditEvents.filter((event) => event.eventType === "DISTRIBUTION_PREPARED").length}
          </p>
          <p className="mt-1 text-sm text-slate-600">Low-noise safe-mode bundle preparation actions recorded in the audit trail.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Safe-post eligible</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{safePostingInsights.eligibleCount}</p>
          <p className="mt-1 text-sm text-slate-600">Only staged, high-confidence, conflict-free, complete packages on supported routes.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Safe-posted</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{safePostingInsights.safePostedCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {safePostingInsights.failedCount > 0
              ? `${safePostingInsights.failedCount} staged package${safePostingInsights.failedCount === 1 ? "" : "s"} currently show a safe-post failure.`
              : "No staged package currently shows a safe-post failure."}
          </p>
        </div>
      </div>

      <PostingAssistantPanel
        packages={packages}
        sequenceByPackageId={sequenceByPackageId}
        distributionBundles={distributionBundles}
        safePostingEligibilityByPackageId={safePostingEligibilityByPackageId}
        safeModeEnabled={safeModeEnabled}
        safePostingRequiresConfirmation={requireConfirmation}
      />
    </div>
  );
}
