const MARKER_PARAM = "socialSignIn";
const MARKER_VALUE = "failed";
const RETURNED_PARAMS = [MARKER_PARAM, "error", "error_description"];

export type SocialSignInError = { code: string; description: string | null };

export function socialSignInErrorCallbackURL(pathname: string): string {
  return `${pathname}?${MARKER_PARAM}=${MARKER_VALUE}`;
}

export function readSocialSignInError(): SocialSignInError | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get(MARKER_PARAM) !== MARKER_VALUE) return null;
  return { code: params.get("error") ?? "", description: params.get("error_description") };
}

export function clearSocialSignInError(): void {
  const url = new URL(window.location.href);
  for (const param of RETURNED_PARAMS) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", url);
}
