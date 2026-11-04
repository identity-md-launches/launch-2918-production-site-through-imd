let context: AudioContext | null = null;
export function playTone(frequency = 440): void {
  try {
    context ??= new AudioContext(); void context.resume();
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.13);
  } catch { /* Audio is optional. Browser policies never block gameplay. */ }
}
