"use client";

import { useEffect, useState } from "react";

// TEMP: Design tokens del sistema — no hardcodear valores de ningún tenant.
// Los valores que ve el usuario en el formulario vienen 100% de la DB (Tenant.branding).
const S = {
  white: '#ffffff', pageBg: '#f7f7fb', border: '#eaeaf4',
  purpleDark: '#5707fd', purpleLight: '#e0d1ff', purpleMid: '#9c6dfe',
  textDark: '#393659', textMid: '#b8b6df', green: '#1ade92', red: '#ff5e6c',
};

type BrandingForm = {
  name: string;
  primaryColor: string; secondaryColor: string;
  backgroundColor: string; textPrimary: string;
  borderRadius: string; logoUrl: string; heroImageUrl: string;
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 40, height: 36, borderRadius: 4, cursor: 'pointer', border: `1px solid ${S.border}`, padding: 2 }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', color: S.textDark }} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, note }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
      {note && <div style={{ fontSize: 11, color: S.textMid, marginTop: 3 }}>{note}</div>}
    </div>
  );
}

export default function PersonalizacionClient({ tenant }: { tenant: string }) {
  const [form, setForm] = useState<BrandingForm>({
    name: '', primaryColor: '#7939fe', secondaryColor: '#9c6dfe',
    backgroundColor: '#ffffff', textPrimary: '#393659',
    borderRadius: '8px', logoUrl: '', heroImageUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const b = (data.tenant?.branding ?? {}) as Record<string, string>;
        setForm({
          name: data.tenant?.name ?? '',
          primaryColor:    b.primaryColor    ?? '#7939fe',
          secondaryColor:  b.secondaryColor  ?? '#9c6dfe',
          backgroundColor: b.backgroundColor ?? '#ffffff',
          textPrimary:     b.textPrimary     ?? '#393659',
          borderRadius:    b.borderRadius    ?? '8px',
          logoUrl:         b.logoUrl         ?? '',
          heroImageUrl:    b.heroImageUrl    ?? '',
        });
      });
  }, [tenant]);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`/api/admin/${tenant}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, branding: {
          primaryColor: form.primaryColor, secondaryColor: form.secondaryColor,
          backgroundColor: form.backgroundColor, textPrimary: form.textPrimary,
          borderRadius: form.borderRadius,
          logoUrl: form.logoUrl || null, heroImageUrl: form.heroImageUrl || null,
        }}),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('Guardado. Recarga la carta para ver los cambios.');
    } catch (e: unknown) {
      setMsg('Error: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: S.textDark, margin: 0 }}>Personalización</h1>
        <div style={{ fontSize: 13, color: S.textMid, marginTop: 4 }}>Configura la identidad visual de tu carta</div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('Error') ? '#fff0f0' : '#f0fff4', border: `1px solid ${msg.startsWith('Error') ? S.red : S.green}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, color: msg.startsWith('Error') ? S.red : '#166534', marginBottom: 20 }}>
          {msg}
        </div>
      )}

      <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.textDark, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Identidad</div>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Nombre del negocio" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Field label="URL del logo" value={form.logoUrl} onChange={v => setForm({ ...form, logoUrl: v })} placeholder="https://..." />
          {form.logoUrl && <img src={form.logoUrl} alt="Logo preview" style={{ height: 56, objectFit: 'contain', border: `1px solid ${S.border}`, borderRadius: 6, padding: 4 }} />}
          <Field label="Imagen hero (cabecera de la carta)" value={form.heroImageUrl} onChange={v => setForm({ ...form, heroImageUrl: v })} placeholder="https://..." />
        </div>
      </div>

      <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.textDark, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Colores</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ColorField label="Color principal" value={form.primaryColor} onChange={v => setForm({ ...form, primaryColor: v })} />
          <ColorField label="Color secundario" value={form.secondaryColor} onChange={v => setForm({ ...form, secondaryColor: v })} />
          <ColorField label="Fondo de la carta" value={form.backgroundColor} onChange={v => setForm({ ...form, backgroundColor: v })} />
          <ColorField label="Color del texto" value={form.textPrimary} onChange={v => setForm({ ...form, textPrimary: v })} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>Radio de bordes</div>
            <input value={form.borderRadius} onChange={e => setForm({ ...form, borderRadius: e.target.value })} placeholder="8px"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', color: S.textDark, boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Live preview */}
        <div style={{ marginTop: 20, border: `1px solid ${S.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 11, color: S.textMid, marginBottom: 10, fontWeight: 600 }}>Vista previa</div>
          <div style={{ background: form.backgroundColor, padding: 16, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: form.secondaryColor, color: '#fff', padding: '8px 16px', borderRadius: form.borderRadius, fontSize: 14, fontWeight: 700 }}>
              {form.name || 'Mi Restaurante'}
            </div>
            <button style={{ background: form.primaryColor, color: '#fff', padding: '8px 16px', borderRadius: form.borderRadius, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Pedir ahora
            </button>
            <span style={{ color: form.textPrimary, fontSize: 14 }}>Carta del día</span>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{
        width: '100%', background: S.purpleLight, color: S.purpleDark, border: `1px solid ${S.purpleMid}`,
        borderRadius: 6, padding: '12px', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
      }}>
        {saving ? 'Guardando...' : 'Guardar personalización'}
      </button>
    </div>
  );
}
