function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufferToBase64Url(bytes.buffer);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToBase64Url(digest);
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomVerifier();
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}
