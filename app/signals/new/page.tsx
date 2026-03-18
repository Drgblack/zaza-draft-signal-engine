import { NewSignalForm } from "@/components/signals/new-signal-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewSignalPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">New Signal</CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7">
            Manual intake only for this run. Capture the source, assign a first-pass category and severity, then hand the record into the review workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm leading-6 text-slate-600">
          No scraping, no autonomous triage, and no generation calls happen automatically in V1.
        </CardContent>
      </Card>

      <NewSignalForm />
    </div>
  );
}
