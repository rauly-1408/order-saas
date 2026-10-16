// Aviso sonoro del panel con Web Audio (sin ficheros de audio).
// Los navegadores no dejan sonar una página hasta que el usuario la toca: el
// audio se desbloquea solo con el primer toque/clic/tecla en cualquier parte
// del panel (ver OrderAlerts). Una app instalada (PWA) puede sonar desde el inicio.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
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

export function audioRunning(): boolean {
  return getContext()?.state === "running";
}

// ── Preferencia (activado por defecto) ──────────────────────────────────
const PREF_KEY = "panel-sound";
export const SOUND_EVENT = "panel-sound-change";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* modo privado: la preferencia dura lo que la página */
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

// Repetir el aviso mientras haya pedidos sin aceptar (activado por defecto).
// Si se apaga, suena una sola vez por pedido nuevo.
const REPEAT_KEY = "panel-sound-repeat";

export function repeatUntilAccepted(): boolean {
  try {
    return localStorage.getItem(REPEAT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setRepeatUntilAccepted(on: boolean): void {
  try {
    localStorage.setItem(REPEAT_KEY, on ? "on" : "off");
  } catch {
    /* modo privado */
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

// ── "Cha-ching" de caja registradora ────────────────────────────────────
// Golpe metálico corto (el cajón) + dos campanazos con armónicos de campana.
function strike(c: AudioContext, at: number) {
  const len = Math.floor(c.sampleRate * 0.07);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3200;
  band.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  src.connect(band).connect(g).connect(c.destination);
  src.start(at);
}

function bell(c: AudioContext, at: number, base: number, volume: number) {
  // Parciales típicos de campana (no armónicos) con caída rápida en los agudos.
  const partials: [number, number, number][] = [
    [1, 1, 1.1],
    [2.76, 0.55, 0.7],
    [5.4, 0.3, 0.45],
    [8.93, 0.18, 0.3],
  ];
  for (const [ratio, amp, decay] of partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * ratio, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume * amp, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

export function playOrderChime(): void {
  const c = getContext();
  if (!c) return;
  const ring = () => {
    const t = c.currentTime + 0.02;
    strike(c, t);
    bell(c, t + 0.09, 1318.5, 0.32); // Mi6
    bell(c, t + 0.21, 1760, 0.36); // La6
  };
  if (c.state === "suspended") c.resume().then(ring).catch(() => null);
  else ring();
}
