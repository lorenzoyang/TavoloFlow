// A device preference like keep-screen-on: on unless this device turned it off.
const preferenceKey = "tavoloflow:kitchen-sound";

export function readSoundPreference() {
  try {
    return localStorage.getItem(preferenceKey) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPreference(on: boolean) {
  try {
    if (on) localStorage.removeItem(preferenceKey);
    else localStorage.setItem(preferenceKey, "off");
  } catch {
    /* The switch still works for this page without storage. */
  }
}

// Browsers let a page start audio only after a user gesture, and phones suspend it in the background,
// so start() is called again on every tap until the context runs. No background notification dependency.
export class KitchenAudio {
  private context: AudioContext | null = null;
  onChange: (() => void) | null = null;
  get running() {
    return this.context?.state === "running";
  }
  // Throws only where Web Audio is unavailable; a refused resume just leaves the context suspended.
  start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.context.onstatechange = () => this.onChange?.();
    }
    if (this.context.state !== "running") void this.context.resume().catch(() => undefined);
  }
  // Two rising tones, loud and long enough to carry across a kitchen.
  play() {
    const context = this.context;
    if (!context || context.state !== "running") return;
    for (const [offset, frequency] of [
      [0, 880],
      [0.22, 1320],
    ]) {
      const at = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + 0.45);
    }
  }
  close() {
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
