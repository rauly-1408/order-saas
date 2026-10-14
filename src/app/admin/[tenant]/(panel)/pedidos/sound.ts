// Aviso sonoro del panel con Web Audio (sin ficheros de audio).
// Los navegadores bloquean el audio hasta que el usuario interactúa con la
// página: unlockAudio() debe llamarse desde un clic.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const c = getContext();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

export function playBeep(): void {
  const c = getContext();
  if (!c) return;

  const beep = () => {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  };

  // resume() es asíncrono: si el contexto estaba suspendido, hay que esperar
  // a que vuelva a "running" o el pitido se programa en un reloj parado.
  if (c.state === "suspended") c.resume().then(beep).catch(() => null);
  else beep();
}
