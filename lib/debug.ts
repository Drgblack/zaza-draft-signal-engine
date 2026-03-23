function normalizeFlag(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isDebugEnabled(): boolean {
  const explicitFlag = normalizeFlag(process.env.NEXT_PUBLIC_DEBUG_ENABLED);

  if (explicitFlag === "true") {
    return true;
  }

  if (explicitFlag === "false") {
    return false;
  }

  return normalizeFlag(process.env.NODE_ENV) !== "production";
}
