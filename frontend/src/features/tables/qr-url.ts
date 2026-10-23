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
      "VITE_PUBLIC_BASE_URL 必须是 HTTP(S) 网站 origin，不含路径、账号、查询参数或片段。",
    );
  }
  if (!/^\/q\/[A-Za-z0-9_-]{1,128}$/.test(path))
    throw new Error("二维码路径无效，请重新读取桌位。");
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
