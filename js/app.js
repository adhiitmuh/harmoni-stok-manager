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
  if (id === 'sinkron')       loadSinkron();
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
    bangunModalAnalitik(false, products);
    renderRingkasan(products);

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

async function renderRingkasan(products) {
  const box = document.getElementById('ringkas-keputusan'); if (!box) return
  await muatLaku()
  const hit = k => products.filter(KONDISI[k])
  const kosong = hit('kosong_laku'), pindah = hit('pindah'), mati = hit('mati'), naik = hit('modal_naik'), margin = hit('margin')
  const hilang = kosong.reduce((t, p) => t + lakuSku(p) * hargaP(p), 0)
  const tertahan = mati.reduce((t, p) => t + totalStok(p) * modalP(p), 0)
  const kartu = (k, ikon, judul, val, sub, bg, fg) => `<button class="ringkas-kartu" style="background:${bg};color:${fg}" onclick="bukaFilterStok('${k}')"><div class="rk-ikon">${ikon} ${judul}</div><div class="rk-val">${val}</div><div class="rk-sub">${sub}</div></button>`
  box.innerHTML = kartu('kosong_laku', '🔥', 'Penjualan hilang', rp(Math.round(hilang)) + '<span style="font-size:12px;font-weight:600">/bln</span>', `${num(kosong.length)} barang laku sedang kosong`, '#fef2f2', '#991b1b')
    + kartu('pindah', '🚚', 'Toko kosong, gudang ada', num(pindah.length) + ' barang', 'pindahkan dulu sebelum beli', '#eff6ff', '#1e40af')
    + kartu('mati', '🧊', 'Modal tertahan', rp(tertahan), `${num(mati.length)} barang tidak laku 6 bulan`, '#f1f5f9', '#334155')
    + kartu('modal_naik', '📈', 'Modal naik', num(naik.length) + ' barang', 'modal di Olsera naik >10% — cek harga jual', '#fff7ed', '#9a3412')
    + kartu('margin', '⚠️', 'Margin tipis / rugi', num(margin.length) + ' barang', 'harga jual < modal + 15%', '#fefce8', '#854d0e')
  document.getElementById('ringkas-info').textContent = lakuInfo ? lakuInfo + ' Penjualan hilang = laku/bln × harga jual.' : ''
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
    sinkronModalKeAnalitik([...dirtyHpp].map(id => [id, parseFloat(document.getElementById(`hpp-input-${id}`)?.value || 0)]).filter(([, v]) => v > 0))
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

// ── UPLOAD DATA OLSERA ─────────────────────────────────────────────────────
const uploadData = { gudang: [], toko: [] };

function loadSinkron() {} // page loaded on nav click, no init needed

window.handleDrop = (e, lokasi) => {
  e.preventDefault();
  document.getElementById(`drop-${lokasi}`).classList.remove('drag-over');
  handleFiles(e.dataTransfer.files, lokasi);
};

window.handleFiles = async (files, lokasi) => {
  if (!files.length) return;
  const XLSX = await loadXLSX();
  uploadData[lokasi] = [];

  let totalRows = 0;
  const fileNames = [];

  for (const file of files) {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    uploadData[lokasi].push(...rows);
    totalRows += rows.length;
    fileNames.push(file.name);
  }

  const info = document.getElementById(`info-${lokasi}`);
  info.style.display = 'block';
  info.innerHTML = `
    ✅ <strong>${files.length} file</strong> berhasil dibaca<br>
    📦 <strong>${totalRows.toLocaleString('id-ID')} baris</strong> data produk siap diupload<br>
    📄 ${fileNames.join(', ')}
  `;
  document.getElementById(`btn-upload-${lokasi}`).style.display = 'block';
};

let xlsxLib = null;
async function loadXLSX() {
  if (xlsxLib) return xlsxLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  xlsxLib = window.XLSX;
  return xlsxLib;
}

window.uploadToFirestore = async (lokasi) => {
  const rows = uploadData[lokasi];
  if (!rows.length) return;

  const btn = document.getElementById(`btn-upload-${lokasi}`);
  btn.disabled = true; btn.textContent = 'Mengupload...';

  const card = document.getElementById('upload-progress-card');
  const bar  = document.getElementById('upload-progress-bar');
  const log  = document.getElementById('upload-log');
  card.style.display = 'block'; log.innerHTML = '';

  const addLog = (msg) => { log.innerHTML += msg + '<br>'; log.scrollTop = log.scrollHeight; };

  try {
    const total = rows.length;
    let done = 0;
    const BATCH = 400;

    addLog(`🚀 Memulai upload <strong>${total.toLocaleString('id-ID')}</strong> produk (${lokasi})...`);

    for (let i = 0; i < total; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const batch = writeBatch(db);

      for (const r of chunk) {
        const sku = String(r.sku || '').trim().toUpperCase();
        if (!sku || sku === 'SKU') continue;

        const stockField = lokasi === 'gudang' ? 'stock_qty_gudang' : 'stock_qty_toko';
        const priceField = lokasi === 'gudang' ? 'buy_price_gudang' : 'buy_price_toko';

        const data = {
          sku,
          name          : String(r.name || '').trim().toUpperCase(),
          category      : String(r.category || '').trim(),
          variant_label : String(r.variant_label || '').trim(),
          variant_names : String(r.variant_names || '').trim(),
          pos_sell_price: parseFloat(r.pos_sell_price) || 0,
          [stockField]  : parseFloat(r.stock_qty) || 0,
          updated_at    : serverTimestamp(),
        };
        // Modal dari Olsera hanya dipakai kalau ada nilainya — modal yang diisi manual tidak ditimpa 0
        if (parseFloat(r.buy_price) > 0) data[priceField] = parseFloat(r.buy_price);

        // Tambahkan lokasi
        const ref = doc(db, 'products', sku);
        batch.set(ref, {
          ...data,
          lokasi: lokasi === 'gudang'
            ? (data[stockField] >= 0 ? ['gudang'] : [])
            : (data[stockField] >= 0 ? ['toko'] : []),
        }, { merge: true });
      }

      await batch.commit();
      done += chunk.length;
      const pct = Math.round(done / total * 100);
      bar.style.width = pct + '%';
      addLog(`✓ ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} produk`);
    }

    // Stok yang sama juga dipakai Analitik Penjualan
    {
      const peta = {}; rows.forEach(r => { const k = String(r.sku || '').trim().toUpperCase(); if (k && k !== 'SKU') peta[k] = (peta[k] || 0) + (parseFloat(r.stock_qty) || 0) })
      const d = hiDb()
      if (d) {
        try { await d.collection('settings').doc('stok_fisik').set({ [lokasi]: peta, [lokasi + '_updated_at']: firebase.firestore.FieldValue.serverTimestamp(), [lokasi + '_updated_by']: (window._harmoniUserName || '') + ' (Stok Manager)' }, { merge: true }); _stokFisik = null; addLog('☁️ Stok juga diperbarui di Analitik Penjualan') }
        catch (e) { addLog(`<span style="color:#b45309">⚠️ Analitik belum diperbarui: ${e.message}</span>`) }
      }
      _modalDibangun = false; bangunModalAnalitik(true)
    }
    addLog(`<strong style="color:#16a34a">✅ Upload selesai! ${total.toLocaleString('id-ID')} produk ${lokasi} berhasil disinkronkan.</strong>`);
    toast(`✅ ${total.toLocaleString('id-ID')} produk ${lokasi} berhasil diupload`);
    stokAllData = []; // reset cache stok
    invalidateDashboard();
  } catch (e) {
    addLog(`<span style="color:red">❌ Error: ${e.message}</span>`);
    toast('Gagal upload: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '⬆️ Upload ke Sistem';
  }
};

function invalidateDashboard() {
  // Force reload dashboard data next time
  document.getElementById('dash-loading').style.display = 'flex';
  document.getElementById('dash-content').style.display = 'none';
}

// ── SINKRON DENGAN ANALITIK PENJUALAN (project harmoni-indonesia) ──────────
// settings/stok_fisik  = { toko:{SKU:qty}, gudang:{SKU:qty}, toko_updated_at, ... }  → dipakai Analitik
// settings/modal_produk = { m:{SKU:modal} }  → modal yang diisi di Stok Manager dipakai Analitik
const hiDb = () => { const a = window._harmoniAuthApp; return a && a.auth().currentUser ? a.firestore() : null }
let _stokFisik = null
async function muatStokFisik() {
  const d = hiDb(); if (!d) return null
  try { _stokFisik = (await d.collection('settings').doc('stok_fisik').get()).data() || {} } catch (e) { console.warn('stok_fisik', e) }
  return _stokFisik
}
// Kunci SKU di stok_fisik apa adanya dari Olsera — cari yang sama tanpa beda huruf besar/kecil
const kunciFisik = (lokasi, sku) => Object.keys(_stokFisik?.[lokasi] || {}).find(k => k.toUpperCase() === sku.toUpperCase()) || sku
async function sinkronStokKeAnalitik(sku, lokasi, qty) {
  const d = hiDb(); if (!d) return false
  try {
    if (!_stokFisik) await muatStokFisik()
    const k = kunciFisik(lokasi, sku)
    await d.collection('settings').doc('stok_fisik').update(new firebase.firestore.FieldPath(lokasi, k), qty, lokasi + '_updated_by', (window._harmoniUserName || '') + ' (Stok Manager)')
    if (_stokFisik) (_stokFisik[lokasi] = _stokFisik[lokasi] || {})[k] = qty
    return true
  } catch (e) { console.warn('sinkron stok', e); return false }
}
async function sinkronModalKeAnalitik(pasangan) {   // [[sku, modal], ...]
  const d = hiDb(); if (!d || !pasangan.length) return
  try {
    const args = []; pasangan.forEach(([sku, m]) => args.push(new firebase.firestore.FieldPath('m', sku.toUpperCase()), m))
    await d.collection('settings').doc('modal_produk').update(...args)
  } catch (e) {
    if (e.code === 'not-found') await bangunModalAnalitik(true)
    else console.warn('sinkron modal', e)
  }
}
// Ringkasan modal lengkap (sekali per sesi, dari data produk) supaya Analitik selalu punya data modal terbaru
let _modalDibangun = false
async function bangunModalAnalitik(paksa, produk) {
  const d = hiDb(); if (!d || (_modalDibangun && !paksa)) return
  try {
    const list = produk || (await getDocs(collection(db, 'products'))).docs.map(x => x.data())
    const m = {}; list.forEach(p => { const v = (+p.buy_price_toko > 0 ? +p.buy_price_toko : +p.buy_price_gudang) || 0; if (p.sku && v > 0) m[String(p.sku).toUpperCase()] = v })
    await d.collection('settings').doc('modal_produk').set({ m, updated_at: firebase.firestore.FieldValue.serverTimestamp(), updated_by: (window._harmoniUserName || '') + ' (Stok Manager)' })
    _modalDibangun = true
  } catch (e) { console.warn('bangun modal', e) }
}

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
  if (document.getElementById('stok-kondisi')?.value || document.getElementById('stok-search').value) searchStok();
  muatStokFisik().then(f => {
    const el = document.getElementById('stok-sumber'); if (!el || !f) return
    const tgl = t => t?.toDate ? t.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
    el.style.display = 'block'
    el.innerHTML = `🔗 Tersambung dengan <b>Analitik Penjualan</b> — upload stok di salah satu aplikasi, keduanya ikut terbarui. Stok toko terakhir: <b>${tgl(f.toko_updated_at)}</b>${f.toko_updated_by ? ' (' + f.toko_updated_by + ')' : ''} · gudang: <b>${tgl(f.gudang_updated_at)}</b>${f.gudang_updated_by ? ' (' + f.gudang_updated_by + ')' : ''}`
  })
}

// Penjualan per SKU dari Analitik Penjualan (ringkasan bulanan, project harmoni-indonesia) → "laku" = rata-rata 3 bulan terakhir
let lakuPerSku = null, laku6PerSku = {}, lakuInfo = '';
async function muatLaku() {
  if (lakuPerSku) return lakuPerSku;
  const app = window._harmoniAuthApp; lakuPerSku = {};
  if (!app || !app.auth().currentUser) return lakuPerSku;
  try {
    const col = app.firestore().collection('penjualan_operator'), meta = await col.doc('meta').get();
    if (!meta.exists) { lakuInfo = 'Data penjualan belum ada — buka Analitik Penjualan (Owner/Admin) sekali supaya tersinkron.'; return lakuPerSku }
    const n = meta.data().n || 1, parts = await Promise.all(Array.from({ length: n }, (_, i) => col.doc('part_' + i).get()))
    const r = JSON.parse(parts.sort((a, b) => (a.data()?.i || 0) - (b.data()?.i || 0)).map(d => d.data()?.data || '').join(''))
    const N = (r.bulan || []).length, ambil = Math.min(3, N)
    ;(r.sku || []).forEach(x => { const q = x.q || [], K = String(x.s).toUpperCase(), tot = q.slice(N - ambil).reduce((t, v) => t + (+v || 0), 0); lakuPerSku[K] = ambil ? +(tot / ambil).toFixed(1) : 0; laku6PerSku[K] = q.slice(Math.max(0, N - 6)).reduce((t, v) => t + (+v || 0), 0) })
    lakuInfo = `Laku/bln = rata-rata ${ambil} bulan terakhir (${(r.bulan || []).slice(N - ambil).join(', ')}) dari Analitik Penjualan.`
  } catch (e) {
    console.warn('penjualan', e)
    lakuInfo = e.code === 'permission-denied' ? 'Akun ini belum punya akses data penjualan — minta Owner memberi akses.' : 'Data penjualan gagal dimuat — cek internet.'
  }
  return lakuPerSku
}
const lakuSku = p => lakuPerSku?.[String(p.sku || p.id || '').toUpperCase()] || 0
const totalStok = p => (+p.stock_qty_gudang || 0) + (+p.stock_qty_toko || 0)
const stokToko = p => +p.stock_qty_toko || 0, stokGudang = p => +p.stock_qty_gudang || 0
const modalP = p => (+p.buy_price_toko > 0 ? +p.buy_price_toko : +p.buy_price_gudang) || 0
const hargaP = p => +p.pos_sell_price || 0
const laku6 = p => laku6PerSku[String(p.sku || p.id || '').toUpperCase()] || 0
// Kondisi untuk filter & ringkasan
const KONDISI = {
  kosong: p => totalStok(p) <= 0,
  kosong_laku: p => totalStok(p) <= 0 && lakuSku(p) > 0,
  hampir_laku: p => { const t = totalStok(p), l = lakuSku(p); return l > 0 && t > 0 && t < l },
  pindah: p => stokToko(p) <= 0 && stokGudang(p) > 0 && (laku6(p) > 0 || lakuSku(p) > 0),
  tanpa_hpp: p => tanpaHpp(p),
  modal_naik: p => +p.modal_baru_olsera > 0,
  margin: p => hargaP(p) > 0 && modalP(p) > 0 && hargaP(p) < modalP(p) * 1.15 && (totalStok(p) > 0 || lakuSku(p) > 0),
  mati: p => totalStok(p) > 0 && laku6(p) <= 0 && lakuPerSku && Object.keys(lakuPerSku).length > 0,
}
const URUT = {
  kosong_laku: (a, b) => lakuSku(b) * hargaP(b) - lakuSku(a) * hargaP(a),
  hampir_laku: (a, b) => lakuSku(b) - lakuSku(a),
  pindah: (a, b) => lakuSku(b) - lakuSku(a) || stokGudang(b) - stokGudang(a),
  mati: (a, b) => totalStok(b) * modalP(b) - totalStok(a) * modalP(a),
  margin: (a, b) => lakuSku(b) - lakuSku(a),
}
const tanpaHpp = p => !(modalP(p) > 0)   // modal toko atau gudang — salah satu cukup

window.searchStok = async () => {
  const cari = document.getElementById('stok-search').value.trim().toUpperCase();
  const kat  = document.getElementById('stok-kat').value;
  const kondisi = document.getElementById('stok-kondisi')?.value || '';
  if (kondisi && !lakuPerSku) {
    document.getElementById('stok-count').textContent = 'Memuat data penjualan…'
    await muatLaku()
  }

  if (!cari && !kat && !kondisi) {
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
  if (kondisi && KONDISI[kondisi]) rows = rows.filter(KONDISI[kondisi]);
  if (URUT[kondisi]) rows = rows.slice().sort(URUT[kondisi]);

  document.getElementById('stok-count').textContent        = (rows.length > 0 ? `${rows.length.toLocaleString('id-ID')} produk ditemukan` : 'Tidak ditemukan') + (lakuInfo && kondisi ? ' · ' + lakuInfo : '');
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
      <td class="number" style="font-weight:700;color:${lakuSku(p) > 0 ? '#166534' : '#999'}">${lakuPerSku ? (lakuSku(p) || '—') : '<span style="font-size:11px;color:#999">pilih filter laku</span>'}${tanpaHpp(p) ? '<div style="font-size:10px;color:#b91c1c;font-weight:700">modal belum ada</div>' : ''}${infoKondisi(p, kondisi)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="saveStok('${p.id}')">Simpan</button>
      </td>
    </tr>`).join('');

  if (rows.length > 100)
    document.getElementById('stok-table-body').insertAdjacentHTML('beforeend',
      `<tr><td colspan="8" style="text-align:center;padding:16px;color:#999;font-size:13px">
        Menampilkan 100 dari ${rows.length} hasil. Persempit pencarian untuk melihat lebih spesifik.
      </td></tr>`);
};

function infoKondisi(p, k) {
  const kec = t => `<div style="font-size:10px;font-weight:600;color:#555;white-space:nowrap">${t}</div>`
  if (k === 'kosong_laku' && hargaP(p)) return kec('hilang ±' + rp(Math.round(lakuSku(p) * hargaP(p))) + '/bln')
  if (k === 'pindah') return kec('🚚 gudang ' + num(stokGudang(p)) + ' → toko')
  if (k === 'mati') return kec('🧊 tertahan ' + rp(totalStok(p) * modalP(p)))
  if (k === 'margin') return kec(`jual ${rp(hargaP(p))} · modal ${rp(modalP(p))}`)
  if (k === 'modal_naik') return kec(`modal ${rp(modalP(p))} → <b style="color:#b91c1c">${rp(p.modal_baru_olsera)}</b>`) + `<button class="btn btn-sm" style="margin-top:4px;font-size:11px;padding:3px 8px" onclick="pakaiModalBaru('${p.id}')">Pakai modal baru</button> <button class="btn btn-sm" style="margin-top:4px;font-size:11px;padding:3px 8px;background:#eee;color:#333" onclick="abaikanModalBaru('${p.id}')">Abaikan</button>`
  return ''
}
window.pakaiModalBaru = async (id) => {
  const p = stokAllData.find(x => x.id === id); if (!p) return
  const baru = +p.modal_baru_olsera, upd = { updated_at: serverTimestamp(), modal_baru_olsera: null }
  if (p.lokasi?.includes('toko') || +p.buy_price_toko > 0) upd.buy_price_toko = baru
  if (p.lokasi?.includes('gudang') || +p.buy_price_gudang > 0) upd.buy_price_gudang = baru
  if (!upd.buy_price_toko && !upd.buy_price_gudang) upd.buy_price_toko = baru
  try { await updateDoc(doc(db, 'products', id), upd); Object.assign(p, upd, { modal_baru_olsera: null }); sinkronModalKeAnalitik([[p.sku || id, baru]]); toast('✅ Modal ' + (p.sku || id) + ' jadi ' + rp(baru)); searchStok() }
  catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.abaikanModalBaru = async (id) => {
  const p = stokAllData.find(x => x.id === id); if (!p) return
  try { await updateDoc(doc(db, 'products', id), { modal_baru_olsera: null, updated_at: serverTimestamp() }); p.modal_baru_olsera = null; toast('Diabaikan'); searchStok() }
  catch (e) { toast('Gagal: ' + e.message, 'error') }
}
// Dari kartu Dashboard → buka Update Stok dengan filter
window.bukaFilterStok = (k) => {
  const sel = document.getElementById('stok-kondisi'); if (sel) sel.value = k
  document.getElementById('stok-search').value = ''; document.getElementById('stok-kat').value = ''
  document.querySelector('.nav-item[data-page="stok"]').click()
}

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

    // Ikut perbarui stok di Analitik Penjualan
    const pr = stokAllData[idx] || { sku: id }, sk = String(pr.sku || id)
    const ok = [!isNaN(sg) ? await sinkronStokKeAnalitik(sk, 'gudang', sg) : true, !isNaN(st) ? await sinkronStokKeAnalitik(sk, 'toko', st) : true].every(Boolean)
    if (!ok) toast('Stok tersimpan, tapi belum tersinkron ke Analitik — cek internet / login Portal', 'error')

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
