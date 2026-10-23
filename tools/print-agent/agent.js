#!/usr/bin/env node
// Agente de impresión: corre dentro del local, pregunta a la app cada 2 s si
// hay comandas o tickets pendientes y los manda a la impresora por la red
// (puerto 9100, ESC/POS). Sin dependencias: Node 18 o superior.
//
//   node agent.js --url https://order-saas-delta.vercel.app --token XXXX [--store ID]
//   Mejor con variables de entorno (así el token no queda a la vista en la
//   lista de procesos): ORDER_SAAS_URL, ORDER_SAAS_PRINT_TOKEN, ORDER_SAAS_STORE
//
// Ver tools/print-agent/README.md y docs/IMPRESION.md

/* eslint-disable @typescript-eslint/no-require-imports -- programa Node suelto, sin compilar */
const net = require("net");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const URL_BASE = (arg("url") || process.env.ORDER_SAAS_URL || "").replace(/\/+$/, "");
const TOKEN = arg("token") || process.env.ORDER_SAAS_PRINT_TOKEN || "";
const EVERY_MS = Number(arg("every") || process.env.ORDER_SAAS_PRINT_EVERY || 2000);
const STORE = arg("store") || process.env.ORDER_SAAS_STORE || "";

if (!URL_BASE || !TOKEN) {
  console.error("Falta la dirección de la app o el token. Ejemplo:\n  node agent.js --url https://order-saas-delta.vercel.app --token XXXX");
  process.exit(1);
}
// Solo por conexión segura (https), salvo pruebas en el propio ordenador.
if (!/^https:\/\//.test(URL_BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(URL_BASE)) {
  console.error("La dirección de la app tiene que empezar por https://");
  process.exit(1);
}
if (typeof fetch !== "function") {
  console.error("Hace falta Node 18 o superior (este tiene " + process.version + ").");
  process.exit(1);
}

const log = (...m) => console.log(new Date().toLocaleTimeString("es-ES"), ...m);

// Solo impresoras de la red del local (IPv4 privada, puertos 9100–9109): el
// agente no conecta con nada más aunque se lo pidan.
function isPrinterAddress(host, port) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host));
  if (!m || m.slice(1).some((x) => Number(x) > 255)) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const priv = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  return priv && Number.isInteger(port) && port >= 9100 && port <= 9109;
}

// Manda los bytes a la impresora y espera a que acepte la conexión y los datos.
function sendToPrinter(host, port, data) {
  if (!isPrinterAddress(host, port)) return Promise.reject(new Error("Dirección de impresora no permitida"));
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(8000);
    socket.on("timeout", () => finish(new Error("La impresora no responde (tiempo agotado)")));
    socket.on("error", (e) => finish(new Error(e.code === "ECONNREFUSED" ? "La impresora rechaza la conexión" : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "No se llega a la impresora (¿misma red?)" : e.message)));
    socket.connect(port, host, () => {
      socket.write(data, (e) => {
        if (e) return finish(e);
        // Pequeña espera para que la impresora vacíe el búfer antes de cerrar.
        setTimeout(() => socket.end(() => finish()), 300);
      });
    });
  });
}

async function api(path, init) {
  const res = await fetch(URL_BASE + path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init && init.headers) } });
  if (res.status === 401) throw new Error("Token no válido: cópialo de nuevo desde Configuración → Impresoras");
  if (!res.ok) throw new Error(`La app respondió ${res.status}`);
  return res.json();
}

let lastError = "";
async function tick() {
  try {
    const { jobs } = await api("/api/print/jobs" + (STORE ? `?store=${encodeURIComponent(STORE)}` : ""));
    if (lastError) {
      log("Conectado de nuevo a la app.");
      lastError = "";
    }
    for (const job of jobs) {
      const data = Buffer.from(job.data, "base64");
      try {
        await sendToPrinter(job.host, job.port, data);
        await api("/api/print/jobs", { method: "POST", body: JSON.stringify({ id: job.id, ok: true }) });
        log(`Impreso ${job.kind} en ${job.host}`);
      } catch (e) {
        await api("/api/print/jobs", { method: "POST", body: JSON.stringify({ id: job.id, ok: false, error: e.message }) });
        log(`Error en ${job.host}: ${e.message} (intento ${job.attempts + 1} de 5)`);
      }
    }
  } catch (e) {
    if (e.message !== lastError) log("Sin conexión con la app:", e.message);
    lastError = e.message;
  }
}

log(`Agente de impresión en marcha → ${URL_BASE} (cada ${EVERY_MS / 1000} s). Ctrl+C para parar.`);
tick();
setInterval(tick, Math.max(1000, EVERY_MS));
