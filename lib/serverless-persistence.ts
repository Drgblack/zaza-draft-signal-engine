export function isReadOnlyFilesystemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;

  return code === "EROFS" || code === "EPERM" || code === "EACCES" || code === "ENOENT";
}

export function logServerlessPersistenceFallback(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.warn(
    `${scope}: filesystem persistence unavailable, falling back to in-memory state. ${message}`,
  );
}
