import { useState } from "react";

// Remembers a photo that failed to load (for example, replaced since the menu was read), so the card
// falls back to its text-only layout until the item points at a different photo.
export function usePhoto(imageId: string | null) {
  const [failed, setFailed] = useState<string | null>(null);
  return {
    shown: imageId !== null && imageId !== failed ? imageId : null,
    fail: () => setFailed(imageId),
  };
}
