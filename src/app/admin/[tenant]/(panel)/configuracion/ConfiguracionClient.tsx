"use client";

import { useEffect, useState } from "react";

const S = {
  white: '#ffffff', pageBg: '#f7f7fb', border: '#eaeaf4',
  purpleDark: '#5707fd', purpleLight: '#e0d1ff', purpleMid: '#9c6dfe',
  textDark: '#393659', textMid: '#b8b6df', green: '#1ade92', red: '#ff5e6c',
};

type SettingsForm = {
  deliveryEnabled: boolean; takeawayEnabled: boolean;
  minimumOrderCents: number; deliveryFeeCents: number;
  estimatedDeliveryMinutes: number; estimatedPickupMinutes: number;
  phone: string; whatsapp: string; instagram: string; address: string;
  currency: string;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', border: `1px solid ${S.border}`, borderRadius: 8, cursor: 'pointer', background: S.white }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: S.textDark }}>{label}</div>
      </div>
      <div onClick={() => onChange(!checked)} style={{ width: 40, height: 22, borderRadius: 9999, cursor: 'pointer', position: 'relative', background: checked ? S.green : S.red, transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, transition: 'left 0.2s', left: checked ? 21 : 3 }} />
      </div>
    </label>
  );
}

function NumField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>{label}</div>
      <input type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
      {hint && <div style={{ fontSize: 11, color: S.textMid, marginTop: 3 }}>= {fmt.format(value / 100)}</div>}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: S.textDark, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {children}
    </div>
  );
}

export default function ConfiguracionClient({ tenant }: { tenant: string }) {
  const [form, setForm] = useState<SettingsForm>({
    deliveryEnabled: true, takeawayEnabled: true,
    minimumOrderCents: 0, deliveryFeeCents: 0,
    estimatedDeliveryMinutes: 45, estimatedPickupMinutes: 20,
    phone: '', whatsapp: '', instagram: '', address: '', currency: 'EUR',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const s = (data.tenant?.settings ?? {}) as Record<string, unknown>;
        setForm({
          deliveryEnabled:           (s.deliveryEnabled as boolean)  ?? true,
          takeawayEnabled:           (s.takeawayEnabled as boolean)  ?? true,
          minimumOrderCents:         (s.minimumOrderCents as number) ?? 0,
          deliveryFeeCents:          (s.deliveryFeeCents as number)  ?? 0,
          estimatedDeliveryMinutes:  (s.estimatedDeliveryMinutes as number) ?? 45,
          estimatedPickupMinutes:    (s.estimatedPickupMinutes as number) ?? 20,
          phone:     (s.phone as string) ?? '',
          whatsapp:  (s.whatsapp as string) ?? '',
          instagram: (s.instagram as string) ?? '',
          address:   (s.address as string) ?? '',
          currency:  (s.currency as string) ?? 'EUR',
        });
      });
  }, [tenant]);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`/api/admin/${tenant}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: {
          ...form,
          phone:     form.phone     || null,
          whatsapp:  form.whatsapp  || null,
          instagram: form.instagram || null,
          address:   form.address   || null,
        }}),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('Configuración guardada');
    } catch (e: unknown) {
      setMsg('Error: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: S.textDark, margin: 0 }}>Configuración</h1>
        <div style={{ fontSize: 13, color: S.textMid, marginTop: 4 }}>Gestiona los canales, horarios y datos de contacto</div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('Error') ? '#fff0f0' : '#f0fff4', border: `1px solid ${msg.startsWith('Error') ? S.red : S.green}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, color: msg.startsWith('Error') ? S.red : '#166534', marginBottom: 20 }}>
          {msg}
        </div>
      )}

      <Section title="Canales de venta">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Toggle checked={form.deliveryEnabled} onChange={v => setForm({ ...form, deliveryEnabled: v })} label="Delivery — Envío a domicilio" />
          <Toggle checked={form.takeawayEnabled} onChange={v => setForm({ ...form, takeawayEnabled: v })} label="Recogida — Takeaway / Click & Collect" />
        </div>
      </Section>

      <Section title="Precios y tiempos">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <NumField label="Pedido mínimo (céntimos)" value={form.minimumOrderCents} onChange={v => setForm({ ...form, minimumOrderCents: v })} hint="cents" />
          <NumField label="Gastos de envío (céntimos)" value={form.deliveryFeeCents} onChange={v => setForm({ ...form, deliveryFeeCents: v })} hint="cents" />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>Tiempo delivery (min)</div>
            <input type="number" min={1} value={form.estimatedDeliveryMinutes} onChange={e => setForm({ ...form, estimatedDeliveryMinutes: Number(e.target.value) })}
              style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>Tiempo recogida (min)</div>
            <input type="number" min={1} value={form.estimatedPickupMinutes} onChange={e => setForm({ ...form, estimatedPickupMinutes: Number(e.target.value) })}
              style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
          </div>
        </div>
      </Section>

      <Section title="Contacto">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <TextField label="Teléfono" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+34 600 000 000" />
          <TextField label="WhatsApp" value={form.whatsapp} onChange={v => setForm({ ...form, whatsapp: v })} placeholder="+34 600 000 000" />
          <TextField label="Instagram" value={form.instagram} onChange={v => setForm({ ...form, instagram: v })} placeholder="@minegocio" />
          <TextField label="Moneda" value={form.currency} onChange={v => setForm({ ...form, currency: v })} placeholder="EUR" />
          <div style={{ gridColumn: '1 / -1' }}>
            <TextField label="Dirección" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="Calle, número, ciudad" />
          </div>
        </div>
      </Section>

      <button onClick={save} disabled={saving} style={{
        width: '100%', background: S.purpleLight, color: S.purpleDark, border: `1px solid ${S.purpleMid}`,
        borderRadius: 6, padding: '12px', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
      }}>
        {saving ? 'Guardando...' : 'Guardar configuración'}
      </button>
    </div>
  );
}
