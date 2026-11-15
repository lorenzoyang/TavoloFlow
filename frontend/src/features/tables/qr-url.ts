export function publicMenuUrl(
  path: string,
  currentOrigin: string,
  configuredOrigin?: string,
): string {
  const base = new URL(configuredOrigin?.trim() || currentOrigin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error(
      "VITE_PUBLIC_BASE_URL must be an HTTP(S) origin, without path, credentials, query or fragment.",
    );
  }
  // A table's /q/{token} or the restaurant's online link /r/{slug}.
  if (!/^\/(q\/[A-Za-z0-9_-]{1,128}|r\/[a-z0-9][a-z0-9-]{1,38}[a-z0-9])$/.test(path))
    throw new Error("Invalid public path. Reload the page.");
  return new URL(path, base.origin).href;
}

export function isLocalOnlyUrl(value: string): boolean {
  const host = new URL(value).hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "[::]" ||
    host === "0.0.0.0" ||
    /^127\./.test(host)
  );
}
