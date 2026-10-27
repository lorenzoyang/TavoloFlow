import { useEffect } from "react";
import { themeAttribute } from "./theme";

// Applies a restaurant's colours to <html> while the calling page is mounted. Dialogs, menus and sheets
// render in portals under <body>, so a wrapper element would leave them in the default palette.
export function useDocumentTheme(theme: unknown) {
  const value = themeAttribute(theme);
  useEffect(() => {
    if (!value) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", value);
    return () => root.removeAttribute("data-theme");
  }, [value]);
}
