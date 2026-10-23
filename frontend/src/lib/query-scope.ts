export function isPrivateQuery(query: { queryKey: readonly unknown[] }) {
  return query.queryKey[0] !== "public" && query.queryKey[0] !== "guest" && query.queryKey[0] !== "platform" &&
    !(query.queryKey[0] === "auth" && query.queryKey[1] === "me");
}

export function isPlatformQuery(query: { queryKey: readonly unknown[] }) {
  return query.queryKey[0] === "platform" && query.queryKey[1] !== "me";
}

export function isStoreMutation(meta: Record<string, unknown> | undefined) {
  return meta?.identityScope !== "guest" && meta?.identityScope !== "platform";
}
