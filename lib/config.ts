export interface AppConfig {
  appName: string;
  airtablePat?: string;
  airtableBaseId?: string;
  airtableTableName?: string;
  isAirtableConfigured: boolean;
  missingAirtableEnv: string[];
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function buildAppConfig(): AppConfig {
  const airtablePat = readEnv("AIRTABLE_PAT");
  const airtableBaseId = readEnv("AIRTABLE_BASE_ID");
  const airtableTableName = readEnv("AIRTABLE_TABLE_NAME");
  const appName = readEnv("NEXT_PUBLIC_APP_NAME") ?? "Zaza Draft Signal Engine";

  const missingAirtableEnv = [
    ["AIRTABLE_PAT", airtablePat],
    ["AIRTABLE_BASE_ID", airtableBaseId],
    ["AIRTABLE_TABLE_NAME", airtableTableName],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);

  return {
    appName,
    airtablePat,
    airtableBaseId,
    airtableTableName,
    isAirtableConfigured: missingAirtableEnv.length === 0,
    missingAirtableEnv,
  };
}

const appConfig = buildAppConfig();

export function getAppConfig(): AppConfig {
  return appConfig;
}
