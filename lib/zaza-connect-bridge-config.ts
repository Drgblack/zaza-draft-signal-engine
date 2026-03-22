export function getZazaConnectBridgeBlobAccess() {
  return process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS?.trim().toLowerCase() === "public"
    ? "public"
    : "private";
}
