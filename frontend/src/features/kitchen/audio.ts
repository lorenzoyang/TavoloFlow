// Created/resumed only by the user's button click. No autoplay or background notification dependency.
export class KitchenAudio {
  private context: AudioContext | null = null;
  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Audio is unavailable");
  }
  play() {
    const context = this.context;
    if (!context || context.state !== "running") throw new Error("Audio is unavailable");
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
  }
  close() {
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
