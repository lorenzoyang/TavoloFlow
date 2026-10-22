export function isPrivateQuery(query: { queryKey: readonly unknown[] }) {
  return query.queryKey[0] !== "public" &&
    !(query.queryKey[0] === "auth" && query.queryKey[1] === "me");
}
