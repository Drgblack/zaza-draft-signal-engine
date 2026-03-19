import Link from "next/link";

import { PatternBundleFormCard } from "@/components/patterns/pattern-bundle-form-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";

export const dynamic = "force-dynamic";

export default async function PatternBundlesPage() {
  const bundles = await listPatternBundles();
  const patterns = await listPatterns({ includeRetired: true });
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Manual kits</Badge>
          </div>
          <CardTitle className="text-3xl">Pattern Bundles</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Bundles are lightweight families of related patterns. They help organise the playbook without turning the library into a taxonomy engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          {bundles.length} bundles across {patterns.length} saved patterns.
        </CardContent>
      </Card>

      <PatternBundleFormCard patterns={patterns} />

      {bundles.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-sm text-slate-600">
            No bundles saved yet. Create a kit when several patterns belong to the same communication family.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {bundles.map((bundle) => {
            const includedPatterns = bundle.patternIds
              .map((patternId) => patternById.get(patternId))
              .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern));

            return (
              <Card key={bundle.id}>
                <CardHeader>
                  <CardTitle className="text-xl">{bundle.name}</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">{bundle.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-600">
                    {includedPatterns.length} patterns · {includedPatterns.filter((pattern) => pattern.lifecycleState === "active").length} active
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {includedPatterns.slice(0, 4).map((pattern) => (
                      <Badge key={pattern.id} className={pattern.lifecycleState === "retired" ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-white text-slate-700 ring-slate-200"}>
                        {pattern.name}
                      </Badge>
                    ))}
                  </div>
                  <Link href={`/pattern-bundles/${bundle.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    View bundle
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
