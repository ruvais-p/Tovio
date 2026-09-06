export async function deriveMediaKey(
  roomId: string,
  roomKey: string,
): Promise<ArrayBuffer> {
  const normalized = roomKey.replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveBits",
  ]);
  raw.fill(0);
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(roomId),
      info: new TextEncoder().encode("excalidraw/session-media/v1"),
    },
    key,
    256,
  );
}
