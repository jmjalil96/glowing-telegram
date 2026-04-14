export interface LoginSearch {
  redirect?: string;
}

export interface ResetPasswordSearch {
  token?: string;
}

export const defaultPostLoginHref = "/dashboard" as const;
const allowedPostLoginRedirects = ["/", "/dashboard"] as const;

const disallowedRedirectPrefixes = [
  "/login",
  "/forgot-password",
  "/reset-password",
] as const;

const isDisallowedRedirect = (redirect: string): boolean =>
  disallowedRedirectPrefixes.some(
    (prefix) =>
      redirect === prefix ||
      redirect.startsWith(`${prefix}/`) ||
      redirect.startsWith(`${prefix}?`) ||
      redirect.startsWith(`${prefix}#`),
  );

export const sanitizeAuthRedirect = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const redirect = value.trim();

  if (
    redirect.length === 0 ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    isDisallowedRedirect(redirect)
  ) {
    return undefined;
  }

  const isAllowedRedirect = allowedPostLoginRedirects.some(
    (allowedRedirect) =>
      redirect === allowedRedirect ||
      redirect.startsWith(`${allowedRedirect}?`) ||
      redirect.startsWith(`${allowedRedirect}#`),
  );

  if (!isAllowedRedirect) {
    return undefined;
  }

  return redirect;
};

export const validateLoginSearch = (
  search: Record<string, unknown>,
): LoginSearch => {
  const redirect = sanitizeAuthRedirect(search.redirect);

  return redirect ? { redirect } : {};
};

export const getPostLoginHref = (search: LoginSearch): string =>
  sanitizeAuthRedirect(search.redirect) ?? defaultPostLoginHref;

export const validateResetPasswordSearch = (
  search: Record<string, unknown>,
): ResetPasswordSearch => {
  const token =
    typeof search.token === "string" ? search.token.trim() : undefined;

  return token && token.length > 0 ? { token } : {};
};
