export type TwoFactorMethod = "totp" | "otp";

const TWO_FACTOR_METHODS: TwoFactorMethod[] = ["totp", "otp"];

export const TWO_FACTOR_PLUGIN_ID = "twoFactor";

export const TWO_FACTOR_METHODS_STORAGE_KEY = "better-auth-ui.two-factor-methods";

type TwoFactorRedirect = {
  twoFactorRedirect: true;
  twoFactorMethods?: unknown;
};

export function isTwoFactorRedirect(data: unknown): data is TwoFactorRedirect {
  return typeof data === "object" && data !== null && (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true;
}

export function parseTwoFactorMethods(methods?: unknown): TwoFactorMethod[] {
  if (!Array.isArray(methods)) return [];

  return TWO_FACTOR_METHODS.filter((method) => methods.includes(method));
}

export function storeTwoFactorMethods(methods?: unknown) {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(TWO_FACTOR_METHODS_STORAGE_KEY, JSON.stringify(parseTwoFactorMethods(methods)));
  } catch {}
}

export function readTwoFactorMethods(): TwoFactorMethod[] {
  if (typeof sessionStorage === "undefined") return TWO_FACTOR_METHODS;

  try {
    const stored = sessionStorage.getItem(TWO_FACTOR_METHODS_STORAGE_KEY);
    if (!stored) return TWO_FACTOR_METHODS;

    const methods = parseTwoFactorMethods(JSON.parse(stored));
    return methods.length ? methods : TWO_FACTOR_METHODS;
  } catch {
    return TWO_FACTOR_METHODS;
  }
}

export function clearTwoFactorMethods() {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.removeItem(TWO_FACTOR_METHODS_STORAGE_KEY);
  } catch {
    // probably already removed
  }
}
