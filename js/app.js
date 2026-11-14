import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, writeBatch, setDoc, deleteDoc
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
  if (id === 'supplier')      loadSupplier();
  if (id === 'banding')       loadBanding();
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
  // Daftar produk untuk dipilih di nota → langsung tertaut SKU (tidak perlu konfirmasi nanti)
  produkSemua().then(pr => { const dl = document.getElementById('dl-produk-nota'); if (dl && !dl.options.length) dl.innerHTML = pr.map(p => `<option value="${esc(namaProduk(p))} · ${esc(p.sku || p.id)}">`).join('') })
  muatSupplier().then(l => { const dl = document.getElementById('supplier-list'); if (dl && l.length) { const ada = new Set([...dl.options].map(o => o.value.toUpperCase())); l.forEach(s => { if (!ada.has(s.nama)) dl.insertAdjacentHTML('beforeend', `<option value="${esc(s.nama)}">`) }) } })
  await loadNotaHistory();
}

function renderNotaForm() {
  document.getElementById('nota-items-body').innerHTML = notaItemRow(0);
}

function notaItemRow(i) {
  return `<tr id="nota-row-${i}">
    <td><input type="text"   id="nb-nama-${i}"  list="dl-produk-nota" placeholder="Ketik nama barang — pilih dari daftar bila ada" style="width:100%;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:6px;font-size:13px"></td>
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

const JENIS_NOTA = { nota: ['🧾 Nota', '#ecfdf5', '#166534'], penawaran: ['📋 Penawaran', '#eff6ff', '#1e40af'], catatan: ['📝 Catatan', '#fefce8', '#854d0e'] }
const jenisNota = () => document.querySelector('input[name="nota-jenis"]:checked')?.value || 'nota'
window.ubahJenisNota = () => { const j = jenisNota()
  document.getElementById('nota-tgl-label').textContent = j === 'nota' ? 'Tanggal Nota *' : 'Tanggal harga *'
  document.getElementById('nota-inv-label').innerHTML = j === 'nota' ? 'No. Invoice <span style="color:#999">(opsional)</span>' : 'Sumber / keterangan <span style="color:#999">(opsional)</span>'
  document.getElementById('nota-noinv').placeholder = j === 'nota' ? 'Contoh: SF-001' : j === 'penawaran' ? 'cth: price list Nov 2026, min. order 1 lusin' : 'cth: chat WA Pak Budi'
  document.getElementById('nota-th-harga').textContent = j === 'nota' ? 'Harga Satuan (HPP)' : 'Harga Satuan (ditawarkan)'
  document.getElementById('btn-simpan-nota').textContent = j === 'nota' ? '💾 Simpan Nota' : '💾 Simpan Harga' }
// Tempel daftar harga dari chat: "Nama barang 5.500" / "Rp 3rb" / "12k"
window.tempelDaftarHarga = () => {
  const baris = document.getElementById('nota-tempel').value.split(/\n+/).map(t => t.trim()).filter(Boolean); let n = 0
  baris.forEach(t => { const m = t.match(/^(.*?)[\s:=\-–]*(?:rp\.?\s*)?(\d[\d.,]*)\s*(rb|ribu|k)?\s*(?:\/\s*\w+)?\s*$/i); if (!m || !m[1].trim()) return
    let h = m[3] ? parseFloat(m[2].replace(',', '.')) * 1000 : parseFloat(m[2].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); if (!(h > 0)) return
    let i = [...Array(notaRows).keys()].find(k => document.getElementById(`nb-nama-${k}`) && !document.getElementById(`nb-nama-${k}`).value)
    if (i === undefined) { addNotaRow(); i = notaRows - 1 }
    document.getElementById(`nb-nama-${i}`).value = m[1].replace(/[\s:=\-–]+$/, '').trim(); document.getElementById(`nb-harga-${i}`).value = Math.round(h); n++ })
  toast(n ? `✅ ${n} baris masuk ke tabel — cek lalu simpan` : 'Tidak ada baris yang terbaca (harga harus di akhir baris)', n ? 'ok' : 'error')
}
window.submitNota = async () => {
  const supplier  = document.getElementById('nota-supplier').value.trim().toUpperCase();
  const jenis     = jenisNota();
  const tanggal   = document.getElementById('nota-tanggal').value;
  const no_inv    = document.getElementById('nota-noinv').value.trim();

  if (!supplier) { toast('Nama supplier wajib diisi', 'error'); return; }
  if (!tanggal)  { toast('Tanggal wajib diisi', 'error'); return; }

  const items = [];
  for (let i = 0; i < notaRows; i++) {
    const nama  = document.getElementById(`nb-nama-${i}`)?.value?.trim();
    const qty   = parseFloat(document.getElementById(`nb-qty-${i}`)?.value || 0);
    const harga = parseFloat(document.getElementById(`nb-harga-${i}`)?.value || 0);
    const cat   = document.getElementById(`nb-cat-${i}`)?.value?.trim();
    if (nama && jenis !== 'nota' && !(harga > 0)) continue;   // penawaran/catatan tanpa harga tidak berguna
    if (nama) { const m = nama.match(/^(.*) · ([^·]+)$/), it = { nama_barang: m ? m[1].trim() : nama, qty, harga_satuan: harga, catatan: cat || '' }; if (m) it.sku = m[2].trim(); items.push(it); }
  }

  if (items.length === 0) { toast('Minimal satu item harus diisi', 'error'); return; }

  const btn = document.getElementById('btn-simpan-nota');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    await addDoc(collection(db, 'nota'), {
      supplier, tanggal, no_invoice: no_inv, items, jenis,
      created_at: serverTimestamp(),
    });
    toast(`✅ ${items.length} item dari ${supplier} disimpan (${JENIS_NOTA[jenis][0]})`); window._bh = null;

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
  body.innerHTML = '<tr><td colspan="6" class="loading"><div class="spinner"></div></td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'nota'), orderBy('created_at', 'desc'), limit(50)));
    const rows = snap.docs.map(d => { const n = d.data(); return `
      <tr>
        <td>${n.tanggal || '-'}</td>
        <td><span class="badge-jenis" style="background:${JENIS_NOTA[n.jenis || 'nota'][1]};color:${JENIS_NOTA[n.jenis || 'nota'][2]}">${JENIS_NOTA[n.jenis || 'nota'][0]}</span></td>
        <td>${n.supplier || '-'}</td>
        <td>${n.no_invoice || '-'}</td>
        <td>${n.items?.length || 0} item</td>
        <td>${n.items?.map(i => i.nama_barang).join(', ').substring(0, 60) || '-'}…</td>
      </tr>`;}).join('');
    body.innerHTML = rows || '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px">Belum ada nota</td></tr>';
  } catch(e) {
    body.innerHTML = `<tr><td colspan="6" style="color:red">${e.message}</td></tr>`;
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
    const m = {}, sk = {}; list.forEach(p => { const K = String(p.sku || '').toUpperCase(), v = (+p.buy_price_toko > 0 ? +p.buy_price_toko : +p.buy_price_gudang) || 0; if (K && v > 0) m[K] = v; if (K && p.supplier) sk[K] = p.supplier })
    const sup = {}; (await muatSupplier(true)).forEach(x => { sup[x.nama] = { lama: +x.lama || 0, wa: x.wa || '' } })
    await d.collection('settings').doc('modal_produk').set({ m, s: sk, sup, updated_at: firebase.firestore.FieldValue.serverTimestamp(), updated_by: (window._harmoniUserName || '') + ' (Stok Manager)' })
    _modalDibangun = true
  } catch (e) { console.warn('bangun modal', e) }
}

// ── SUPPLIER ───────────────────────────────────────────────────────────────
// Filter "barang supplier X" hilang begitu cari / kategori / kondisi diubah (capture: sebelum handler searchStok)
document.addEventListener('input', e => { if (['stok-search', 'stok-kat', 'stok-kondisi'].includes(e.target.id)) window._filterSupplier = null }, true)
document.addEventListener('change', e => { if (['stok-kat', 'stok-kondisi'].includes(e.target.id)) window._filterSupplier = null }, true)
let supplierList = null
const idSup = n => String(n).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'SUP'
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const jsStr = t => String(t ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
async function muatSupplier(paksa) {
  if (supplierList && !paksa) return supplierList
  supplierList = (await getDocs(collection(db, 'supplier'))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nama).localeCompare(String(b.nama)))
  const dl = document.getElementById('dl-sup'); if (dl) dl.innerHTML = supplierList.map(s => `<option value="${esc(s.nama)}">`).join('')
  return supplierList
}
async function produkSemua() {
  if (!stokAllData.length) { const snap = await getDocs(collection(db, 'products')); stokAllData = snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  return stokAllData
}
async function sinkronSupplierKeAnalitik(pasangan, supInfo) {   // pasangan: [[sku, supplier]], supInfo: {nama: {lama, wa} | null}
  const d = hiDb(); if (!d) return
  try {
    const args = [], FV = firebase.firestore.FieldValue
    ;(pasangan || []).forEach(([sku, s]) => args.push(new firebase.firestore.FieldPath('s', String(sku).toUpperCase()), s || FV.delete()))
    Object.entries(supInfo || {}).forEach(([n, v]) => args.push(new firebase.firestore.FieldPath('sup', n), v || FV.delete()))
    if (args.length) await d.collection('settings').doc('modal_produk').update(...args)
  } catch (e) { if (e.code === 'not-found') await bangunModalAnalitik(true); else console.warn('sinkron supplier', e) }
}
async function loadSupplier() {
  const list = await muatSupplier(true), produk = await produkSemua()
  const jml = {}; produk.forEach(p => { if (p.supplier) jml[p.supplier] = (jml[p.supplier] || 0) + 1 })
  const kq = {}; try { (await getDocs(collection(db, 'kualitas'))).docs.forEach(d => { const k = d.data(); if (+k.nilai > 0) { const x = kq[k.supplier] = kq[k.supplier] || { t: 0, n: 0 }; x.t += +k.nilai; x.n++ } }) } catch (e) {}
  let dariNota = []
  try { dariNota = [...new Set((await getDocs(collection(db, 'nota'))).docs.map(d => String(d.data().supplier || '').trim().toUpperCase()).filter(Boolean))].filter(n => !list.some(s => s.nama === n)) } catch (e) {}
  document.getElementById('sup-list').innerHTML = (list.length ? `<div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Lama kirim</th><th>Kualitas</th><th>No. WA</th><th>Barang</th><th>Catatan</th><th></th></tr></thead><tbody>${list.map(s => `<tr>
      <td><b>${esc(s.nama)}</b></td><td>${s.lama ? s.lama + ' hari' : '<span style="color:#b91c1c;font-weight:700">belum diisi</span>'}</td>
      <td style="white-space:nowrap">${kq[s.nama] ? `⭐ ${(kq[s.nama].t / kq[s.nama].n).toFixed(1)} <span style="font-size:11px;color:#666">(${kq[s.nama].n} barang)</span>` : '<span style="color:#999;font-size:12px">belum dinilai</span>'}</td>
      <td>${s.wa ? `<a href="https://api.whatsapp.com/send?phone=${String(s.wa).replace(/\D/g, '').replace(/^0/, '62')}" target="_blank">${esc(s.wa)}</a>` : '—'}</td>
      <td>${num(jml[s.nama] || 0)} <a href="#" onclick="lihatBarangSupplier('${jsStr(s.nama)}');return false" style="font-size:12px">lihat</a></td><td style="font-size:12px;color:#666">${esc(s.catatan || '')}</td>
      <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" onclick="ubahSupplier('${jsStr(s.id)}')">Ubah</button> <button class="btn btn-sm" style="background:#fee2e2;color:#b91c1c" onclick="hapusSupplier('${jsStr(s.id)}')">Hapus</button></td></tr>`).join('')}</tbody></table></div>` : '<p style="color:#999">Belum ada supplier.</p>')
    + (dariNota.length ? `<div style="margin-top:12px;font-size:12px;color:#92400e;background:#fffbeb;border-radius:8px;padding:8px 10px">Ada di nota tapi belum terdaftar: ${dariNota.map(n => `<a href="#" onclick="isiFormSupplier('${jsStr(n)}');return false"><b>${esc(n)}</b></a>`).join(', ')} — ketuk untuk menambahkan.</div>` : '')
}
window.isiFormSupplier = n => { resetFormSupplier(); document.getElementById('sup-nama').value = n; scrollTo({ top: 0, behavior: 'smooth' }); document.getElementById('sup-lama').focus() }
window.resetFormSupplier = () => { ['sup-nama', 'sup-wa', 'sup-lama', 'sup-cat'].forEach(i => document.getElementById(i).value = ''); document.getElementById('sup-nama').dataset.lama = ''; document.getElementById('sup-form-judul').textContent = '+ Tambah supplier' }
window.ubahSupplier = id => { const s = supplierList.find(x => x.id === id); if (!s) return
  document.getElementById('sup-nama').value = s.nama; document.getElementById('sup-nama').dataset.lama = s.nama; document.getElementById('sup-wa').value = s.wa || ''; document.getElementById('sup-lama').value = s.lama || ''; document.getElementById('sup-cat').value = s.catatan || ''
  document.getElementById('sup-form-judul').textContent = '✏️ Ubah supplier ' + s.nama; scrollTo({ top: 0, behavior: 'smooth' }) }
window.simpanSupplier = async () => {
  const nama = document.getElementById('sup-nama').value.trim().toUpperCase(), lamaNama = document.getElementById('sup-nama').dataset.lama || ''
  const lama = parseInt(document.getElementById('sup-lama').value) || 0, wa = document.getElementById('sup-wa').value.trim(), catatan = document.getElementById('sup-cat').value.trim()
  if (!nama) return toast('Isi nama supplier', 'error'); if (!lama) return toast('Isi lama kirim (hari)', 'error')
  await muatSupplier()
  if (lamaNama !== nama && supplierList.some(s => s.nama === nama)) return toast('Supplier itu sudah ada', 'error')
  try {
    await setDoc(doc(db, 'supplier', idSup(nama)), { nama, lama, wa, catatan, updated_at: serverTimestamp() })
    const supInfo = { [nama]: { lama, wa } }, pas = []
    if (lamaNama && lamaNama !== nama) {   // ganti nama → pindahkan barangnya
      await deleteDoc(doc(db, 'supplier', idSup(lamaNama))); supInfo[lamaNama] = null
      const produk = (await produkSemua()).filter(p => p.supplier === lamaNama)
      for (let i = 0; i < produk.length; i += 400) { const b = writeBatch(db); produk.slice(i, i + 400).forEach(p => { b.update(doc(db, 'products', p.id), { supplier: nama }); p.supplier = nama; pas.push([p.sku || p.id, nama]) }); await b.commit() }
    }
    await sinkronSupplierKeAnalitik(pas, supInfo); toast('✅ Supplier ' + nama + ' disimpan'); resetFormSupplier(); loadSupplier()
  } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.hapusSupplier = async id => { const s = supplierList.find(x => x.id === id); if (!s) return
  const produk = (await produkSemua()).filter(p => p.supplier === s.nama)
  if (!confirm(`Hapus supplier ${s.nama}?${produk.length ? `\n${produk.length} barang memakai supplier ini — supplier di barang-barang itu ikut dikosongkan.` : ''}`)) return
  try { await deleteDoc(doc(db, 'supplier', id)); const pas = []
    for (let i = 0; i < produk.length; i += 400) { const b = writeBatch(db); produk.slice(i, i + 400).forEach(p => { b.update(doc(db, 'products', p.id), { supplier: '' }); p.supplier = ''; pas.push([p.sku || p.id, '']) }); await b.commit() }
    await sinkronSupplierKeAnalitik(pas, { [s.nama]: null }); toast('Supplier dihapus'); loadSupplier() } catch (e) { toast('Gagal: ' + e.message, 'error') } }
window.lihatBarangSupplier = n => { document.getElementById('stok-search').value = ''; document.getElementById('stok-kat').value = ''; document.getElementById('stok-kondisi').value = ''; window._filterSupplier = n; document.querySelector('.nav-item[data-page="stok"]').click() }
// Usulan supplier per barang dari riwayat nota (kemiripan kata nama barang)
const kata = t => new Set(String(t || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1))
const mirip = (a, b) => { let s = 0; a.forEach(w => { if (b.has(w)) s++ }); return s / Math.max(1, Math.max(a.size, b.size)) }
window.usulSupplierDariNota = async () => {
  const box = document.getElementById('sup-usul'); box.innerHTML = 'Mencocokkan…'
  await muatSupplier()
  const notas = (await getDocs(collection(db, 'nota'))).docs.map(d => d.data()).sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))
  const item = []; notas.filter(n => (n.jenis || 'nota') === 'nota').forEach(n => (n.items || []).forEach(it => { if (it.nama_barang && n.supplier) item.push({ k: kata(it.nama_barang), nama: it.nama_barang, sup: String(n.supplier).trim().toUpperCase(), tgl: n.tanggal || '' }) }))
  if (!item.length) { box.innerHTML = '<p style="color:#999">Belum ada nota dengan nama supplier.</p>'; return }
  const idx = {}; item.forEach((it, i) => it.k.forEach(w => (idx[w] = idx[w] || []).push(i)))
  const produk = (await produkSemua()).filter(p => !p.supplier)
  const u = window._usulan = []
  produk.forEach(p => { const kp = kata((p.name || '') + ' ' + (p.variant_names && p.variant_names !== 'nan' ? p.variant_names : '')); const cand = new Set(); kp.forEach(w => (idx[w] || []).forEach(i => cand.add(i)))
    let best = null, bs = 0; cand.forEach(i => { const sc = mirip(kp, item[i].k); if (sc > bs) { bs = sc; best = item[i] } })
    if (best && bs >= 0.6) u.push({ id: p.id, sku: p.sku || p.id, nama: p.name, sup: best.sup, nota: best.nama, tgl: best.tgl, skor: bs }) })
  u.sort((a, b) => b.skor - a.skor)
  box.innerHTML = u.length ? `<p style="font-size:13px;margin-bottom:8px"><b>${u.length}</b> usulan${u.length > 500 ? ' (500 teratas ditampilkan)' : ''} · yang kemiripannya ≥ 80% sudah dicentang.</p>
    <div class="table-wrap" style="max-height:60vh;overflow:auto"><table><thead><tr><th><input type="checkbox" onchange="document.querySelectorAll('.usul-cb').forEach(c=>c.checked=this.checked)"></th><th>SKU</th><th>Produk</th><th>Supplier usulan</th><th>Nama di nota</th><th>Mirip</th></tr></thead><tbody>
    ${u.slice(0, 500).map((x, i) => `<tr><td><input type="checkbox" class="usul-cb" data-i="${i}" ${x.skor >= 0.8 ? 'checked' : ''}></td><td>${esc(x.sku)}</td><td>${esc(x.nama)}</td><td><b>${esc(x.sup)}</b></td><td style="font-size:12px;color:#666">${esc(x.nota)}${x.tgl ? ' · ' + esc(x.tgl) : ''}</td><td>${Math.round(x.skor * 100)}%</td></tr>`).join('')}</tbody></table></div>
    <button class="btn btn-success" style="margin-top:10px" onclick="simpanUsulanSupplier()">💾 Simpan yang dicentang</button>` : '<p style="color:#999">Tidak ada nama barang di nota yang cukup mirip dengan produk yang belum punya supplier.</p>'
}
window.simpanUsulanSupplier = async () => {
  const pilih = [...document.querySelectorAll('.usul-cb:checked')].map(c => window._usulan[+c.dataset.i]); if (!pilih.length) return toast('Belum ada yang dicentang', 'error')
  try {
    const supBaru = [...new Set(pilih.map(x => x.sup))].filter(n => !supplierList.some(s => s.nama === n))
    for (const n of supBaru) await setDoc(doc(db, 'supplier', idSup(n)), { nama: n, lama: 0, wa: '', catatan: 'dibuat dari nota', updated_at: serverTimestamp() })
    for (let i = 0; i < pilih.length; i += 400) { const b = writeBatch(db); pilih.slice(i, i + 400).forEach(x => { b.update(doc(db, 'products', x.id), { supplier: x.sup }); const p = stokAllData.find(q => q.id === x.id); if (p) p.supplier = x.sup }); await b.commit() }
    await sinkronSupplierKeAnalitik(pilih.map(x => [x.sku, x.sup]), Object.fromEntries(supBaru.map(n => [n, { lama: 0, wa: '' }])))
    toast(`✅ Supplier diisi untuk ${pilih.length} barang${supBaru.length ? ` · ${supBaru.length} supplier baru — isi lama kirimnya` : ''}`); document.getElementById('sup-usul').innerHTML = ''; loadSupplier()
  } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.setSupplierMassal = async () => {
  const rows = window._stokTampil || []; if (!rows.length) return toast('Tampilkan dulu produknya (cari / filter)', 'error')
  await muatSupplier()
  const n = (prompt(`Supplier untuk ${rows.length} produk yang tampil:\n(${supplierList.map(s => s.nama).join(', ') || 'belum ada supplier — tambahkan di menu Supplier'})`) || '').trim().toUpperCase(); if (!n) return
  const ada = supplierList.find(s => s.nama === n)
  if (!ada && !confirm(`Supplier "${n}" belum terdaftar. Tambahkan sebagai supplier baru?`)) return
  try {
    if (!ada) { await setDoc(doc(db, 'supplier', idSup(n)), { nama: n, lama: 0, wa: '', catatan: '', updated_at: serverTimestamp() }); await muatSupplier(true) }
    for (let i = 0; i < rows.length; i += 400) { const b = writeBatch(db); rows.slice(i, i + 400).forEach(p => { b.update(doc(db, 'products', p.id), { supplier: n }); p.supplier = n }); await b.commit() }
    await sinkronSupplierKeAnalitik(rows.map(p => [p.sku || p.id, n]), { [n]: { lama: +(ada?.lama) || 0, wa: ada?.wa || '' } })
    toast(`✅ ${rows.length} produk → ${n}`); searchStok()
  } catch (e) { toast('Gagal: ' + e.message, 'error') }
}

// ── BANDING HARGA: harga per supplier dari nota + konfirmasi nama barang nota ↔ produk ──
// cocok_nota/{kunci} = { nama, sku, status: 'cocok'|'otomatis'|'abaikan', oleh, at }  — keputusan disimpan, tidak ditanya lagi
const kunciNota = t => String(t || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const idKunci = k => k.replace(/[\/.#$\[\]]/g, '_').slice(0, 500) || '_'
const namaProduk = p => (p.name || '') + (p.variant_names && p.variant_names !== 'nan' ? ' ' + p.variant_names : '')
let _bh = null   // { produk, cocok, harga: {SKU: {SUP: {harga, tanggal, nama, riwayat:[]}}}, antre: [] }
function kandidatProduk(nama, produk, idxKata) {
  const k = kata(nama), cand = new Set(); k.forEach(w => (idxKata[w] || []).forEach(i => cand.add(i)))
  return [...cand].map(i => ({ p: produk[i], skor: mirip(k, kata(namaProduk(produk[i]))) })).sort((a, b) => b.skor - a.skor).slice(0, 3)
}
async function hitungBandingHarga() {
  const [produk, cocokSnap, notaSnap, kualSnap] = await Promise.all([produkSemua(), getDocs(collection(db, 'cocok_nota')), getDocs(collection(db, 'nota')), getDocs(collection(db, 'kualitas')).catch(() => ({ docs: [] }))])
  const kual = {}; kualSnap.docs.forEach(d => { const k = d.data(); if (k.sku && k.supplier) kual[String(k.sku).toUpperCase() + '|' + k.supplier] = k })
  const cocok = {}; cocokSnap.docs.forEach(d => { cocok[d.id] = d.data() })
  const idxKata = {}; produk.forEach((p, i) => kata(namaProduk(p)).forEach(w => (idxKata[w] = idxKata[w] || []).push(i)))
  const bySku = {}; produk.forEach(p => { bySku[String(p.sku || p.id).toUpperCase()] = p })
  const harga = {}, antre = {}, otomatis = []
  const catat = (sku, sup, it, n) => { const K = String(sku).toUpperCase(); const h = (harga[K] = harga[K] || {}); const e = h[sup] = h[sup] || { riwayat: [] }
    const jenis = n.jenis || 'nota'; if (jenis === 'nota') e.pernahBeli = true
    e.riwayat.push({ tanggal: n.tanggal || '', harga: +it.harga_satuan || 0, qty: +it.qty || 0, nama: it.nama_barang, jenis })
    if (!e.tanggal || String(n.tanggal || '') >= e.tanggal) Object.assign(e, { harga: +it.harga_satuan || 0, tanggal: n.tanggal || '', nama: it.nama_barang, jenis }) }
  notaSnap.docs.forEach(d => { const n = d.data(), sup = String(n.supplier || '').trim().toUpperCase(); if (!sup) return
    ;(n.items || []).forEach(it => { if (!it.nama_barang || !(+it.harga_satuan > 0)) return
      if (it.sku && bySku[String(it.sku).toUpperCase()]) return catat(it.sku, sup, it, n)
      const kk = idKunci(kunciNota(it.nama_barang)), c = cocok[kk]
      if (c) { if (c.sku && c.status !== 'abaikan') catat(c.sku, sup, it, n); return }
      const kand = kandidatProduk(it.nama_barang, produk, idxKata)
      // Cocok otomatis hanya kalau sangat mirip & jelas beda dari kandidat kedua
      if (kand[0] && kand[0].skor >= 0.85 && (!kand[1] || kand[1].skor <= kand[0].skor - 0.15)) { catat(kand[0].p.sku || kand[0].p.id, sup, it, n); if (!cocok[kk]) { cocok[kk] = { sku: kand[0].p.sku || kand[0].p.id, status: 'otomatis' }; otomatis.push([kk, it.nama_barang, cocok[kk].sku]) } return }
      const a = antre[kk] = antre[kk] || { kunci: kk, nama: it.nama_barang, kand, sup: new Set(), n: 0, harga: 0, tanggal: '' }
      a.sup.add(sup); a.n++; if (String(n.tanggal || '') >= a.tanggal) { a.harga = +it.harga_satuan || 0; a.tanggal = n.tanggal || '' } }) })
  Object.values(harga).forEach(h => Object.values(h).forEach(e => e.riwayat.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))))
  // Simpan pencocokan otomatis supaya hasilnya tetap (dan bisa dikoreksi)
  for (let i = 0; i < otomatis.length; i += 400) { const b = writeBatch(db); otomatis.slice(i, i + 400).forEach(([kk, nama, sku]) => b.set(doc(db, 'cocok_nota', kk), { nama, sku, status: 'otomatis', at: serverTimestamp() })); await b.commit() }
  _bh = { produk, bySku, cocok, harga, idxKata, kual, antre: Object.values(antre).sort((a, b) => b.n - a.n) }
  kirimHargaKeAnalitik()
  return _bh
}
async function kirimHargaKeAnalitik() {   // ringkas: {SKU: {SUP: [harga, tanggal]}} untuk Daftar Belanja
  const d = hiDb(); if (!d || !_bh) return
  const h = {}; Object.entries(_bh.harga).forEach(([K, s]) => { h[K] = {}; Object.entries(s).forEach(([sup, e]) => h[K][sup] = [e.harga, e.tanggal, _bh.kual[K + '|' + sup]?.nilai || 0, e.jenis || 'nota']) })
  try { await d.collection('settings').doc('modal_produk').update({ h }) } catch (e) { if (e.code === 'not-found') { await bangunModalAnalitik(true); try { await d.collection('settings').doc('modal_produk').update({ h }) } catch (e2) {} } }
}
async function loadBanding() {
  document.getElementById('bh-antre').innerHTML = document.getElementById('bh-tabel').innerHTML = '<div class="loading"><div class="spinner"></div><span>Mencocokkan nota…</span></div>'
  await muatSupplier(); await hitungBandingHarga(); renderAntre(); renderBanding()
  const dl = document.getElementById('dl-produk'); if (dl && !dl.options.length) dl.innerHTML = _bh.produk.map(p => `<option value="${esc(namaProduk(p))} · ${esc(p.sku || p.id)}">`).join('')
}
const rpS = n => 'Rp ' + Math.round(+n || 0).toLocaleString('id-ID')
function renderAntre() {
  const box = document.getElementById('bh-antre'), a = _bh.antre
  document.getElementById('bh-antre-n').textContent = a.length ? `(${a.length})` : ''
  if (!a.length) { box.innerHTML = '<p style="color:#166534;font-size:13px">✅ Semua nama barang di nota sudah dicocokkan.</p>'; return }
  box.innerHTML = `<p style="font-size:13px;color:#666;margin-bottom:10px">Nama barang di nota ini <b>mirip</b> dengan beberapa produk — pilih yang benar. Jawaban disimpan, nama yang sama tidak ditanya lagi.</p>`
    + a.slice(0, 15).map((x, i) => `<div class="bh-kartu" id="bh-a-${i}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b style="font-size:14px">"${esc(x.nama)}"</b><div style="font-size:12px;color:#666">${[...x.sup].map(esc).join(', ')} · ${rpS(x.harga)} · ${esc(x.tanggal)} · muncul ${x.n}× di nota</div></div></div>
      <div style="font-size:12px;font-weight:700;margin:8px 0 4px">Ini produk yang mana?</div>
      ${x.kand.map(k => `<button class="bh-pilih" onclick="jawabCocok(${i},'${jsStr(k.p.sku || k.p.id)}')"><b>${esc(namaProduk(k.p))}</b><span>${esc(k.p.sku || k.p.id)} · mirip ${Math.round(k.skor * 100)}%${modalP(k.p) ? ' · modal ' + rpS(modalP(k.p)) : ''}</span></button>`).join('')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><input list="dl-produk" id="bh-cari-${i}" placeholder="🔍 Bukan itu — cari produk lain…" style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid #e5e5e5;border-radius:8px;font-size:13px">
        <button class="btn btn-primary btn-sm" onclick="jawabCocokCari(${i})">Pakai</button>
        <button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="jawabCocok(${i},'')">Bukan barang stok / abaikan</button></div></div>`).join('')
    + (a.length > 15 ? `<p style="font-size:12px;color:#666">… ${a.length - 15} lagi muncul setelah yang di atas dijawab.</p>` : '')
}
window.jawabCocok = async (i, sku) => {
  const x = _bh.antre[i]; if (!x) return
  try { await setDoc(doc(db, 'cocok_nota', x.kunci), { nama: x.nama, sku: sku || null, status: sku ? 'cocok' : 'abaikan', oleh: window._harmoniUserName || '', at: serverTimestamp() })
    document.getElementById('bh-a-' + i).style.opacity = .4; toast(sku ? `✅ "${x.nama}" = ${sku}` : 'Diabaikan')
    clearTimeout(window._bhT); window._bhT = setTimeout(async () => { await hitungBandingHarga(); renderAntre(); renderBanding() }, 900)
  } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.jawabCocokCari = i => { const v = document.getElementById('bh-cari-' + i).value, m = v.match(/ · ([^·]+)$/)
  const sku = m ? m[1].trim() : ''; if (!sku || !_bh.bySku[sku.toUpperCase()]) return toast('Pilih produk dari daftar yang muncul saat mengetik', 'error'); jawabCocok(i, sku) }
function renderBanding() {
  const q = (document.getElementById('bh-cari')?.value || '').trim().toUpperCase(), semua = document.getElementById('bh-semua')?.checked
  let rows = Object.entries(_bh.harga).map(([K, s]) => ({ K, p: _bh.bySku[K], s: Object.entries(s).sort((a, b) => a[1].harga - b[1].harga) })).filter(r => r.p)
  if (!semua) rows = rows.filter(r => r.s.length >= 2)
  if (q) rows = rows.filter(r => (namaProduk(r.p) + ' ' + r.K).toUpperCase().includes(q))
  // Paling besar potensi hematnya di atas (utama bukan yang termurah × laku)
  // Rekomendasi = termurah di antara supplier yang kualitasnya tidak rendah (⭐1–2 tidak diusulkan)
  const nilai = (K, n) => +(_bh.kual[K + '|' + n]?.nilai) || 0
  const terbaik = r => r.s.find(([n]) => !(nilai(r.K, n) > 0 && nilai(r.K, n) <= 2))
  const hemat = r => { const u = r.s.find(([n]) => n === r.p.supplier), b = terbaik(r); return u && b && b[0] !== u[0] && b[1].harga < u[1].harga ? u[1].harga - b[1].harga : 0 }
  rows.sort((a, b) => hemat(b) * Math.max(1, lakuSku(b.p)) - hemat(a) * Math.max(1, lakuSku(a.p)) || b.s.length - a.s.length)
  const lamaSup = n => +(supplierList?.find(x => x.nama === n)?.lama) || 0
  document.getElementById('bh-tabel').innerHTML = rows.length ? `<div style="font-size:12px;color:#666;margin-bottom:8px">${rows.length} barang · harga = harga beli terakhir di nota tiap supplier</div>` + rows.slice(0, 200).map(r => {
    const min = r.s[0][1].harga, h = hemat(r), best = terbaik(r)
    return `<div class="bh-kartu"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(namaProduk(r.p))}</b> <span style="font-size:12px;color:#666">${esc(r.K)}${lakuSku(r.p) ? ' · laku ' + lakuSku(r.p) + '/bln' : ''}</span></div>
      ${h > 0 ? `<span style="font-size:12px;font-weight:700;color:#166534;background:#dcfce7;border-radius:999px;padding:2px 10px">pindah ke ${esc(best[0])} hemat ${rpS(h)}/pcs${lakuSku(r.p) ? ' ≈ ' + rpS(h * lakuSku(r.p)) + '/bln' : ''}</span>` : ''}</div>
      <table style="margin-top:6px"><tbody>${r.s.map(([n, e]) => `<tr><td style="width:40%">${n === r.p.supplier ? '⭐ ' : ''}<b>${esc(n)}</b>${n === r.p.supplier ? ' <span style="font-size:11px;color:#666">(utama)</span>' : ''}</td>
        <td class="number" style="font-weight:700;color:${e.harga === min ? '#166534' : '#b91c1c'}">${rpS(e.harga)}${e.harga === min && r.s.length > 1 ? ' ✓ termurah' : ` <span style="font-size:11px;font-weight:400">(+${rpS(e.harga - min)})</span>`}${r.s.length > 1 && best && best[0] === n ? '<div style="font-size:11px;color:#166534">🏆 rekomendasi (harga + kualitas)</div>' : ''}</td>
        <td>${bintang(r.K, n)}</td>
        <td style="font-size:12px;color:#666"><span class="badge-jenis" style="background:${JENIS_NOTA[e.jenis][1]};color:${JENIS_NOTA[e.jenis][2]}">${JENIS_NOTA[e.jenis][0]}</span>${e.pernahBeli ? '' : ' <span class="badge-jenis" style="background:#fae8ff;color:#86198f">calon</span>'} ${esc(e.tanggal)}${lamaSup(n) ? ' · kirim ' + lamaSup(n) + ' hr' : ''}<br><span style="font-size:11px">"${esc(e.nama)}"</span></td>
        <td>${n !== r.p.supplier ? `<button class="btn btn-secondary btn-sm" onclick="jadikanUtama('${jsStr(r.p.id)}','${jsStr(n)}')">⭐ Jadikan utama</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` }).join('')
    : `<p style="color:#999;font-size:13px">${semua ? 'Belum ada harga dari nota / penawaran.' : 'Belum ada barang yang dibeli dari 2 supplier atau lebih. Centang "tampilkan juga 1 supplier" untuk melihat semua.'}</p>`
}
window.renderBanding = renderBanding
// Kualitas per barang per supplier: ⭐1–5 + catatan (bahan tipis, jahitan, warna luntur, dsb.)
function bintang(K, n) {
  const k = _bh.kual[K + '|' + n] || {}, v = +k.nilai || 0, a = jsStr(K), b = jsStr(n)
  return `<div style="white-space:nowrap">${[1, 2, 3, 4, 5].map(i => `<span class="bintang${i <= v ? ' on' : ''}" title="Kualitas ${i}" onclick="beriNilai('${a}','${b}',${i})">★</span>`).join('')}
    <a href="#" onclick="catatanKualitas('${a}','${b}');return false" style="font-size:11px;margin-left:4px">${k.catatan ? '📝' : '+ catatan'}</a></div>
    ${v && v <= 2 ? '<div style="font-size:11px;color:#b91c1c;font-weight:700">⚠️ kualitas rendah</div>' : ''}${k.catatan ? `<div style="font-size:11px;color:#666;max-width:180px;white-space:normal">${esc(k.catatan)}</div>` : ''}`
}
async function simpanKualitas(K, n, ubah) {
  const id = (K + '__' + idSup(n)).replace(/[\/]/g, '_'), lama = _bh.kual[K + '|' + n] || {}, baru = { sku: K, supplier: n, nilai: lama.nilai || 0, catatan: lama.catatan || '', ...ubah, oleh: window._harmoniUserName || '', at: serverTimestamp() }
  try { await setDoc(doc(db, 'kualitas', id), baru); _bh.kual[K + '|' + n] = baru; renderBanding(); kirimHargaKeAnalitik() } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.beriNilai = (K, n, v) => { const lama = +(_bh.kual[K + '|' + n]?.nilai) || 0; simpanKualitas(K, n, { nilai: lama === v ? 0 : v }) }
window.catatanKualitas = (K, n) => { const lama = _bh.kual[K + '|' + n]?.catatan || ''; const c = prompt(`Catatan kualitas ${n} untuk ${K}:\n(cth: bahan tipis, jahitan rapi, warna luntur, ukuran kecil)`, lama); if (c === null) return; simpanKualitas(K, n, { catatan: c.trim() }) }
window.jadikanUtama = async (id, n) => {
  const p = _bh.produk.find(x => x.id === id); if (!p) return
  try { await muatSupplier(); if (!supplierList.some(s => s.nama === n)) { await setDoc(doc(db, 'supplier', idSup(n)), { nama: n, lama: 0, wa: '', catatan: 'dibuat dari nota', updated_at: serverTimestamp() }); await muatSupplier(true) }
    await updateDoc(doc(db, 'products', id), { supplier: n, updated_at: serverTimestamp() }); p.supplier = n
    const si = supplierList.find(s => s.nama === n); sinkronSupplierKeAnalitik([[p.sku || id, n]], { [n]: { lama: +si?.lama || 0, wa: si?.wa || '' } })
    toast(`⭐ ${n} jadi supplier utama ${p.sku || id}`); renderBanding() } catch (e) { toast('Gagal: ' + e.message, 'error') }
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
  if (document.getElementById('stok-kondisi')?.value || document.getElementById('stok-search').value || window._filterSupplier) searchStok();
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
  belum_supplier: p => !p.supplier && (totalStok(p) > 0 || lakuSku(p) > 0),
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

  muatSupplier();
  if (!cari && !kat && !kondisi && !window._filterSupplier) {
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
  if (window._filterSupplier) rows = rows.filter(p => p.supplier === window._filterSupplier);
  window._stokTampil = rows;
  if (URUT[kondisi]) rows = rows.slice().sort(URUT[kondisi]);

  document.getElementById('stok-count').innerHTML          = (window._filterSupplier ? `🏭 <b>${esc(window._filterSupplier)}</b> <a href="#" onclick="window._filterSupplier=null;searchStok();return false">✕</a> · ` : '') + (rows.length > 0 ? `${rows.length.toLocaleString('id-ID')} produk ditemukan` : 'Tidak ditemukan') + (lakuInfo && kondisi ? ' · ' + lakuInfo : '');
  document.getElementById('stok-empty').style.display      = 'none';
  document.getElementById('stok-table-wrap').style.display = rows.length > 0 ? 'block' : 'none';

  const variantText = p => {
    const l = p.variant_label || '', v = p.variant_names && p.variant_names !== 'nan' ? p.variant_names : '';
    return l && v ? `${l} — ${v}` : l || v || '-';
  };

  document.getElementById('stok-table-body').innerHTML = rows.slice(0, 100).map(p => `
    <tr id="stok-row-${p.id}">
      <td><strong>${p.sku}</strong></td>
      <td>${p.name}<div style="margin-top:4px"><input list="dl-sup" id="sp-${p.id}" value="${esc(p.supplier || '')}" placeholder="🏭 supplier…" style="width:100%;max-width:200px;padding:4px 8px;border:1px solid #e5e5e5;border-radius:6px;font-size:12px"></div></td>
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
    const spEl = document.getElementById(`sp-${id}`), spBaru = spEl ? spEl.value.trim().toUpperCase() : undefined
    const pLama = stokAllData.find(p => p.id === id)
    if (spEl && spBaru !== (pLama?.supplier || '')) update.supplier = spBaru
    if (!isNaN(sg)) update.stock_qty_gudang = sg;
    if (!isNaN(st)) update.stock_qty_toko   = st;

    await updateDoc(doc(db, 'products', id), update);

    // Update cache lokal
    const idx = stokAllData.findIndex(p => p.id === id);
    if (idx >= 0) {
      if (!isNaN(sg)) stokAllData[idx].stock_qty_gudang = sg;
      if (!isNaN(st)) stokAllData[idx].stock_qty_toko   = st;
    }

    if ('supplier' in update) {
      if (stokAllData[idx]) stokAllData[idx].supplier = update.supplier
      if (update.supplier && !supplierList?.some(s => s.nama === update.supplier)) { await setDoc(doc(db, 'supplier', idSup(update.supplier)), { nama: update.supplier, lama: 0, wa: '', catatan: '', updated_at: serverTimestamp() }); await muatSupplier(true); toast('Supplier baru ' + update.supplier + ' — isi lama kirimnya di menu Supplier') }
      const si = supplierList?.find(s => s.nama === update.supplier)
      sinkronSupplierKeAnalitik([[pLama?.sku || id, update.supplier]], update.supplier ? { [update.supplier]: { lama: +(si?.lama) || 0, wa: si?.wa || '' } } : null)
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
