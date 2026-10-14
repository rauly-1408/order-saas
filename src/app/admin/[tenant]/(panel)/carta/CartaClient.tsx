"use client";

import { useCallback, useEffect, useState } from "react";

const S = {
  white: '#ffffff', pageBg: '#f7f7fb', border: '#eaeaf4',
  purple: '#7939fe', purpleDark: '#5707fd', purpleLight: '#e0d1ff', purpleMid: '#9c6dfe',
  textDark: '#393659', textMid: '#b8b6df', green: '#1ade92', red: '#ff5e6c',
};

const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const toEuros = (c: number) => fmt.format(c / 100);

type Product = {
  id: string; name: string; description: string | null; basePriceCents: number;
  imageUrl: string | null; isActive: boolean; isAvailable: boolean; isFeatured: boolean; sortOrder: number;
};
type Category = { id: string; name: string; products: Product[] };

type FormData = {
  name: string; description: string; basePriceCents: number;
  imageUrl: string; isActive: boolean; isAvailable: boolean; isFeatured: boolean;
};

const emptyForm: FormData = { name: '', description: '', basePriceCents: 0, imageUrl: '', isActive: true, isAvailable: true, isFeatured: false };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ width: 36, height: 20, borderRadius: 9999, cursor: 'pointer', position: 'relative', background: checked ? S.green : S.red, transition: 'background 0.2s', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', transition: 'left 0.2s', left: checked ? 19 : 3 }} />
    </div>
  );
}

export default function CartaClient({ tenant }: { tenant: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCatId, setEditingCatId] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductCatId, setNewProductCatId] = useState('');
  const [form, setForm] = useState<FormData>(emptyForm);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${tenant}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setCategories(data.categories ?? []);
    } finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openEdit(p: Product, catId: string) {
    setEditingProduct(p);
    setEditingCatId(catId);
    setForm({ name: p.name, description: p.description ?? '', basePriceCents: p.basePriceCents, imageUrl: p.imageUrl ?? '', isActive: p.isActive, isAvailable: p.isAvailable, isFeatured: p.isFeatured });
    setShowNewProduct(false);
  }

  function openNew(catId: string) {
    setEditingProduct(null);
    setNewProductCatId(catId);
    setForm(emptyForm);
    setShowNewProduct(true);
  }

  async function saveProduct() {
    setSaving(true); setMsg('');
    try {
      const payload = { ...form, basePriceCents: Number(form.basePriceCents), categoryId: editingProduct ? editingCatId : newProductCatId };
      const url = editingProduct ? `/api/admin/${tenant}/products/${editingProduct.id}` : `/api/admin/${tenant}/products`;
      const res = await fetch(url, { method: editingProduct ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      setMsg('Guardado correctamente');
      setEditingProduct(null); setShowNewProduct(false);
      fetchData();
    } catch (e: unknown) {
      setMsg('Error: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally { setSaving(false); }
  }

  async function deleteProduct(id: string) {
    if (!confirm('¿Eliminar este producto?')) return;
    await fetch(`/api/admin/${tenant}/products/${id}`, { method: 'DELETE' });
    fetchData();
  }

  async function toggleActive(product: Product, catId: string) {
    await fetch(`/api/admin/${tenant}/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !product.isActive }) });
    fetchData();
  }

  const isEditing = editingProduct !== null || showNewProduct;
  const allProducts = categories.flatMap(c => c.products);
  const filtered = search ? allProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : null;

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: S.textDark, background: S.pageBg, textAlign: 'left',
    borderBottom: `1px solid ${S.border}`,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: S.textDark, margin: 0 }}>Productos</h1>
          <div style={{ fontSize: 13, color: S.textMid, marginTop: 4 }}>Esta es tu lista completa de productos</div>
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('Error') ? '#fff0f0' : '#f0fff4', border: `1px solid ${msg.startsWith('Error') ? S.red : S.green}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, color: msg.startsWith('Error') ? S.red : '#166534', marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {isEditing && (
        <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: S.textDark, marginBottom: 20 }}>
            {editingProduct ? `Editar: ${editingProduct.name}` : 'Nuevo producto'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { key: 'name', label: 'Nombre *', placeholder: 'Nombre del producto', span: false },
              { key: 'basePriceCents', label: 'Precio (céntimos) *', placeholder: '1200 = 12,00€', span: false },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>{label}</div>
                <input
                  type={key === 'basePriceCents' ? 'number' : 'text'}
                  value={(form as Record<string, unknown>)[key] as string}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }}
                />
                {key === 'basePriceCents' && <div style={{ fontSize: 11, color: S.textMid, marginTop: 3 }}>= {toEuros(Number(form.basePriceCents))}</div>}
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>Descripción</div>
              <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, marginBottom: 6 }}>URL imagen</div>
              <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              {[
                { key: 'isActive', label: 'Activo' },
                { key: 'isAvailable', label: 'Disponible' },
                { key: 'isFeatured', label: 'Destacado' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: S.textDark }}>
                  <Toggle checked={(form as Record<string, unknown>)[key] as boolean} onChange={v => setForm({ ...form, [key]: v })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button onClick={saveProduct} disabled={saving} style={{ background: S.purpleLight, color: S.purpleDark, border: `1px solid ${S.purpleMid}`, borderRadius: 4, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => { setEditingProduct(null); setShowNewProduct(false); }} style={{ background: 'transparent', color: S.textDark, border: `1px solid ${S.border}`, borderRadius: 4, padding: '8px 20px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${S.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar productos..." style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: `1px solid ${S.border}`, borderRadius: 4, outline: 'none', fontFamily: 'inherit', color: S.textDark }} />
        </div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: S.textMid }}>Cargando productos...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Nombre', 'Categoría', 'Precio', 'Activo', 'Disponible', 'Acciones'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(filtered ?? categories.flatMap(c => c.products.map(p => ({ ...p, _catId: c.id, _catName: c.name })))).map((p) => {
                const product = p as Product & { _catId?: string; _catName?: string };
                const catId = product._catId ?? categories.find(c => c.products.some(pp => pp.id === p.id))?.id ?? '';
                const catName = product._catName ?? categories.find(c => c.products.some(pp => pp.id === p.id))?.name ?? '';
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${S.border}`, background: S.white }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f3f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽️</div>}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: S.textDark }}>{p.name}</div>
                          {p.description && <div style={{ fontSize: 12, color: S.textMid, marginTop: 2 }}>{p.description.substring(0, 40)}{p.description.length > 40 ? '...' : ''}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: S.textDark }}>
                      <span style={{ background: '#f3f0ff', color: S.purpleDark, borderRadius: 9999, padding: '2px 8px', fontSize: 12 }}>{catName}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: S.textDark }}>{toEuros(p.basePriceCents)}</td>
                    <td style={{ padding: '12px 16px' }}><Toggle checked={p.isActive} onChange={() => toggleActive(p, catId)} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, color: p.isAvailable ? S.green : S.red, fontWeight: 600 }}>{p.isAvailable ? 'Disponible' : 'Agotado'}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEdit(p, catId)} style={{ background: 'transparent', color: S.purpleDark, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>Editar</button>
                        <button onClick={() => deleteProduct(p.id)} style={{ background: 'transparent', color: S.red, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textDark, marginBottom: 12 }}>Añadir producto por categoría</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => openNew(cat.id)} style={{ background: S.purpleLight, color: S.purpleDark, border: `1px solid ${S.purpleMid}`, borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              + {cat.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
