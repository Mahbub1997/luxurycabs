// Human-readable auth error messages + detail capture for debugging sign-in.

export type AuthErrorDetail = {
  at: string;
  where: string;
  message: string;
  code?: string | undefined;
  status?: number | undefined;
  raw?: string | undefined;
};

const LOG_KEY = "auth_error_log";

export function describeAuthError(err: unknown): { message: string; code?: string; status?: number } {
  const e = err as any;
  const code: string | undefined = e?.code ?? e?.error_code ?? e?.error ?? undefined;
  const status: number | undefined = typeof e?.status === "number" ? e.status : undefined;
  const raw: string = e?.message ?? e?.error_description ?? (typeof err === "string" ? err : "");

  const map: Record<string, string> = {
    invalid_credentials: "Wrong username or password.",
    invalid_grant: "Wrong username or password.",
    email_not_confirmed: "This email is not confirmed yet. Check your inbox for the confirmation link.",
    user_not_found: "No account exists for these details.",
    over_email_send_rate_limit: "Too many attempts. Please wait a few minutes and try again.",
    over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
    validation_failed: "Please fill in all fields correctly.",
    signup_disabled: "New sign-ups are currently disabled.",
    provider_disabled: "Google sign-in is not enabled for this app yet.",
    unsupported_provider: "Google sign-in is not enabled for this app yet.",
    popup_closed: "The Google window was closed before sign-in finished.",
    access_denied: "You cancelled the Google sign-in.",
  };

  const lower = String(raw || "").toLowerCase();
  let message =
    (code && map[code]) ||
    (lower.includes("invalid login credentials") ? map['invalid_credentials'] : undefined) ||
    (lower.includes("unsupported provider") ? map['unsupported_provider'] : undefined) ||
    (lower.includes("popup") && lower.includes("clos") ? map['popup_closed'] : undefined) ||
    (lower.includes("failed to fetch") || lower.includes("networkerror")
      ? "Can't reach the server. Check your internet connection and try again."
      : undefined) ||
    (status === 401 || status === 403 ? "Not authorised. Please try signing in again." : undefined) ||
    (status && status >= 500 ? "The server is temporarily unavailable. Please try again shortly." : undefined) ||
    raw ||
    "Sign-in failed. Please try again.";

  if (message.length > 200) message = message.slice(0, 200) + "…";
  return { message, ...(code ? { code } : {}), ...(status ? { status } : {}) };
}

export function logAuthError(where: string, err: unknown): AuthErrorDetail {
  const { message, code, status } = describeAuthError(err);
  let raw: string | undefined;
  try {
    raw = JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})).slice(0, 1000);
  } catch {
    raw = String(err);
  }
  const detail: AuthErrorDetail = { at: new Date().toISOString(), where, message, code, status, raw };
  // Visible in the browser console for support/debugging.
  console.error(`[auth:${where}]`, { message, code, status, error: err });
  if (typeof window !== "undefined") {
    try {
      const prev = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as AuthErrorDetail[];
      localStorage.setItem(LOG_KEY, JSON.stringify([detail, ...prev].slice(0, 20)));
    } catch {}
  }
  return detail;
}

export function getAuthErrorLog(): AuthErrorDetail[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as AuthErrorDetail[];
  } catch {
    return [];
  }
}

export function formatAuthErrorDetail(d: AuthErrorDetail): string {
  const bits = [d.where, d.code ? `code=${d.code}` : "", d.status ? `status=${d.status}` : ""].filter(Boolean);
  return bits.join(" · ");
}
