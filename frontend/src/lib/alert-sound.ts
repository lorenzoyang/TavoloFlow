// A device preference like keep-screen-on: on unless this device turned it off.
export function readSoundPreference(key: string) {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPreference(key: string, on: boolean) {
  try {
    if (on) localStorage.removeItem(key);
    else localStorage.setItem(key, "off");
  } catch {
    /* The switch still works for this page without storage. */
  }
}

// Tones as [start offset in seconds, frequency in Hz]. Each page has its own chime, so a cook can tell
// the kitchen tablet from the pass tablet when both stand nearby.
export type Chime = readonly (readonly [number, number])[];
// Two rising tones: a new order in the kitchen.
export const orderChime: Chime = [
  [0, 880],
  [0.22, 1320],
];
// Three short high beeps: a dish waiting at the pass.
export const passChime: Chime = [
  [0, 1047],
  [0.25, 1047],
  [0.5, 1047],
];

// Near full scale but below 1, so the decaying tail of one tone plus the next stays unclipped. A page
// cannot exceed the device volume, which the tablet itself must keep up.
const peak = 0.85;

// Browsers let a page start audio only after a user gesture, and phones suspend it in the background,
// so start() is called again on every tap until the context runs. No background notification dependency.
export class AlertAudio {
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
  // Each tone holds its peak briefly before decaying: loud and long enough to carry across a kitchen.
  play(chime: Chime) {
    const context = this.context;
    if (!context || context.state !== "running") return;
    for (const [offset, frequency] of chime) {
      const at = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.02);
      gain.gain.setValueAtTime(peak, at + 0.1);
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
