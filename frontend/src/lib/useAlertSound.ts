import { useCallback, useEffect, useRef, useState } from "react";
import { AlertAudio, readSoundPreference, saveSoundPreference, type Chime } from "./alert-sound";
import { onLifecycleChange } from "./useLiveView";

// Activation-triggering events: a mouse press counts on pointerdown, a touch on pointerup.
const gestures = ["pointerdown", "pointerup", "keydown"] as const;

// The on/off switch is a device preference stored under preferenceKey; on by default. Without a key the
// sound cannot be turned off (the pending pickup alert).
export function useAlertSound(preferenceKey: string | null, chime: Chime) {
  const [sound, setSound] = useState(
    () => preferenceKey === null || readSoundPreference(preferenceKey),
  );
  const [audible, setAudible] = useState(true);
  const [soundUnsupported, setSoundUnsupported] = useState(false);
  const audio = useRef<AlertAudio | null>(null);

  useEffect(() => {
    if (!sound) return;
    const player = (audio.current ??= new AlertAudio());
    let timer = 0;
    // Reported as blocked only if audio is still not running shortly after an attempt in the foreground,
    // so a start the browser allows, or a phone's suspension in the background, never flashes the notice.
    const settle = () => {
      window.clearTimeout(timer);
      if (player.running) setAudible(true);
      else
        timer = window.setTimeout(
          () => setAudible(player.running || document.visibilityState !== "visible"),
          1500,
        );
    };
    // Retried on every tap and on returning to the foreground until the browser lets audio run.
    const wake = () => {
      if (player.running || document.visibilityState !== "visible") return;
      try {
        player.start();
      } catch {
        setSoundUnsupported(true);
        return;
      }
      settle();
    };
    player.onChange = settle;
    wake();
    for (const type of gestures) window.addEventListener(type, wake, true);
    const stopListening = onLifecycleChange(wake);
    return () => {
      window.clearTimeout(timer);
      for (const type of gestures) window.removeEventListener(type, wake, true);
      stopListening();
      player.onChange = null;
      player.close();
      audio.current = null;
    };
  }, [sound]);

  // Called inside a click, where every browser lets audio start.
  const unlockSound = useCallback(() => {
    try {
      audio.current ??= new AlertAudio();
      audio.current.start();
    } catch {
      setSoundUnsupported(true);
    }
  }, []);

  const toggleSound = useCallback(() => {
    if (preferenceKey === null) return;
    saveSoundPreference(preferenceKey, !sound);
    setSound(!sound);
    setAudible(true);
    setSoundUnsupported(false);
    if (!sound) unlockSound();
  }, [preferenceKey, sound, unlockSound]);

  const play = useCallback(() => audio.current?.play(chime), [chime]);

  return {
    sound,
    soundBlocked: sound && !audible && !soundUnsupported,
    // The page explains it: this browser cannot play audio at all.
    soundUnsupported,
    unlockSound,
    toggleSound,
    play,
  };
}
