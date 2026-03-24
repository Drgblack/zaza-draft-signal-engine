import { NextResponse } from "next/server";

import { getSignalWithFallback } from "@/lib/signal-repository";
import {
  cancelPostingAssistantPackage,
  confirmPostingAssistantPackageManually,
  getSafePostingEligibilityForPackage,
  postingAssistantActionRequestSchema,
  safePostPostingAssistantPackage,
  stagePostingAssistantPackage,
} from "@/lib/posting-assistant";
import type { PostingAssistantActionResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = postingAssistantActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PostingAssistantActionResponse>(
      {
        success: false,
        persisted: false,
        package: null,
        message: "Posting assistant action could not be completed.",
        error: parsed.error.issues[0]?.message ?? "Invalid posting assistant payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "stage_package") {
      const signalResult = await getSignalWithFallback(parsed.data.signalId);
      if (!signalResult.signal) {
        return NextResponse.json<PostingAssistantActionResponse>(
          {
            success: false,
            persisted: false,
            package: null,
            message: "Posting package could not be staged.",
            error: signalResult.error ?? "Signal not found.",
          },
          { status: signalResult.source === "mock" ? 404 : 502 },
        );
      }

      const result = await stagePostingAssistantPackage({
        signal: signalResult.signal,
        platform: parsed.data.platform,
        overrides: {
          finalCaption: parsed.data.finalCaption ?? null,
          publishPrepBundleJson: parsed.data.publishPrepBundleJson ?? null,
          assetBundleJson: parsed.data.assetBundleJson ?? null,
          preferredAssetType: parsed.data.preferredAssetType ?? null,
          selectedImageAssetId: parsed.data.selectedImageAssetId ?? null,
          selectedVideoConceptId: parsed.data.selectedVideoConceptId ?? null,
          generatedImageUrl: parsed.data.generatedImageUrl ?? null,
          readinessReason: parsed.data.readinessReason ?? null,
        },
      });

      return NextResponse.json<PostingAssistantActionResponse>({
        success: true,
        persisted: true,
        package: result.pkg,
        message: result.created
          ? "Posting package staged for manual posting."
          : "Staged posting package updated.",
      });
    }

    if (parsed.data.action === "cancel_package") {
      const pkg = await cancelPostingAssistantPackage(parsed.data.packageId);

      return NextResponse.json<PostingAssistantActionResponse>({
        success: true,
        persisted: true,
        package: pkg,
        message: "Staged posting package canceled.",
      });
    }

    if (parsed.data.action === "safe_post_now") {
      try {
        const result = await safePostPostingAssistantPackage({
          packageId: parsed.data.packageId,
          confirm: parsed.data.confirm ?? false,
        });

        return NextResponse.json<PostingAssistantActionResponse>({
          success: true,
          persisted: true,
          package: result.pkg,
          postingEntry: result.entry,
          signal: result.signal,
          safePosting: result.eligibility,
          message: "Strict safe-mode posting completed successfully.",
        });
      } catch (error) {
        const eligibility = await getSafePostingEligibilityForPackage(
          parsed.data.packageId,
        ).catch(() => null);

        return NextResponse.json<PostingAssistantActionResponse>(
          {
            success: false,
            persisted: false,
            package: null,
            safePosting: eligibility,
            message: "Safe-mode posting could not be completed.",
            error:
              error instanceof Error
                ? error.message
                : "Unknown safe-mode posting failure.",
          },
          {
            status:
              eligibility?.postingEligibility === "blocked"
                ? 409
                : eligibility?.postingEligibility === "manual_only"
                  ? 403
                  : 500,
          },
        );
      }
    }

    const result = await confirmPostingAssistantPackageManually({
      packageId: parsed.data.packageId,
      postedAt: parsed.data.postedAt,
      postUrl: parsed.data.postUrl ?? null,
      note: parsed.data.note ?? null,
    });

    return NextResponse.json<PostingAssistantActionResponse>({
      success: true,
      persisted: true,
      package: result.pkg,
      postingEntry: result.entry,
      signal: result.signal,
      safePosting: null,
      message: "Manual posting confirmed from the staged package.",
    });
  } catch (error) {
    return NextResponse.json<PostingAssistantActionResponse>(
      {
        success: false,
        persisted: false,
        package: null,
        message: "Posting assistant action could not be completed.",
        error: error instanceof Error ? error.message : "Unknown posting assistant failure.",
      },
      { status: 500 },
    );
  }
}

