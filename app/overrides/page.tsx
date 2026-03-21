import { FounderOverrideManager } from "@/components/overrides/founder-override-manager";
import { FounderOverrideSummary } from "@/components/overrides/founder-override-summary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { syncFounderOverrideState } from "@/lib/founder-overrides";

export const dynamic = "force-dynamic";

export default async function OverridesPage() {
  const founderOverrides = await syncFounderOverrideState();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Founder controls</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
              {founderOverrides.activeOverrides.length} active override{founderOverrides.activeOverrides.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Founder Overrides</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight temporary direction for steering planning, strategy, generation, and distribution. Overrides stay visible, expire automatically, and do not bypass autonomy or safety guardrails.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <FounderOverrideSummary state={founderOverrides} compact />
        </CardContent>
      </Card>

      <FounderOverrideManager initialState={founderOverrides} />
    </div>
  );
}
