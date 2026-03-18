export interface AppConfig {
  appName: string;
  airtablePat?: string;
  airtableBaseId?: string;
  airtableTableName?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  isAirtableConfigured: boolean;
  generationProvider: "anthropic" | "openai" | "mock";
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
  const anthropicApiKey = readEnv("ANTHROPIC_API_KEY");
  const openaiApiKey = readEnv("OPENAI_API_KEY");
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
    anthropicApiKey,
    openaiApiKey,
    isAirtableConfigured: missingAirtableEnv.length === 0,
    generationProvider: anthropicApiKey ? "anthropic" : openaiApiKey ? "openai" : "mock",
    missingAirtableEnv,
  };
}

const appConfig = buildAppConfig();

export function getAppConfig(): AppConfig {
  return appConfig;
}
