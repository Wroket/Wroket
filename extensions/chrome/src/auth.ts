import { createPkcePair } from "./pkce";
import { exchangeToken } from "./api";
import { getConfig } from "./config";
import { clearAuth, setAuth } from "./storage";

/**
 * Launch Chrome identity web auth flow → /extension/connect → token.
 */
export async function connectBrowser(): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  const redirectUri = chrome.identity.getRedirectURL();
  const { webBase } = await getConfig();
  const connectUrl = new URL(`${webBase.replace(/\/$/, "")}/extension/connect`);
  connectUrl.searchParams.set("code_challenge", challenge);
  connectUrl.searchParams.set("redirect_uri", redirectUri);
  connectUrl.searchParams.set("browser_name", "Chrome");

  const redirect = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: connectUrl.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message || "Auth cancelled"));
          return;
        }
        resolve(responseUrl);
      },
    );
  });

  const code = new URL(redirect).searchParams.get("code");
  if (!code) throw new Error("No authorization code returned");

  const { key, id } = await exchangeToken({
    code,
    codeVerifier: verifier,
    redirectUri,
  });
  await setAuth({
    token: key,
    keyId: id,
    connectedAt: new Date().toISOString(),
  });
}

export async function disconnectBrowser(): Promise<void> {
  await clearAuth();
}
