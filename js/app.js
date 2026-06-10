import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Toast ──────────────────────────────────────────────────────────────────
export function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type === 'error' ? ' error' : '');
  setTimeout(() => el.className = '', 3000);
}

// ── Format angka ───────────────────────────────────────────────────────────
export const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export const num = n => Number(n || 0).toLocaleString('id-ID');

// ── Nav ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    loadPage(btn.dataset.page);
  });
});

function loadPage(id) {
  if (id === 'dashboard')     loadDashboard();
  if (id === 'nota')          loadNota();
  if (id === 'hpp')           loadHpp();
  if (id === 'stok')          loadStok();
  if (id === 'rekonsiliasi')  loadRekonsiliasi();
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  const el = id => document.getElementById(id);

  el('dash-loading').style.display = 'flex';
  el('dash-content').style.display = 'none';

  try {
    const [prodSnap, notaSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(query(collection(db, 'nota'), orderBy('created_at', 'desc'), limit(200))),
    ]);

    const products = prodSnap.docs.map(d => d.data());
    const notas    = notaSnap.docs.map(d => d.data());

    const gudangProds = products.filter(p => p.lokasi?.includes('gudang'));
    const tokoProds   = products.filter(p => p.lokasi?.includes('toko'));
    const missingHppG = gudangProds.filter(p => !(p.buy_price_gudang > 0));
    const missingHppT = tokoProds.filter(p => !(p.buy_price_toko > 0));
    const onlyToko    = products.filter(p => p.lokasi?.length === 1 && p.lokasi[0] === 'toko');
    const bedaStok    = products.filter(p =>
      p.lokasi?.includes('gudang') && p.lokasi?.includes('toko') &&
      p.stock_qty_gudang !== p.stock_qty_toko
    );

    el('m-total-g').textContent   = gudangProds.length.toLocaleString('id-ID');
    el('m-total-t').textContent   = tokoProds.length.toLocaleString('id-ID');
    el('m-total-all').textContent = products.length.toLocaleString('id-ID');
    el('m-hpp-g').textContent     = missingHppG.length.toLocaleString('id-ID');
    el('m-hpp-t').textContent     = missingHppT.length.toLocaleString('id-ID');
    el('m-only-t').textContent    = onlyToko.length.toLocaleString('id-ID');
    el('m-beda-stok').textContent = bedaStok.length.toLocaleString('id-ID');

    // Status breakdown
    const statusCount = (arr) => ({
      auto:   arr.filter(p => p.hpp_status === 'AUTO').length,
      cek:    arr.filter(p => p.hpp_status === 'CEK').length,
      manual: arr.filter(p => p.hpp_status === 'MANUAL').length,
    });
    const sg = statusCount(missingHppG);
    const st = statusCount(missingHppT);
    el('status-gudang').innerHTML = statusHTML(sg);
    el('status-toko').innerHTML   = statusHTML(st);

    // Top 10 prioritas
    const top10 = [...missingHppG]
      .sort((a, b) => (b.stock_qty_gudang || 0) - (a.stock_qty_gudang || 0))
      .slice(0, 10);
    el('top10-body').innerHTML = top10.map(p => `
      <tr>
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>${p.category || '-'}</td>
        <td class="number">${num(p.stock_qty_gudang)}</td>
        <td class="number">${rp(p.pos_sell_price)}</td>
        <td>${badgeHTML(p.hpp_status)}</td>
      </tr>`).join('');

    // Nota terbaru
    el('nota-recent-body').innerHTML = notas.slice(0, 8).map(n => `
      <tr>
        <td>${n.tanggal || '-'}</td>
        <td>${n.supplier || '-'}</td>
        <td>${n.no_invoice || '-'}</td>
        <td class="number">${n.items?.length || 0} item</td>
      </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#999">Belum ada nota</td></tr>';

    el('dash-loading').style.display = 'none';
    el('dash-content').style.display = 'block';
  } catch (e) {
    el('dash-loading').innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
  }
}

function statusHTML(s) {
  return `<span class="badge badge-auto">AUTO ${s.auto}</span>
          <span class="badge badge-cek">CEK ${s.cek}</span>
          <span class="badge badge-manual">MANUAL ${s.manual}</span>`;
}
function badgeHTML(status) {
  const map = { AUTO: 'badge-auto', CEK: 'badge-cek', MANUAL: 'badge-manual', OK: 'badge-ok' };
  return `<span class="badge ${map[status] || ''}">${status || '-'}</span>`;
}

// ── NOTA ───────────────────────────────────────────────────────────────────
let notaRows = 1;

async function loadNota() {
  renderNotaForm();
  await loadNotaHistory();
}

function renderNotaForm() {
  document.getElementById('nota-items-body').innerHTML = notaItemRow(0);
}

function notaItemRow(i) {
  return `<tr id="nota-row-${i}">
    <td><input type="text"   id="nb-nama-${i}"  placeholder="Nama barang sesuai nota" style="width:100%;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px"></td>
    <td><input type="number" id="nb-qty-${i}"   placeholder="0" min="0" style="width:80px;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px"></td>
    <td><input type="number" id="nb-harga-${i}" placeholder="0" min="0" style="width:140px;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px"></td>
    <td><input type="text"   id="nb-cat-${i}"   placeholder="opsional" style="width:120px;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px"></td>
    <td><button class="nota-row-remove" onclick="removeNotaRow(${i})">✕</button></td>
  </tr>`;
}

window.removeNotaRow = (i) => document.getElementById(`nota-row-${i}`)?.remove();

window.addNotaRow = () => {
  const body = document.getElementById('nota-items-body');
  body.insertAdjacentHTML('beforeend', notaItemRow(notaRows++));
};

window.submitNota = async () => {
  const supplier  = document.getElementById('nota-supplier').value.trim();
  const tanggal   = document.getElementById('nota-tanggal').value;
  const no_inv    = document.getElementById('nota-noinv').value.trim();

  if (!supplier) { toast('Nama supplier wajib diisi', 'error'); return; }
  if (!tanggal)  { toast('Tanggal nota wajib diisi', 'error'); return; }

  const items = [];
  for (let i = 0; i < notaRows; i++) {
    const nama  = document.getElementById(`nb-nama-${i}`)?.value?.trim();
    const qty   = parseFloat(document.getElementById(`nb-qty-${i}`)?.value || 0);
    const harga = parseFloat(document.getElementById(`nb-harga-${i}`)?.value || 0);
    const cat   = document.getElementById(`nb-cat-${i}`)?.value?.trim();
    if (nama) items.push({ nama_barang: nama, qty, harga_satuan: harga, catatan: cat || '' });
  }

  if (items.length === 0) { toast('Minimal satu item harus diisi', 'error'); return; }

  const btn = document.getElementById('btn-simpan-nota');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    await addDoc(collection(db, 'nota'), {
      supplier, tanggal, no_invoice: no_inv, items,
      created_at: serverTimestamp(),
    });
    toast(`✅ ${items.length} item dari ${supplier} disimpan`);

    // Reset form
    document.getElementById('nota-supplier').value = '';
    document.getElementById('nota-noinv').value    = '';
    notaRows = 1;
    document.getElementById('nota-items-body').innerHTML = notaItemRow(0);
    await loadNotaHistory();
  } catch (e) {
    toast('Gagal menyimpan: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Simpan Nota';
  }
};

async function loadNotaHistory() {
  const body = document.getElementById('nota-history-body');
  body.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'nota'), orderBy('created_at', 'desc'), limit(50)));
    const rows = snap.docs.map(d => { const n = d.data(); return `
      <tr>
        <td>${n.tanggal || '-'}</td>
        <td>${n.supplier || '-'}</td>
        <td>${n.no_invoice || '-'}</td>
        <td>${n.items?.length || 0} item</td>
        <td>${n.items?.map(i => i.nama_barang).join(', ').substring(0, 60) || '-'}…</td>
      </tr>`;}).join('');
    body.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px">Belum ada nota</td></tr>';
  } catch(e) {
    body.innerHTML = `<tr><td colspan="5" style="color:red">${e.message}</td></tr>`;
  }
}

// ── HPP ────────────────────────────────────────────────────────────────────
let hppData = [], hppLokasi = 'gudang';

async function loadHpp() {
  document.getElementById('hpp-loading').style.display = 'flex';
  document.getElementById('hpp-content').style.display = 'none';

  const snap = await getDocs(collection(db, 'products'));
  const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  hppData = all.filter(p =>
    p.lokasi?.includes(hppLokasi) &&
    !(hppLokasi === 'gudang' ? p.buy_price_gudang > 0 : p.buy_price_toko > 0)
  ).sort((a, b) =>
    ((hppLokasi === 'gudang' ? b.stock_qty_gudang : b.stock_qty_toko) || 0) -
    ((hppLokasi === 'gudang' ? a.stock_qty_gudang : a.stock_qty_toko) || 0)
  );

  document.getElementById('hpp-loading').style.display = 'none';
  document.getElementById('hpp-content').style.display = 'block';
  renderHppTable();
}

window.switchHppLokasi = (lok) => {
  hppLokasi = lok;
  document.querySelectorAll('.hpp-lokasi-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lokasi === lok));
  loadHpp();
};

window.filterHpp = () => renderHppTable();

function renderHppTable() {
  const cari   = document.getElementById('hpp-search')?.value?.toUpperCase() || '';
  const status = document.getElementById('hpp-status-filter')?.value || '';
  const kat    = document.getElementById('hpp-kat-filter')?.value || '';

  let rows = hppData;
  if (cari)   rows = rows.filter(p => p.name?.includes(cari) || p.sku?.includes(cari));
  if (status) rows = rows.filter(p => p.hpp_status === status);
  if (kat)    rows = rows.filter(p => p.category === kat);

  document.getElementById('hpp-count').textContent = `${rows.length.toLocaleString('id-ID')} item`;

  const kats = [...new Set(hppData.map(p => p.category).filter(Boolean))].sort();
  const katSel = document.getElementById('hpp-kat-filter');
  if (katSel && katSel.options.length <= 1) {
    kats.forEach(k => { const o = new Option(k, k); katSel.add(o); });
  }

  const body = document.getElementById('hpp-table-body');
  body.innerHTML = rows.slice(0, 200).map(p => {
    const stok = hppLokasi === 'gudang' ? p.stock_qty_gudang : p.stock_qty_toko;
    const saran = p.hpp_suggestion || 0;
    const variantLabel = p.variant_label || '';
    const variantVal   = p.variant_names && p.variant_names !== 'nan' && p.variant_names !== '' ? p.variant_names : '';
    const variantText  = variantLabel && variantVal ? `${variantLabel} — ${variantVal}`
                       : variantLabel || variantVal || '<span style="color:#ccc">-</span>';
    return `<tr>
      <td>${badgeHTML(p.hpp_status)}</td>
      <td><strong>${p.sku}</strong></td>
      <td>${p.name}</td>
      <td style="font-size:12px;color:#444">${variantText}</td>
      <td>${p.category || '-'}</td>
      <td class="number">${num(stok)}</td>
      <td class="number">${rp(p.pos_sell_price)}</td>
      <td class="number" style="color:var(--success)">${saran > 0 ? rp(saran) : '<span style="color:#ccc">-</span>'}</td>
      <td><input type="number" id="hpp-input-${p.id}" value="${saran > 0 ? saran : ''}"
           placeholder="Isi HPP" min="0" onchange="markHppDirty('${p.id}')"></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:#999">Semua HPP sudah terisi 🎉</td></tr>';
}

const dirtyHpp = new Set();
window.markHppDirty = (id) => dirtyHpp.add(id);

window.saveHpp = async () => {
  if (dirtyHpp.size === 0) { toast('Belum ada perubahan', 'error'); return; }

  const btn = document.getElementById('btn-save-hpp');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    const batch = writeBatch(db);
    let saved = 0;

    for (const id of dirtyHpp) {
      const val = parseFloat(document.getElementById(`hpp-input-${id}`)?.value || 0);
      if (val > 0) {
        const field = hppLokasi === 'gudang' ? 'buy_price_gudang' : 'buy_price_toko';
        batch.update(doc(db, 'products', id), { [field]: val, updated_at: serverTimestamp() });
        saved++;
      }
    }
    await batch.commit();
    dirtyHpp.clear();
    toast(`✅ ${saved} HPP berhasil disimpan`);
    await loadHpp();
  } catch (e) {
    toast('Gagal: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Simpan Semua HPP';
  }
};

// ── REKONSILIASI ───────────────────────────────────────────────────────────
async function loadRekonsiliasi() {
  const loading = document.getElementById('rekon-loading');
  const content = document.getElementById('rekon-content');
  loading.style.display = 'flex'; content.style.display = 'none';

  const snap = await getDocs(collection(db, 'products'));
  const all  = snap.docs.map(d => d.data());

  const onlyT = all.filter(p => p.lokasi?.length === 1 && p.lokasi[0] === 'toko');
  const onlyG = all.filter(p => p.lokasi?.length === 1 && p.lokasi[0] === 'gudang');
  const both  = all.filter(p => p.lokasi?.includes('gudang') && p.lokasi?.includes('toko'));
  const bedaStok = both.filter(p => p.stock_qty_gudang !== p.stock_qty_toko);
  const bedaNama = both.filter(p => p.name_gudang && p.name_toko && p.name_gudang !== p.name_toko);

  document.getElementById('tab-only-toko-cnt').textContent   = onlyT.length;
  document.getElementById('tab-only-gudang-cnt').textContent = onlyG.length;
  document.getElementById('tab-beda-stok-cnt').textContent   = bedaStok.length;
  document.getElementById('tab-beda-nama-cnt').textContent   = bedaNama.length;

  const rekonTables = { 'only-toko': onlyT, 'only-gudang': onlyG };
  for (const [key, data] of Object.entries(rekonTables)) {
    document.getElementById(`rekon-${key}-body`).innerHTML = data.map(p => `
      <tr>
        <td>${p.sku}</td><td>${p.name}</td><td>${p.category||'-'}</td>
        <td class="number">${num(key === 'only-toko' ? p.stock_qty_toko : p.stock_qty_gudang)}</td>
        <td class="number">${rp(key === 'only-toko' ? p.buy_price_toko : p.buy_price_gudang)}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#999">Tidak ada</td></tr>';
  }

  document.getElementById('rekon-beda-stok-body').innerHTML = bedaStok.map(p => `
    <tr>
      <td>${p.sku}</td><td>${p.name}</td>
      <td class="number">${num(p.stock_qty_gudang)}</td>
      <td class="number">${num(p.stock_qty_toko)}</td>
      <td class="number" style="color:${(p.stock_qty_gudang - p.stock_qty_toko) < 0 ? 'red' : 'green'}">
        ${num(p.stock_qty_gudang - p.stock_qty_toko)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#999">Stok sinkron semua 🎉</td></tr>';

  document.getElementById('rekon-beda-nama-body').innerHTML = bedaNama.map(p => `
    <tr>
      <td>${p.sku}</td>
      <td>${p.name_gudang}</td>
      <td>${p.name_toko}</td>
      <td>${p.category||'-'}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:24px;color:#999">Nama sinkron semua 🎉</td></tr>';

  loading.style.display = 'none'; content.style.display = 'block';
}

window.switchRekonTab = (tab) => {
  document.querySelectorAll('.rekon-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.rekon-panel').forEach(p =>
    p.classList.toggle('active', p.id === `rekon-panel-${tab}`));
};

// ── UPDATE STOK ────────────────────────────────────────────────────────────
let stokAllData = [];

async function loadStok() {
  document.getElementById('stok-loading').style.display    = 'flex';
  document.getElementById('stok-table-wrap').style.display = 'none';
  document.getElementById('stok-empty').style.display      = 'none';

  if (stokAllData.length === 0) {
    const snap   = await getDocs(collection(db, 'products'));
    stokAllData  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    stokAllData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Isi dropdown kategori
    const kats = [...new Set(stokAllData.map(p => p.category).filter(Boolean))].sort();
    const sel  = document.getElementById('stok-kat');
    if (sel.options.length <= 1)
      kats.forEach(k => sel.add(new Option(k, k)));
  }

  document.getElementById('stok-loading').style.display = 'none';
  document.getElementById('stok-empty').style.display   = 'flex';
}

window.searchStok = () => {
  const cari = document.getElementById('stok-search').value.trim().toUpperCase();
  const kat  = document.getElementById('stok-kat').value;

  if (!cari && !kat) {
    document.getElementById('stok-table-wrap').style.display = 'none';
    document.getElementById('stok-empty').style.display      = 'flex';
    document.getElementById('stok-count').textContent        = '';
    return;
  }

  let rows = stokAllData;
  if (cari) rows = rows.filter(p =>
    (p.name || '').includes(cari) || (p.sku || '').includes(cari) ||
    (p.variant_names || '').includes(cari) || (p.variant_label || '').includes(cari)
  );
  if (kat) rows = rows.filter(p => p.category === kat);

  document.getElementById('stok-count').textContent        = rows.length > 0 ? `${rows.length.toLocaleString('id-ID')} produk ditemukan` : 'Tidak ditemukan';
  document.getElementById('stok-empty').style.display      = 'none';
  document.getElementById('stok-table-wrap').style.display = rows.length > 0 ? 'block' : 'none';

  const variantText = p => {
    const l = p.variant_label || '', v = p.variant_names && p.variant_names !== 'nan' ? p.variant_names : '';
    return l && v ? `${l} — ${v}` : l || v || '-';
  };

  document.getElementById('stok-table-body').innerHTML = rows.slice(0, 100).map(p => `
    <tr id="stok-row-${p.id}">
      <td><strong>${p.sku}</strong></td>
      <td>${p.name}</td>
      <td style="font-size:12px;color:#444">${variantText(p)}</td>
      <td>${p.category || '-'}</td>
      <td class="number">
        <input type="number" id="sg-${p.id}" value="${p.stock_qty_gudang ?? ''}"
          placeholder="-" min="0" style="width:90px;padding:6px 8px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px;text-align:right"
          onfocus="this.style.borderColor='#034543';this.style.background='#fffbd5'"
          onblur="this.style.borderColor='#e5e5e5';this.style.background=''">
      </td>
      <td class="number">
        <input type="number" id="st-${p.id}" value="${p.stock_qty_toko ?? ''}"
          placeholder="-" min="0" style="width:90px;padding:6px 8px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px;text-align:right"
          onfocus="this.style.borderColor='#034543';this.style.background='#fffbd5'"
          onblur="this.style.borderColor='#e5e5e5';this.style.background=''">
      </td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="saveStok('${p.id}')">Simpan</button>
      </td>
    </tr>`).join('');

  if (rows.length > 100)
    document.getElementById('stok-table-body').insertAdjacentHTML('beforeend',
      `<tr><td colspan="7" style="text-align:center;padding:16px;color:#999;font-size:13px">
        Menampilkan 100 dari ${rows.length} hasil. Persempit pencarian untuk melihat lebih spesifik.
      </td></tr>`);
};

window.saveStok = async (id) => {
  const btn  = document.querySelector(`#stok-row-${id} button`);
  const sg   = parseFloat(document.getElementById(`sg-${id}`)?.value ?? '');
  const st   = parseFloat(document.getElementById(`st-${id}`)?.value ?? '');

  btn.disabled    = true;
  btn.textContent = '...';

  try {
    const update = { updated_at: serverTimestamp() };
    if (!isNaN(sg)) update.stock_qty_gudang = sg;
    if (!isNaN(st)) update.stock_qty_toko   = st;

    await updateDoc(doc(db, 'products', id), update);

    // Update cache lokal
    const idx = stokAllData.findIndex(p => p.id === id);
    if (idx >= 0) {
      if (!isNaN(sg)) stokAllData[idx].stock_qty_gudang = sg;
      if (!isNaN(st)) stokAllData[idx].stock_qty_toko   = st;
    }

    btn.textContent = '✓';
    btn.style.background = '#16a34a';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Simpan'; btn.style.background = ''; }, 1500);
    toast(`✅ Stok ${id} diperbarui`);
  } catch (e) {
    toast('Gagal: ' + e.message, 'error');
    btn.disabled = false; btn.textContent = 'Simpan';
  }
};

// ── Init ───────────────────────────────────────────────────────────────────
loadDashboard();
