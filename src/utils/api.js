export function getSupabaseFunctionHeaders(session) {
  const headers = {
    "Content-Type": "application/json",
  };
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const accessToken = session?.access_token?.trim();

  if (anonKey) {
    headers.apikey = anonKey;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

export function getAiPlanUrl() {
  const explicitUrl = import.meta.env.VITE_AI_PLAN_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/ai-plan`;
  }

  return "/api/ai-plan";
}

export function getAiCaptureUrl() {
  const explicitUrl = import.meta.env.VITE_AI_CAPTURE_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/ai-capture`;
  }

  return "/api/ai-capture";
}

export function getCanvasScanUrl(session) {
  const explicitUrl = import.meta.env.VITE_CANVAS_SCAN_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (session?.access_token && supabaseUrl) {
    return `${supabaseUrl}/functions/v1/canvas-scan`;
  }

  if (import.meta.env.DEV) {
    return "/api/canvas-scan";
  }

  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/canvas-scan`;
  }

  return "/api/canvas-scan";
}

export function getCanvasScanHeaders(session) {
  const headers = getSupabaseFunctionHeaders(session);

  const explicitUrl = import.meta.env.VITE_CANVAS_SCAN_URL?.trim();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const usingSupabaseFunction =
    Boolean(explicitUrl) || (!import.meta.env.DEV && Boolean(supabaseUrl));

  if (!usingSupabaseFunction) {
    return {
      "Content-Type": "application/json",
    };
  }

  return headers;
}

export async function readJsonResponse(response, label = "Request") {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!rawText) return {};

  if (!contentType.includes("application/json")) {
    const preview = rawText.slice(0, 120).trim().toLowerCase();

    if (preview.startsWith("<!doctype") || preview.startsWith("<html")) {
      throw new Error(
        import.meta.env.DEV
          ? `${label} endpoint returned HTML instead of JSON. Make sure the app is running with the expected backend route.`
          : `${label} endpoint is unavailable. Deploy the matching Supabase edge function and set the correct app URL.`
      );
    }

    throw new Error(`${label} returned an unexpected response format.`);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}
