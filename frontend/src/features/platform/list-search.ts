import type { RestaurantsSearch } from "./state";

// The restaurant list's last filters, so the back links of the other platform pages return to the
// same filtered page. It lives for the tab's session only; the URL itself stays the source.
let last: RestaurantsSearch = {};
export function rememberListSearch(search: RestaurantsSearch) {
  last = search;
}
export function listSearch(): RestaurantsSearch {
  return last;
}
