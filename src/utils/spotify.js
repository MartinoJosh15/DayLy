const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_SESSION_STORAGE_KEY = "dayly.spotify.session";
const SPOTIFY_PKCE_STORAGE_KEY = "dayly.spotify.pkce";

function getConfiguredRedirectUri() {
  const explicit = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

export function getSpotifyConfig() {
  return {
    clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() || "",
    redirectUri: getConfiguredRedirectUri(),
    scopes: [
      "streaming",
      "user-read-email",
      "user-read-private",
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
    ],
  };
}

function encodeBase64Url(bytes) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  return window.crypto.subtle.digest("SHA-256", data);
}

function generateRandomString(length = 64) {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes).slice(0, length);
}

async function createPkcePair() {
  const verifier = generateRandomString(96);
  const challengeBuffer = await sha256(verifier);
  const challenge = encodeBase64Url(new Uint8Array(challengeBuffer));
  return { verifier, challenge };
}

function savePkceState(payload) {
  localStorage.setItem(SPOTIFY_PKCE_STORAGE_KEY, JSON.stringify(payload));
}

function getPkceState() {
  const raw = localStorage.getItem(SPOTIFY_PKCE_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPkceState() {
  localStorage.removeItem(SPOTIFY_PKCE_STORAGE_KEY);
}

export function getStoredSpotifySession() {
  const raw = localStorage.getItem(SPOTIFY_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSpotifySession(payload) {
  localStorage.setItem(SPOTIFY_SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearSpotifySession() {
  localStorage.removeItem(SPOTIFY_SESSION_STORAGE_KEY);
}

function buildTokenSession(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    scope: data.scope,
    expiresAt: Date.now() + Math.max((data.expires_in || 3600) - 60, 60) * 1000,
  };
}

export async function beginSpotifyLogin() {
  const { clientId, redirectUri, scopes } = getSpotifyConfig();
  if (!clientId) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID.");
  }
  if (!redirectUri) {
    throw new Error("Missing Spotify redirect URI.");
  }

  const state = generateRandomString(24);
  const { verifier, challenge } = await createPkcePair();
  savePkceState({ verifier, state });

  const authUrl = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", scopes.join(" "));

  window.location.assign(authUrl.toString());
}

export async function maybeCompleteSpotifyLogin() {
  const { clientId, redirectUri } = getSpotifyConfig();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    clearPkceState();
    url.searchParams.delete("error");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    throw new Error(`Spotify sign-in failed: ${error}.`);
  }

  if (!code) return null;

  const pkce = getPkceState();
  if (!pkce?.verifier || !pkce?.state || pkce.state !== state) {
    clearPkceState();
    throw new Error("Spotify sign-in could not be verified. Try connecting again.");
  }

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    }),
  });

  const data = await response.json();
  clearPkceState();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Spotify token exchange failed.");
  }

  const session = buildTokenSession(data);
  saveSpotifySession(session);

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

  return session;
}

export async function refreshSpotifySession(session) {
  if (!session?.refreshToken) {
    throw new Error("Spotify session cannot be refreshed.");
  }

  const { clientId } = getSpotifyConfig();
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Spotify token refresh failed.");
  }

  const nextSession = {
    ...buildTokenSession(data),
    refreshToken: data.refresh_token || session.refreshToken,
  };

  saveSpotifySession(nextSession);
  return nextSession;
}

export async function ensureSpotifySession(session) {
  if (!session) return null;
  if (session.expiresAt && session.expiresAt > Date.now()) return session;
  return refreshSpotifySession(session);
}

export async function spotifyApiFetch(path, accessToken, init = {}) {
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.error_description || "Spotify request failed."
    );
  }

  return data;
}

let spotifySdkPromise = null;

export function loadSpotifySdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify SDK only loads in the browser."));
  }

  if (window.Spotify?.Player) {
    return Promise.resolve(window.Spotify);
  }

  if (spotifySdkPromise) return spotifySdkPromise;

  spotifySdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');

    function handleReady() {
      resolve(window.Spotify);
    }

    window.onSpotifyWebPlaybackSDKReady = handleReady;

    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => reject(new Error("Spotify Web Playback SDK failed to load."));
    document.body.appendChild(script);
  });

  return spotifySdkPromise;
}
