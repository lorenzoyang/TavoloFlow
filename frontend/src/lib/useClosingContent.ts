import { useState } from "react";

// Keeps a closing sheet or dialog showing what it showed while open. Base UI plays the exit animation
// after `open` turns false, while the caller has usually cleared the state behind the content already;
// without this the panel would empty (and its title change) before it fades out. Nothing needs
// clearing afterwards: Base UI unmounts the popup once the animation ends.
//
// It stores the latest open value during render (React's "storing information from previous renders"),
// so pass a prop or a state value: an object built afresh in the calling component would never equal
// the stored one and would re-render forever.
export function useClosingContent<T>(open: boolean, value: T): T {
  const [last, setLast] = useState(() => value);
  if (open && last !== value) setLast(() => value);
  return open ? value : last;
}
