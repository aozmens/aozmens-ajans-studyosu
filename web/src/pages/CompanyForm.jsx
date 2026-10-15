// Marka ekleme / düzenleme formu.
import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Modal, toastErr, toast } from '../ui.jsx';

const FIELDS = [
  ['name', 'Marka adı', 'input'],
  ['sector', 'Sektör', 'input', 'ör. Kahve zinciri, diş kliniği, e-ticaret'],
  ['website', 'Web sitesi', 'input', 'https://…  (işlerde metni okunur)'],
  ['social', 'Sosyal medya hesapları', 'input', '@hesap, linkedin.com/company/…'],
  ['audience', 'Hedef kitle', 'textarea', 'Kimlere konuşuyoruz?'],
  ['tone', 'Marka tonu', 'input', 'ör. samimi, uzman, enerjik, lüks'],
  ['fonts', 'Fontlar', 'input', 'Marka fontları (varsa)'],
  ['competitors', 'Rakipler', 'input'],
  ['about', 'Firma hakkında / müşteri isterleri', 'textarea', 'Ürünler, hizmetler, kampanyalar, olmazsa olmazlar…'],
];

export default function CompanyForm({ company, onClose }) {
  const { loadCompanies } = useApp();
  const [f, setF] = useState({ ...company });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!String(f.name || '').trim()) return toast('Marka adı gerekli', true);
    setBusy(true);
    try {
      const data = {};
      for (const [k] of FIELDS) data[k] = f[k] || '';
      if (f.id) data.id = f.id;
      const { id } = await api.post('/api/companies', data);
      await loadCompanies();
      onClose();
      if (!f.id) go(`marka/${id}`);
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.id ? 'Markayı düzenle' : 'Yeni marka'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={busy} onClick={save}>{busy && <span className="spinner sm" />}Kaydet</button>
    </>}>
      <div className="grid-2">
        {FIELDS.map(([k, l, t, ph]) => (
          <div key={k} className="field" style={t === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
            <label>{l}</label>
            {t === 'textarea'
              ? <textarea className="textarea" placeholder={ph} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} />
              : <input className="input" placeholder={ph} value={f[k] || ''} autoFocus={k === 'name'} onChange={(e) => set(k, e.target.value)} />}
          </div>
        ))}
      </div>
      {!f.id && <p className="small muted" style={{ marginBottom: 0 }}>Kaydettikten sonra logo yükleyebilir, renk paletini düzenleyebilir ve "Markayı Öğren" ile markanın görsel dilini çıkarabilirsin.</p>}
    </Modal>
  );
}
