"use client";

import { useEffect, useState } from "react";
import { playOrderChime, repeatUntilAccepted, setRepeatUntilAccepted, setSoundEnabled, soundEnabled, unlockAudio } from "../../sound";
import { Card, Toggle, ghostBtn } from "../ui";

// Notificaciones: cómo te avisa el panel de un pedido (en este dispositivo) y
// cómo se entera el cliente del estado de su pedido.
export default function Notificaciones() {
  const [sound, setSound] = useState(true);
  const [repeat, setRepeat] = useState(true);
  const [perm, setPerm] = useState<string>("default");

  useEffect(() => {
    // Preferencias de este dispositivo (se leen al montar: viven en el navegador).
    const t = setTimeout(() => {
      setSound(soundEnabled());
      setRepeat(repeatUntilAccepted());
      setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-5">
      <Card
        title="Avisos de pedidos nuevos (este dispositivo)"
        description="Se guardan en cada móvil, tablet u ordenador. Configúralo en el que tengas en la cocina o en el mostrador."
        footer={
          <button
            type="button"
            onClick={async () => {
              await unlockAudio();
              playOrderChime();
            }}
            className={ghostBtn}
          >
            🔔 Probar el sonido
          </button>
        }
      >
        <div className="divide-y divide-[var(--p-line)]">
          <Toggle
            checked={sound}
            onChange={(v) => {
              setSoundEnabled(v);
              setSound(v);
            }}
            label="Sonido al entrar un pedido"
            hint="El «cha-ching» de caja registradora."
          />
          <Toggle
            checked={repeat}
            onChange={(v) => {
              setRepeatUntilAccepted(v);
              setRepeat(v);
            }}
            label="Repetir hasta que se acepte"
            hint="Suena cada pocos segundos mientras haya pedidos sin aceptar. Si lo apagas, suena una vez por pedido."
          />
        </div>
        <p className="mt-3 text-xs text-[var(--p-muted)]">
          Consejo: instala el panel como app («Instalar como app» en la barra lateral). Así suena aunque no hayas tocado la pantalla.
          {perm === "denied" && " Este navegador tiene bloqueadas las notificaciones."}
        </p>
      </Card>

      <Card title="Avisos a tus clientes" description="Lo que recibe el cliente sin que tengas que hacer nada.">
        <ul className="space-y-2 text-sm">
          <li>✅ <b>Página de seguimiento en directo</b>: recibido, en cocina, listo o en camino, con la hora estimada.</li>
          <li>✅ <b>Aviso en su móvil</b> (notificación del navegador) cuando su pedido está listo o sale a reparto, si lo activa.</li>
          <li>✅ <b>Valoración</b> al terminar, con salto a tus reseñas de Google si da 4 o 5 estrellas.</li>
          <li className="text-[var(--p-muted)]">🔜 Avisos por WhatsApp: llegarán con la integración de WhatsApp Business.</li>
        </ul>
      </Card>
    </div>
  );
}
