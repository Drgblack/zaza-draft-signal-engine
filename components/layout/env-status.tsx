import { Badge } from "@/components/ui/badge";

export function EnvStatus({ isAirtableConfigured }: { isAirtableConfigured: boolean }) {
  return isAirtableConfigured ? (
    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Airtable Connected</Badge>
  ) : (
    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Mock Mode</Badge>
  );
}
