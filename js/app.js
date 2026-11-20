import { db } from './firebase-config.js';
import {
  collection, getDocs, getDoc, addDoc, doc, updateDoc,
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
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
  if (id === 'belanja')       loadBelanja();
  if (id === 'opname')        loadOpname();
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
    + kartu('modal_naik', '📈', 'Modal berubah', num(naik.length) + ' barang', `${naik.filter(p => +p.modal_baru_olsera > modalP(p)).length} naik · ${naik.filter(p => +p.modal_baru_olsera < modalP(p)).length} turun di Olsera — cek & putuskan`, '#fff7ed', '#9a3412')
    + kartu('margin', '⚠️', 'Margin tipis / rugi', num(margin.length) + ' barang', 'harga jual < modal + 15%', '#fefce8', '#854d0e')
  getDocs(collection(db, 'opname')).then(sn => { const tunggu = sn.docs.filter(d => d.data().status === 'menunggu').length, batas = tambahHari(hariIni(), -30)
    const lama = products.filter(p => ['toko', 'gudang'].some(l => diLokasi(p, l) && (!p['opname_' + l] || p['opname_' + l] < batas))).length
    box.insertAdjacentHTML('beforeend', `<button class="ringkas-kartu" style="background:${tunggu ? '#eff6ff' : '#f8fafc'};color:${tunggu ? '#1e40af' : '#334155'}" onclick="document.querySelector('.nav-item[data-page=opname]').click()"><div class="rk-ikon">🧮 Opname</div><div class="rk-val" style="font-size:16px">${tunggu ? tunggu + ' menunggu' : num(lama) + ' barang'}</div><div class="rk-sub">${tunggu ? 'perlu persetujuan · ' : ''}${num(lama)} barang belum dihitung &gt;30 hari</div></button>`) }).catch(() => {})
  muatMusim(true).then(ms => ms.map(m => ({ m, st: statusMusim(m) })).filter(x => x.st.aktif).forEach(({ m, st }) => box.insertAdjacentHTML('afterbegin', `<button class="ringkas-kartu" style="background:#fffbeb;color:#92400e;border-color:#fcd34d" onclick="keBelanja()"><div class="rk-ikon">📅 ${esc(m.nama)}</div><div class="rk-val" style="font-size:15px">${st.tahap === 'jalan' ? 'Sedang musim' : st.hari >= 14 ? Math.round(st.hari / 7) + ' minggu lagi' : st.hari + ' hari lagi'}</div><div class="rk-sub">${tglPendek(st.s)} – ${tglPendek(st.e)} · siapkan stok (laku ×${m.faktor})</div></button>`))).catch(() => {})
  getDocs(collection(db, 'po')).then(sn => { const now = hariIni(), a = sn.docs.map(d => d.data()).filter(p => p.status === 'dipesan'); if (!a.length) return
    const tl = a.filter(p => p.perkiraan_datang && p.perkiraan_datang < now).length
    box.insertAdjacentHTML('beforeend', `<button class="ringkas-kartu" style="background:${tl ? '#fef2f2' : '#ecfdf5'};color:${tl ? '#991b1b' : '#166534'}" onclick="keBelanja()"><div class="rk-ikon">📦 PO berjalan</div><div class="rk-val">${num(a.length)} PO</div><div class="rk-sub">${tl ? tl + ' terlambat datang' : 'menunggu barang datang'}</div></button>`) }).catch(() => {})
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
    toast(`✅ ${items.length} item dari ${supplier} disimpan (${JENIS_NOTA[jenis][0]})`); _bh = null;

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

    const riw = []
    for (const id of dirtyHpp) {
      const val = parseFloat(document.getElementById(`hpp-input-${id}`)?.value || 0);
      if (val > 0) {
        const field = hppLokasi === 'gudang' ? 'buy_price_gudang' : 'buy_price_toko';
        const pp = hppData.find(x => x.id === id) || stokAllData.find(x => x.id === id); riw.push({ sku: pp?.sku || id, nama: pp ? namaProduk(pp) : '', lokasi: hppLokasi, lama: +pp?.[field] || 0, baru: val, sumber: 'Isi HPP (manual)', status: pp?.[field] > 0 ? 'diubah' : 'diisi' })
        batch.update(doc(db, 'products', id), { [field]: val, updated_at: serverTimestamp() });
        saved++;
      }
    }
    await batch.commit();
    catatModal(riw)
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

function loadSinkron() {   // tampilkan kapan stok terakhir tersambung (dari Analitik / Stok Manager)
  muatStokFisik().then(f => { const el = document.getElementById('sinkron-terakhir'); if (!el || !f) return
    const tgl = t => t?.toDate ? t.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'belum pernah'
    el.innerHTML = `<br>Terakhir masuk — Toko: <b>${tgl(f.toko_updated_at)}</b>${f.toko_updated_by ? ' (' + esc(f.toko_updated_by) + ')' : ''} · Gudang: <b>${tgl(f.gudang_updated_at)}</b>${f.gudang_updated_by ? ' (' + esc(f.gudang_updated_by) + ')' : ''}` })
}

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
    const lamaMap = {}; (await getDocs(collection(db, 'products'))).docs.forEach(d => { lamaMap[d.id] = d.data() }); const riwModal = []

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
        // Modal dari Olsera: mengisi yang kosong; kalau berbeda dengan modal sekarang (naik/turun berapa pun) → ditandai & dicatat, Owner yang memutuskan
        const hb = parseFloat(r.buy_price) || 0, lp = lamaMap[sku], lm = +lp?.[priceField] || 0
        if (hb > 0 && !(lm > 0)) { data[priceField] = hb; if (lp) riwModal.push({ sku, nama: data.name, lokasi, lama: 0, baru: hb, sumber: 'Olsera (upload Stok Manager)', status: 'diisi' }) }
        else if (hb > 0 && hb !== lm) { if (lp.modal_baru_olsera !== hb) { Object.assign(data, { modal_baru_olsera: hb, modal_baru_lama: lm, modal_baru_lokasi: lokasi, modal_naik_at: serverTimestamp() }); riwModal.push({ sku, nama: data.name, lokasi, lama: lm, baru: hb, sumber: 'Olsera (upload Stok Manager)', status: 'terdeteksi' }) } }
        else if (hb > 0 && lp?.modal_baru_olsera) data.modal_baru_olsera = null

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

    if (riwModal.length) { await catatModal(riwModal); const n = riwModal.filter(x => x.status === 'terdeteksi').length; if (n) addLog(`<span style="color:#9a3412">🔔 ${n} barang modalnya berubah di Olsera — cek di Dashboard → Modal berubah</span>`) }
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
let lakuPerSku = null, laku6PerSku = {}, lakuInfo = '', _riwayat = { bulan: [], q: {} };
const NO_BLN = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, Mei: 5, Jun: 6, Jul: 7, Agt: 8, Agu: 8, Ags: 8, Aug: 8, Sep: 9, Okt: 10, Oct: 10, Nov: 11, Des: 12, Dec: 12 }
const parseBulan = t => { const m = String(t).match(/^([A-Za-z]+)[-\s]?(\d{2,4})$/); return m ? [(+m[2] < 100 ? 2000 + +m[2] : +m[2]), NO_BLN[m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase()] || 0] : [0, 0] }
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
    _riwayat = { bulan: (r.bulan || []).map(parseBulan), q: Object.fromEntries((r.sku || []).map(x => [String(x.s).toUpperCase(), x.q || []])) }
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
      <td>${p.name} <a href="#" onclick="lihatRiwayatModal('${jsStr(p.sku || p.id)}');return false" title="Riwayat harga modal" style="font-size:11px;text-decoration:none">🕘</a>${+p.modal_baru_olsera > 0 ? ' <span class="badge-jenis" style="background:#fff7ed;color:#9a3412">modal berubah</span>' : ''}<div style="margin-top:4px"><input list="dl-sup" id="sp-${p.id}" value="${esc(p.supplier || '')}" placeholder="🏭 supplier…" style="width:100%;max-width:200px;padding:4px 8px;border:1px solid #e5e5e5;border-radius:6px;font-size:12px"></div></td>
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
  if (k === 'modal_naik') return kec(`modal ${rp(modalP(p))} → <b>${rp(p.modal_baru_olsera)}</b> ${labelUbah(modalP(p), +p.modal_baru_olsera)}${p.modal_naik_at?.toDate ? ' · ' + p.modal_naik_at.toDate().toLocaleDateString('id-ID') : ''}${hargaP(p) ? ` · jual ${rp(hargaP(p))} (margin baru ${Math.round((hargaP(p) - p.modal_baru_olsera) / hargaP(p) * 100)}%)` : ''}`) + `<button class="btn btn-sm" style="margin-top:4px;font-size:11px;padding:3px 8px" onclick="pakaiModalBaru('${p.id}')">Pakai modal baru</button> <button class="btn btn-sm" style="margin-top:4px;font-size:11px;padding:3px 8px;background:#eee;color:#333" onclick="abaikanModalBaru('${p.id}')">Abaikan</button>`
  return ''
}
window.pakaiModalBaru = async (id) => {
  const p = stokAllData.find(x => x.id === id); if (!p) return
  const baru = +p.modal_baru_olsera, upd = { updated_at: serverTimestamp(), modal_baru_olsera: null }
  if (p.lokasi?.includes('toko') || +p.buy_price_toko > 0) upd.buy_price_toko = baru
  if (p.lokasi?.includes('gudang') || +p.buy_price_gudang > 0) upd.buy_price_gudang = baru
  if (!upd.buy_price_toko && !upd.buy_price_gudang) upd.buy_price_toko = baru
  const lamaM = modalP(p)
  try { await updateDoc(doc(db, 'products', id), upd); Object.assign(p, upd, { modal_baru_olsera: null }); sinkronModalKeAnalitik([[p.sku || id, baru]]); catatModal([{ sku: p.sku || id, nama: namaProduk(p), lokasi: p.modal_baru_lokasi || '', lama: lamaM, baru, sumber: 'Pakai modal dari Olsera', status: 'dipakai' }]); toast('✅ Modal ' + (p.sku || id) + ' jadi ' + rp(baru)); searchStok() }
  catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.abaikanModalBaru = async (id) => {
  const p = stokAllData.find(x => x.id === id); if (!p) return
  const ab = +p.modal_baru_olsera
  try { await updateDoc(doc(db, 'products', id), { modal_baru_olsera: null, updated_at: serverTimestamp() }); p.modal_baru_olsera = null; catatModal([{ sku: p.sku || id, nama: namaProduk(p), lokasi: p.modal_baru_lokasi || '', lama: modalP(p), baru: ab, sumber: 'Modal Olsera diabaikan (modal tetap)', status: 'diabaikan' }]); toast('Diabaikan'); searchStok() }
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

// ── DAFTAR BELANJA (budget → PO per supplier → barang datang jadi nota) ─────
// po/{id} = { supplier, tanggal, lama, perkiraan_datang, status:'dipesan'|'datang'|'batal', items:[{sku, nama, nama_sup, qty, harga}], total, oleh,
//             datang_tanggal, nota_id, terima:[qty per item] }
let _bl = null, _po = []
const tglLokal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hariIni = () => tglLokal(new Date())
const tambahHari = (t, n) => { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + n); return tglLokal(d) }
const selisihHari = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
const waNo = w => String(w || '').replace(/\D/g, '').replace(/^0/, '62')
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch (e) { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
const budgetBl = () => +(document.getElementById('bl-budget').value.replace(/\D/g, '')) || 0
const keBelanja = () => document.querySelector('.nav-item[data-page="belanja"]').click()
window.keBelanja = keBelanja

async function loadBelanja() {
  const b = lsGet('bl_budget', ''); if (b && !document.getElementById('bl-budget').value) document.getElementById('bl-budget').value = (+b).toLocaleString('id-ID')
  const o = lsGet('bl_opsi', null); if (o && !_bl) { document.getElementById('bl-bulan').value = o.bulan || '1'; document.getElementById('bl-mode').value = o.mode || 'rek'; document.getElementById('bl-final').checked = o.final !== false; document.getElementById('bl-rata').value = o.rata || '3'; document.getElementById('bl-tren').checked = o.tren !== false; window._blKat = o.kat || '' }
  await Promise.all([loadPO(), muatMusim(), muatCustom()]); await hitungBelanja(); renderMusim(); renderCustomBahan()
}
window.formatBudget = el => { const v = el.value.replace(/\D/g, ''); el.value = v ? (+v).toLocaleString('id-ID') : ''; lsSet('bl_budget', v)
  clearTimeout(window._blT); window._blT = setTimeout(() => { if (_bl) aturBudget() }, 350) }
// Analisa laku per SKU dari riwayat penjualan (Analitik): rata-rata N bulan, 3 bulan terakhir vs 3 bulan sebelumnya (tren)
function analisaLaku(K, n) {
  const q = _riwayat.q[K]; if (!q || !q.length) return null
  const rt = m => { const a = q.slice(-m); return a.length ? a.reduce((t, v) => t + (+v || 0), 0) / a.length : 0 }
  const r3 = rt(3), sebelum = q.slice(-6, -3), p3 = sebelum.length ? sebelum.reduce((t, v) => t + (+v || 0), 0) / sebelum.length : 0
  const rata = rt(n), pct = p3 > 0 ? Math.round((r3 - p3) / p3 * 100) : (r3 > 0 ? 100 : 0)
  const arah = pct >= 20 ? 'naik' : pct <= -20 ? 'turun' : 'stabil'
  const pakai = arah === 'naik' ? Math.max(rata, r3) : arah === 'turun' ? Math.min(rata, r3) : rata
  return { r3: +r3.toFixed(1), r6: +rt(6).toFixed(1), r12: +rt(12).toFixed(1), rata: +rata.toFixed(1), pakai: +pakai.toFixed(1), pct, arah, t3: q.slice(-3).reduce((t, v) => t + (+v || 0), 0), t6: q.slice(-6).reduce((t, v) => t + (+v || 0), 0), t12: q.slice(-12).reduce((t, v) => t + (+v || 0), 0) }
}
async function muatFinalOrder() { const d = hiDb(); if (!d) return {}; try { return (await d.collection('settings').doc('final_order').get()).data()?.m || {} } catch (e) { return {} } }

window.hitungBelanja = async () => {
  const box = document.getElementById('bl-hasil'); box.innerHTML = '<div class="loading"><div class="spinner"></div><span>Menghitung kebutuhan, harga & supplier…</span></div>'
  const bulan = +document.getElementById('bl-bulan').value || 1, mode = document.getElementById('bl-mode').value, pakaiFinal = document.getElementById('bl-final').checked
  const rata = +document.getElementById('bl-rata').value || 3, tren = document.getElementById('bl-tren').checked, selKat = document.getElementById('bl-kat')
  const kat = window._blKat != null ? window._blKat : selKat.value; window._blKat = null
  lsSet('bl_opsi', { bulan: String(bulan), mode, final: pakaiFinal, rata: String(rata), tren, kat })
  try {
    const [, , , fo] = await Promise.all([muatSupplier(), muatLaku(), _bh ? null : hitungBandingHarga(), pakaiFinal ? muatFinalOrder() : {}, muatMusim(), muatCustom()])
    const bahanCu = kebutuhanCustom(rata)
    const lamaSup = n => +(supplierList.find(x => x.nama === n)?.lama) || 0
    const foU = {}; Object.entries(fo || {}).forEach(([k, v]) => { if (+v > 0) foU[k.toUpperCase()] = +v })
    // Barang yang sudah dipesan (PO belum datang) tidak diusulkan lagi
    const dipesan = {}; _po.filter(x => x.status === 'dipesan').forEach(x => (x.items || []).forEach(it => { const K = String(it.sku).toUpperCase(); dipesan[K] = (dipesan[K] || 0) + (+it.qty || 0) }))
    const optOmzet = document.querySelector('#bl-urut option[value="omzet"]'); if (optOmzet) { optOmzet.hidden = !isOwnerSM(); if (!isOwnerSM() && document.getElementById('bl-urut').value === 'omzet') document.getElementById('bl-urut').value = 'prio' }
    const kats = [...new Set(_bh.produk.map(p => p.category).filter(Boolean))].sort()
    selKat.innerHTML = '<option value="">Semua kategori</option>' + kats.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join(''); selKat.value = kats.includes(kat) ? kat : ''
    const items = []
    _bh.produk.forEach(p => {
      if (selKat.value && p.category !== selKat.value) return
      const K = String(p.sku || p.id).toUpperCase(), F = foU[K] || 0, an = analisaLaku(K, rata), C = bahanCu[K]?.laku || 0
      const L = +((an ? (tren ? an.pakai : an.rata) : lakuSku(p)) + C).toFixed(1)   // + bahan yang terpakai untuk barang custom
      if (!(L > 0) && !(F > 0) && !faktorMusim(p)) return
      const opsi = Object.entries(_bh.harga[K] || {}).map(([n, e]) => ({ n, harga: +e.harga || 0, nama: e.nama || '', jenis: e.jenis || 'nota', lama: lamaSup(n), kual: +(_bh.kual[K + '|' + n]?.nilai) || 0 }))
      if (p.supplier && !opsi.some(o => o.n === p.supplier)) opsi.push({ n: p.supplier, harga: modalP(p), nama: '', jenis: 'modal', lama: lamaSup(p.supplier), kual: +(_bh.kual[K + '|' + p.supplier]?.nilai) || 0 })
      opsi.sort((a, b) => (a.harga || 9e15) - (b.harga || 9e15))
      items.push({ K, p, L, F, an, C, Cr: bahanCu[K]?.rincian || [], stok: totalStok(p), dipesan: dipesan[K] || 0, opsi })
    })
    _bl = { items, bulan, mode, final: pakaiFinal, ubah: lsGet('bl_ubah', {}), adaFinal: Object.keys(foU).length }
    aturBudget()
  } catch (e) { console.error(e); box.innerHTML = `<p style="color:#b91c1c">Gagal menghitung: ${esc(e.message)}</p>` }
}
function pilihSupBl(it) {
  const u = _bl.ubah[it.K]?.sup; if (u) { const o = it.opsi.find(x => x.n === u); if (o) return o }
  const utama = it.opsi.find(o => o.n === it.p.supplier)
  const ok = it.opsi.filter(o => o.harga > 0 && !(o.kual > 0 && o.kual <= 2))   // kualitas ⭐1–2 tidak diusulkan
  if (_bl.mode === 'utama' && utama) return utama
  if (_bl.mode === 'cepat') { const c = ok.filter(o => o.lama > 0).sort((a, b) => a.lama - b.lama || a.harga - b.harga)[0]; if (c) return c }
  if (ok[0] && utama && ok.includes(utama) && utama.harga === ok[0].harga) return utama
  return ok[0] || utama || it.opsi[0] || null
}
function aturBudget() {
  const B = budgetBl()
  const rows = _bl.items.map(it => {
    const s = pilihSupBl(it), lama = s?.lama || 0, beli = (s?.harga > 0 ? s.harga : modalP(it.p)) || 0, jual = hargaP(it.p), ub = _bl.ubah[it.K] || {}
    const mu = faktorMusim(it.p), lb = mu ? lakuBiasa(it.K, mu.m) : null, Lm = mu ? Math.max(it.L, (lb ?? it.L) * mu.f) : it.L   // musim: laku bulan biasa × faktor sejak masa pengingat
    const target = Math.ceil(Lm * _bl.bulan + Lm / 30 * lama)
    const usul = Math.max(0, (it.F > 0 ? it.F : target - it.stok) - it.dipesan)
    const qty = ub.qty != null ? ub.qty : usul
    const kondisi = it.stok <= 0 ? 'kosong' : it.stok < it.L / 30 * Math.max(lama, 7) ? 'kritis' : 'isi'
    const untung = jual > 0 && beli > 0 ? jual - beli : 0
    const roi = beli > 0 && qty > 0 ? untung * Math.min(qty, Math.max(it.L, 1) * _bl.bulan) / (beli * qty) : 0   // untung per Rp modal
    const tier = untung <= 0 ? 0 : kondisi === 'kosong' ? 3 : kondisi === 'kritis' ? 2 : 1
    return { ...it, s, lama, beli, jual, untung, usul, qty, manual: ub.qty != null, keluar: !!ub.keluar, kondisi, roi, tier: tier + (mu && tier ? 0.5 : 0), mu, ambil: 0, status: '' }
  }).filter(r => r.qty > 0 || r.manual)
  const urut = rows.filter(r => !r.keluar && r.qty > 0).sort((a, b) => b.tier - a.tier || b.roi - a.roi || b.L - a.L)
  let sisa = B > 0 ? B : Infinity
  urut.forEach((r, i) => { r.rank = i + 1
    if (!(r.beli > 0)) { r.status = 'tanpa_harga'; return }
    const biaya = r.qty * r.beli
    if (biaya <= sisa) { r.ambil = r.qty; sisa -= biaya; r.status = 'masuk' }
    else if (!r.manual && Math.floor(sisa / r.beli) >= 1) { r.ambil = Math.floor(sisa / r.beli); sisa -= r.ambil * r.beli; r.status = 'sebagian' }
    else r.status = 'luar' })
  rows.filter(r => r.keluar).forEach(r => r.status = 'keluar')
  _bl.rows = rows
  renderBelanja(B, sisa)
}
function rowBelanja(r) {
  const K = jsStr(r.K)
  const tag = (r.rank ? `<span class="bl-tag" style="background:#f1f5f9;color:#334155">#${r.rank}</span>` : '')
    + (r.kondisi === 'kosong' ? '<span class="bl-tag" style="background:#fee2e2;color:#991b1b">kosong</span>' : r.kondisi === 'kritis' ? '<span class="bl-tag" style="background:#fef3c7;color:#92400e">habis sebelum kiriman datang</span>' : '')
    + (r.mu ? `<span class="bl-tag" style="background:#fef3c7;color:#92400e">📅 ${esc(r.mu.nama)} ×${r.mu.f}</span>` : '')
    + (r.F > 0 && _bl.final ? '<span class="bl-tag" style="background:#e0e7ff;color:#3730a3">Final Order</span>' : '')
    + (r.C > 0 ? `<span class="bl-tag" style="background:#ede9fe;color:#5b21b6" title="${esc(r.Cr.map(x => x.kata + ': ' + x.q + '/bln').join(' · '))}">🧵 bahan custom +${r.C}/bln</span>` : '')
    + (r.untung <= 0 && r.beli > 0 && r.jual > 0 ? '<span class="bl-tag" style="background:#fee2e2;color:#991b1b">tidak untung</span>' : '')
  const opsi = r.opsi.length ? r.opsi.map(o => `<option value="${esc(o.n)}"${o.n === r.s?.n ? ' selected' : ''}>${o.n === r.p.supplier ? '⭐ ' : ''}${esc(o.n)} · ${o.harga ? rpS(o.harga) : 'harga ?'}${o.lama ? ' · ' + o.lama + ' hr' : ''}${o.kual ? ' · ' + '★'.repeat(o.kual) : ''}${o.jenis === 'penawaran' ? ' · penawaran' : o.jenis === 'catatan' ? ' · catatan' : ''}</option>`).join('')
    : '<option value="">— belum ada supplier & harga —</option>'
  const q = r.status === 'masuk' || r.status === 'sebagian' ? r.ambil : r.qty
  return `<div class="bl-item${r.keluar ? ' keluar' : ''}">
    <input type="checkbox" ${r.keluar ? '' : 'checked'} title="Ikut dibeli" onchange="blKeluar('${K}', !this.checked)" style="width:18px;height:18px;margin-top:2px">
    <div style="min-width:0"><b>${esc(namaProduk(r.p))}</b>${tag}
      <div class="bl-sub">${esc(r.K)} · stok ${num(r.stok)} · laku ${r.L}/bln${r.an ? ` <span title="rata-rata 3 / 6 / 12 bulan">(${r.an.r3} / ${r.an.r6} / ${r.an.r12})</span>${r.an.arah === 'naik' ? ` <b style="color:#166534">↑${r.an.pct}%</b>` : r.an.arah === 'turun' ? ` <b style="color:#b91c1c">↓${Math.abs(r.an.pct)}%</b>` : ''} · terjual 3/6/12 bln <b>${num(r.an.t3)} / ${num(r.an.t6)} / ${num(r.an.t12)}</b> pcs${isOwnerSM() && r.jual ? ` · omzet 12 bln ≈ <b>${rpS(r.an.t12 * r.jual)}</b>` : ''}` : ''}${r.dipesan ? ' · sudah di-PO ' + num(r.dipesan) : ''}${r.jual ? ' · jual ' + rpS(r.jual) : ''}${r.untung > 0 ? ' · untung ' + rpS(r.untung) + '/pcs' : ''}</div></div>
    <div style="text-align:right;white-space:nowrap"><b>${rpS(q * r.beli)}</b></div>
    <div class="bl-atur"><select onchange="blSup('${K}', this.value)" ${r.opsi.length ? '' : 'disabled'}>${opsi}</select>
      <span style="white-space:nowrap">qty <input type="number" min="0" inputmode="numeric" value="${q}" onchange="blQty('${K}', this.value)"> × ${r.beli ? rpS(r.beli) : '<span style="color:#b91c1c">modal ?</span>'}</span>
      ${r.status === 'sebagian' ? `<span class="bl-sub" style="color:#92400e">butuh ${num(r.qty)}, dipotong budget</span>` : ''}${r.manual ? `<span class="bl-sub">diubah manual (usulan ${num(r.usul)})</span>` : ''}</div>
  </div>`
}
// Urutan tampil: prioritas belanja (default), paling laku, atau perkiraan omzet terbesar (qty 12 bln × harga jual)
window.aturBudget = () => { if (_bl) aturBudget() }
function urutBl(a, b) {
  const u = document.getElementById('bl-urut')?.value || 'prio', q = r => r.an?.t12 || 0
  if (u === 'qty') return q(b) - q(a) || (a.rank || 9e9) - (b.rank || 9e9)
  if (u === 'omzet') return q(b) * (b.jual || 0) - q(a) * (a.jual || 0) || (a.rank || 9e9) - (b.rank || 9e9)
  return (a.rank || 9e9) - (b.rank || 9e9)
}
function renderBelanja(B, sisa) {
  const rows = _bl.rows, ambil = rows.filter(r => r.status === 'masuk' || r.status === 'sebagian')
  const luar = rows.filter(r => r.status === 'luar'), tanpa = rows.filter(r => r.status === 'tanpa_harga'), keluar = rows.filter(r => r.status === 'keluar')
  const total = ambil.reduce((t, r) => t + r.ambil * r.beli, 0), untungBln = ambil.reduce((t, r) => t + Math.min(r.ambil, r.L * _bl.bulan) * r.untung, 0)
  const kurang = luar.reduce((t, r) => t + r.qty * r.beli, 0) + ambil.filter(r => r.status === 'sebagian').reduce((t, r) => t + (r.qty - r.ambil) * r.beli, 0)
  // Kelompokkan per supplier → 1 PO per supplier
  const g = {}; ambil.forEach(r => { const n = r.s?.n || ''; (g[n] = g[n] || { n, rows: [], total: 0 }).rows.push(r); g[n].total += r.ambil * r.beli })
  const skorBl = r => { const u = document.getElementById('bl-urut')?.value || 'prio', q = r.an?.t12 || 0; return u === 'qty' ? q : u === 'omzet' ? q * (r.jual || 0) : 0 }
  _bl.grup = Object.values(g).sort((a, b) => (!a.n) - (!b.n) || (Math.max(0, ...b.rows.map(skorBl)) - Math.max(0, ...a.rows.map(skorBl))) || b.total - a.total)
  const kartu = (ikon, judul, val, sub, bg, fg) => `<div class="ringkas-kartu" style="background:${bg};color:${fg};cursor:default"><div class="rk-ikon">${ikon} ${judul}</div><div class="rk-val">${val}</div><div class="rk-sub">${sub}</div></div>`
  document.getElementById('bl-ringkas').innerHTML = `<div class="ringkas-grid" style="margin-bottom:14px">
    ${kartu('🛒', 'Total belanja', rpS(total), `${num(ambil.length)} barang · ${num(_bl.grup.filter(x => x.n).length)} supplier`, '#ecfdf5', '#166534')}
    ${kartu('💵', 'Sisa budget', B > 0 ? rpS(sisa) : '—', B > 0 ? 'dari ' + rpS(B) : 'budget belum diisi (tanpa batas)', '#eff6ff', '#1e40af')}
    ${kartu('📈', 'Perkiraan untung', rpS(untungBln), `dari barang ini, ${_bl.bulan < 1 ? '2 minggu' : _bl.bulan + ' bulan'} ke depan`, '#fefce8', '#854d0e')}
    ${kartu('⏳', 'Belum kebeli', rpS(kurang), `${num(luar.length)} barang tidak masuk budget`, '#fef2f2', '#991b1b')}</div>
    ${(_musim || []).map(m => ({ m, st: statusMusim(m) })).filter(x => x.st.aktif).map(x => `<p style="font-size:12.5px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:8px 12px;margin:-4px 0 12px">📅 <b>${esc(x.m.nama)}</b> — ${x.st.label}. Laku ${rows.filter(r => r.mu?.nama === x.m.nama).length} barang terkait dihitung ×${x.m.faktor}.</p>`).join('')}
    ${!lakuPerSku || !Object.keys(lakuPerSku).length ? `<p style="font-size:12px;color:#b91c1c;margin:-6px 0 12px">${esc(lakuInfo || 'Data penjualan belum ada.')}</p>` : ''}`
  const grupHTML = (x, i) => { const sup = supplierList.find(s => s.nama === x.n)
    return `<div class="bl-sup"><div class="bl-sup-kepala"><div><b style="font-size:14px">${x.n ? '🏭 ' + esc(x.n) : '❓ Belum ada supplier'}</b>
      <div class="bl-sub" style="font-size:11px;color:#666">${num(x.rows.length)} barang · <b>${rpS(x.total)}</b>${sup?.lama ? ' · kirim ±' + sup.lama + ' hari' : ''}${x.n && !sup?.wa ? ' · <span style="color:#b91c1c">no. WA belum diisi</span>' : ''}</div></div>
      ${x.n ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="buatPO(${i})">📲 Simpan PO & kirim WA</button><button class="btn btn-secondary btn-sm" onclick="cetakPOGrup(${i})">🖨️ Cetak / PDF</button></div>` : '<span class="bl-sub" style="font-size:11px">pilih supplier per barang dulu</span>'}</div>
      ${x.rows.sort(urutBl).map(rowBelanja).join('')}</div>` }
  const lipat = (judul, list, ket) => list.length ? `<details class="card" style="padding:12px 14px"><summary style="cursor:pointer;font-weight:700;font-size:14px">${judul} (${list.length})</summary><p style="font-size:12px;color:#666;margin:6px 0">${ket}</p><div class="bl-sup">${[...list].sort(urutBl).map(rowBelanja).join('')}</div></details>` : ''
  document.getElementById('bl-hasil').innerHTML = (_bl.grup.length ? _bl.grup.map(grupHTML).join('') : `<div class="card"><p style="color:#666;font-size:13px">${rows.length ? 'Belum ada barang yang masuk budget.' : '✅ Tidak ada barang yang perlu dibeli sekarang (stok cukup / sudah di-PO).'}</p></div>`)
    + lipat('⏳ Belum masuk budget', luar, 'Urutan sesuai prioritas — tambah budget atau kurangi qty barang lain supaya ikut.')
    + lipat('❔ Belum ada harga beli', tanpa, 'Isi modal di <b>Isi HPP</b> atau masukkan nota/penawaran supaya bisa dihitung.')
    + lipat('🚫 Tidak ikut dibeli', keluar, 'Centang lagi untuk memasukkan kembali.')
}
const ubahBl = (K, v) => { _bl.ubah[K] = { ..._bl.ubah[K], ...v }; Object.keys(_bl.ubah[K]).forEach(k => _bl.ubah[K][k] == null && delete _bl.ubah[K][k]); lsSet('bl_ubah', _bl.ubah); aturBudget() }
window.blKeluar = (K, v) => ubahBl(K, { keluar: v || null })
window.blSup = (K, n) => ubahBl(K, { sup: n || null })
window.blQty = (K, v) => { const r = _bl.rows.find(x => x.K === K), q = Math.max(0, parseInt(v) || 0); ubahBl(K, { qty: r && q === r.usul ? null : q }) }
window.resetBelanja = () => { if (_bl) { _bl.ubah = {}; lsSet('bl_ubah', {}); aturBudget(); toast('Usulan awal dikembalikan') } }

// Pesan PO memakai nama barang versi supplier (nama di nota mereka) supaya mudah dikenali
function teksPO(po) {
  return `Halo ${po.supplier}, kami dari *Harmoni* mau pesan:\n\n` + po.items.map((it, i) => `${i + 1}. ${it.nama_sup || it.nama} — *${num(it.qty)} pcs*`).join('\n')
    + `\n\nMohon info ketersediaan, total harga & kapan bisa dikirim. Terima kasih 🙏`
}
const linkWaPO = po => { const s = supplierList?.find(x => x.nama === po.supplier), w = waNo(s?.wa); return 'https://api.whatsapp.com/send?' + (w ? 'phone=' + w + '&' : '') + 'text=' + encodeURIComponent(teksPO(po)) }
const poDariGrup = x => ({ supplier: x.n, tanggal: hariIni(), items: x.rows.map(r => ({ sku: r.K, nama: namaProduk(r.p), nama_sup: r.s?.nama || '', qty: r.ambil, harga: r.beli })), total: x.total })
window.buatPO = async i => {
  const x = _bl.grup[i]; if (!x?.n) return
  const w = window.open('', '_blank')   // dibuka sekarang (sebelum simpan) supaya tidak diblokir browser HP
  try {
    const po = poDariGrup(x), lama = +(supplierList.find(s => s.nama === x.n)?.lama) || 0
    Object.assign(po, { lama, perkiraan_datang: lama ? tambahHari(po.tanggal, lama) : '', status: 'dipesan', oleh: window._harmoniUserName || '', created_at: serverTimestamp() })
    await addDoc(collection(db, 'po'), po)
    po.items.forEach(it => delete _bl.ubah[it.sku]); lsSet('bl_ubah', _bl.ubah)   // ubahan manual barang yang sudah di-PO dihapus supaya tidak diusulkan dobel
    if (w) w.location.href = linkWaPO(po); else location.href = linkWaPO(po)
    toast(`✅ PO ${x.n} tersimpan — kirim pesannya di WA`)
    await loadPO(); await hitungBelanja()
  } catch (e) { if (w) w.close(); toast('Gagal menyimpan PO: ' + e.message, 'error') }
}
function cetakPO(po) {
  const w = window.open('', '_blank'); if (!w) return toast('Izinkan pop-up untuk mencetak', 'error')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PO ${esc(po.supplier)} ${esc(po.tanggal)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:auto}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n{text-align:right}tfoot td{font-weight:700}.k{color:#555;font-size:13px}@media print{button{display:none}}</style></head><body>
    <h1>PURCHASE ORDER — HARMONI</h1><div class="k">Kepada: <b>${esc(po.supplier)}</b> · Tanggal: ${esc(po.tanggal)}${po.perkiraan_datang ? ' · Perkiraan datang: ' + esc(po.perkiraan_datang) : ''}</div>
    <table><thead><tr><th>No</th><th>Barang</th><th>Kode</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>
    ${po.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.nama_sup || it.nama)}</td><td>${esc(it.sku)}</td><td class="n">${num(it.qty)}</td><td class="n">${rpS(it.harga)}</td><td class="n">${rpS(it.qty * it.harga)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="5">Total perkiraan</td><td class="n">${rpS(po.total)}</td></tr></tfoot></table>
    <p class="k">Harga = harga terakhir yang kami terima; mohon konfirmasi bila berubah.</p><button onclick="print()" style="padding:10px 18px;font-size:15px">🖨️ Cetak / Simpan PDF</button>
    <script>setTimeout(()=>print(),300)<\/script></body></html>`)
  w.document.close()
}
window.cetakPOGrup = i => { const x = _bl.grup[i]; if (x) cetakPO(poDariGrup(x)) }
window.cetakPOSimpan = i => cetakPO(_po[i])
window.waPO = i => { const po = _po[i]; if (po) window.open(linkWaPO(po), '_blank') }

async function loadPO() {
  try { await muatSupplier(); _po = (await getDocs(collection(db, 'po'))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)) }
  catch (e) { console.warn('po', e); _po = [] }
  renderPO()
}
function renderPO() {
  const box = document.getElementById('po-list'); if (!box) return
  const semua = document.getElementById('po-semua')?.checked, now = hariIni()
  const list = _po.map((po, i) => ({ po, i })).filter(({ po }) => semua || po.status === 'dipesan')
  const aktif = _po.filter(p => p.status === 'dipesan'), telat = aktif.filter(p => p.perkiraan_datang && p.perkiraan_datang < now)
  box.innerHTML = (aktif.length ? `<p style="font-size:13px;margin-bottom:10px">${num(aktif.length)} PO menunggu barang · <b>${rpS(aktif.reduce((t, p) => t + (+p.total || 0), 0))}</b>${telat.length ? ` · <b style="color:#b91c1c">${telat.length} terlambat</b>` : ''}</p>` : '')
    + (list.length ? list.map(({ po, i }) => {
      const tl = po.status === 'dipesan' && po.perkiraan_datang && po.perkiraan_datang < now, sisa = po.perkiraan_datang ? selisihHari(now, po.perkiraan_datang) : null
      const st = po.status === 'datang' ? `<span class="bl-tag" style="background:#dcfce7;color:#166534">✅ datang ${esc(po.datang_tanggal || '')}</span>` : po.status === 'batal' ? '<span class="bl-tag" style="background:#f1f5f9;color:#475569">batal</span>'
        : tl ? `<span class="bl-tag" style="background:#fee2e2;color:#991b1b">⚠️ terlambat ${-sisa} hari</span>` : `<span class="bl-tag" style="background:#eff6ff;color:#1e40af">⏳ dipesan${sisa != null ? sisa === 0 ? ' · datang hari ini' : ' · ±' + sisa + ' hari lagi' : ''}</span>`
      const kurang = po.status === 'datang' && po.terima ? po.items.reduce((t, it, j) => t + Math.max(0, (+it.qty || 0) - (+po.terima[j] || 0)), 0) : 0
      return `<div class="po-kartu${tl ? ' telat' : ''}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>🏭 ${esc(po.supplier)}</b>${st}
        <div style="font-size:12px;color:#666">PO ${esc(po.tanggal)}${po.perkiraan_datang ? ' · perkiraan datang ' + esc(po.perkiraan_datang) : ''} · ${num(po.items?.length || 0)} barang · <b>${rpS(po.total)}</b>${po.oleh ? ' · ' + esc(po.oleh) : ''}${kurang ? ` · <span style="color:#b91c1c">kurang ${num(kurang)} pcs</span>` : ''}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:start">${po.status === 'dipesan' ? `<button class="btn btn-primary btn-sm" onclick="bukaTerimaPO(${i})">✅ Barang datang</button><button class="btn btn-secondary btn-sm" onclick="waPO(${i})">📲 WA</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="cetakPOSimpan(${i})">🖨️</button>${po.status === 'dipesan' ? `<button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="batalPO(${i})">Batal</button>` : ''}</div></div>
        <div style="font-size:12px;color:#444;margin-top:6px">${(po.items || []).map((it, j) => `${esc(it.nama)} × ${num(it.qty)}${po.terima ? ` <span style="color:#666">(datang ${num(po.terima[j] || 0)})</span>` : ''}`).join(' · ')}</div>
        <div id="po-f-${i}"></div></div>` }).join('') : `<p style="color:#999;font-size:13px">${semua ? 'Belum ada PO.' : 'Tidak ada PO yang menunggu barang.'}</p>`)
}
window.renderPO = renderPO
window.batalPO = async i => { const po = _po[i]; if (!po || !confirm(`Batalkan PO ${po.supplier} tanggal ${po.tanggal}?`)) return
  try { await updateDoc(doc(db, 'po', po.id), { status: 'batal', batal_oleh: window._harmoniUserName || '', updated_at: serverTimestamp() }); toast('PO dibatalkan'); await loadPO(); if (_bl) await hitungBelanja() } catch (e) { toast('Gagal: ' + e.message, 'error') } }
window.bukaTerimaPO = i => {
  const po = _po[i], el = document.getElementById('po-f-' + i); if (!po || !el) return
  if (el.innerHTML) { el.innerHTML = ''; return }
  el.innerHTML = `<div style="border-top:1px dashed #cbd5e1;margin-top:10px;padding-top:10px">
    <div style="font-size:13px;font-weight:700;margin-bottom:6px">Cocokkan dengan nota dari supplier</div>
    <table style="width:100%"><thead><tr><th style="text-align:left">Barang</th><th>Dipesan</th><th>Datang</th><th>Harga di nota</th></tr></thead><tbody>
    ${po.items.map((it, j) => `<tr><td>${esc(it.nama)}<div style="font-size:11px;color:#666">${esc(it.sku)}</div></td><td class="number">${num(it.qty)}</td><td><input type="number" min="0" inputmode="numeric" id="po-q-${i}-${j}" value="${+it.qty || 0}" style="width:72px"></td><td><input type="number" min="0" inputmode="numeric" id="po-h-${i}-${j}" value="${+it.harga || 0}" style="width:110px"></td></tr>`).join('')}</tbody></table>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px">
      <label style="font-size:12px">Tanggal datang<br><input type="date" id="po-tgl-${i}" value="${hariIni()}" style="width:100%"></label>
      <label style="font-size:12px">No. invoice<br><input id="po-inv-${i}" placeholder="opsional" style="width:100%"></label>
      <label style="font-size:12px">Masuk ke<br><select id="po-lok-${i}" style="width:100%"><option value="gudang">Gudang</option><option value="toko">Toko</option></select></label></div>
    <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="po-stok-${i}" checked> Tambahkan ke stok di Stok Manager</label>
    <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" id="po-modal-${i}" checked> Perbarui modal (HPP) sesuai harga nota</label>
    <p style="font-size:11px;color:#92400e;margin:6px 0">Barang datang tetap perlu diinput juga di <b>Olsera</b> (penerimaan barang) — upload stok Olsera berikutnya akan menimpa stok di sini.</p>
    <button class="btn btn-primary btn-sm" id="po-btn-${i}" onclick="terimaPO(${i})">💾 Simpan — jadi nota</button></div>`
}
window.terimaPO = async i => {
  const po = _po[i]; if (!po) return
  const v = id => document.getElementById(id), lok = v('po-lok-' + i).value, tambah = v('po-stok-' + i).checked, perbarui = v('po-modal-' + i).checked, tanggal = v('po-tgl-' + i).value || hariIni()
  const items = po.items.map((it, j) => ({ ...it, terima: Math.max(0, parseInt(v(`po-q-${i}-${j}`).value) || 0), hargaN: Math.max(0, +v(`po-h-${i}-${j}`).value || 0) }))
  if (!items.some(x => x.terima > 0)) return toast('Isi jumlah barang yang datang', 'error')
  const btn = v('po-btn-' + i); btn.disabled = true; btn.textContent = 'Menyimpan…'
  try {
    const nota = await addDoc(collection(db, 'nota'), { supplier: po.supplier, tanggal, no_invoice: v('po-inv-' + i).value.trim(), jenis: 'nota', po_id: po.id,
      items: items.filter(x => x.terima > 0).map(x => ({ nama_barang: x.nama_sup || x.nama, sku: x.sku, qty: x.terima, harga_satuan: x.hargaN, catatan: '' })), created_at: serverTimestamp() })
    const produk = await produkSemua(), modalPas = []; let nStok = 0
    for (const x of items.filter(x => x.terima > 0)) {
      const p = produk.find(q => String(q.sku || q.id).toUpperCase() === String(x.sku).toUpperCase()); if (!p) continue
      const up = {}
      if (tambah) { const cur = +((await getDoc(doc(db, 'products', p.id))).data()?.['stock_qty_' + lok]) || 0; up['stock_qty_' + lok] = cur + x.terima; if (!(p.lokasi || []).includes(lok)) up.lokasi = [...(p.lokasi || []), lok]; nStok += x.terima }
      if (perbarui && x.hargaN > 0 && x.hargaN !== +p['buy_price_' + lok]) { up['buy_price_' + lok] = x.hargaN; catatModal([{ sku: p.sku || p.id, nama: namaProduk(p), lokasi: lok, lama: +p['buy_price_' + lok] || 0, baru: x.hargaN, sumber: `Nota barang datang (PO ${po.supplier})`, status: +p['buy_price_' + lok] > 0 ? 'diubah' : 'diisi' }]) }
      if (!Object.keys(up).length) continue
      await updateDoc(doc(db, 'products', p.id), { ...up, updated_at: serverTimestamp() }); Object.assign(p, up)
      if (up['stock_qty_' + lok] != null) sinkronStokKeAnalitik(p.sku || p.id, lok, up['stock_qty_' + lok])
      if (up['buy_price_' + lok] != null) modalPas.push([p.sku || p.id, modalP(p)])
    }
    if (modalPas.length) sinkronModalKeAnalitik(modalPas)
    await updateDoc(doc(db, 'po', po.id), { status: 'datang', datang_tanggal: tanggal, nota_id: nota.id, terima: items.map(x => x.terima), harga_nota: items.map(x => x.hargaN), diterima_oleh: window._harmoniUserName || '', updated_at: serverTimestamp() })
    _bh = null; invalidateDashboard()
    toast(`✅ Nota ${po.supplier} tersimpan${nStok ? ` · stok ${lok} +${num(nStok)}` : ''}${modalPas.length ? ` · ${modalPas.length} modal diperbarui` : ''}. Jangan lupa input di Olsera.`)
    await loadPO(); if (_bl) await hitungBelanja()
  } catch (e) { toast('Gagal: ' + e.message, 'error'); btn.disabled = false; btn.textContent = '💾 Simpan — jadi nota' }
}

// ── KALENDER MUSIM ─────────────────────────────────────────────────────────
// musim/{id} = { nama, mulai:'MM-DD', selesai:'MM-DD', faktor (× laku normal), ingat (minggu sebelum mulai), kata:'PASKIBRA, PDU', sku:[...], catatan }
// Berulang tiap tahun. Mulai `ingat` minggu sebelum musim sampai musim selesai, laku barang terkait × faktor di Daftar Belanja.
let _musim = null
const NAMA_BLN_ID = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const tglPendek = t => { const [, m, d] = t.split('-'); return `${+d} ${NAMA_BLN_ID[+m]}` }
async function muatMusim(paksa) {
  if (_musim && !paksa) return _musim
  try { _musim = (await getDocs(collection(db, 'musim'))).docs.map(d => ({ id: d.id, ...d.data() })) } catch (e) { console.warn('musim', e); _musim = [] }
  return _musim
}
// Kejadian musim yang sedang/akan datang (berulang tiap tahun, boleh lewat tahun baru)
function kejadianMusim(m, hari = hariIni()) {
  const Y = +hari.slice(0, 4)
  for (const y of [Y - 1, Y, Y + 1]) { const s = `${y}-${m.mulai}`; let e = `${y}-${m.selesai}`; if (e < s) e = `${y + 1}-${m.selesai}`; if (e >= hari) return { s, e, ingatDari: tambahHari(s, -7 * (+m.ingat || 8)) } }
  return null
}
function statusMusim(m, hari = hariIni()) {
  const k = kejadianMusim(m, hari); if (!k) return { aktif: false, label: '' }
  if (hari >= k.s) return { ...k, aktif: true, tahap: 'jalan', label: `🔥 sedang musim (sampai ${tglPendek(k.e)})` }
  const n = selisihHari(hari, k.s)
  if (hari >= k.ingatDari) return { ...k, aktif: true, tahap: 'siap', hari: n, label: `⏰ ${n >= 14 ? Math.round(n / 7) + ' minggu' : n + ' hari'} lagi — siapkan stok` }
  return { ...k, aktif: false, tahap: 'nanti', hari: n, label: `berikutnya ${tglPendek(k.s)} (${Math.round(n / 7)} minggu lagi)` }
}
const setBulanMusim = (mulai, selesai) => { const b1 = +mulai.slice(0, 2), b2 = +selesai.slice(0, 2), set = new Set(); for (let b = b1, i = 0; i < 12; i++) { set.add(b); if (b === b2) break; b = b % 12 + 1 } return set }
// Laku bulan biasa = rata-rata 3 bulan terakhir di luar bulan musim (supaya saat musim berjalan tidak dikali dua kali)
function lakuBiasa(K, m) { const q = _riwayat.q[K]; if (!q) return null; const set = setBulanMusim(m.mulai, m.selesai), idx = _riwayat.bulan.map((x, i) => x[1] && !set.has(x[1]) ? i : -1).filter(i => i >= 0).slice(-3)
  return idx.length ? idx.reduce((t, i) => t + (+q[i] || 0), 0) / idx.length : null }
const kataMusim = m => String(m.kata || '').toUpperCase().split(',').map(t => t.trim()).filter(Boolean)
const cocokMusim = (m, p) => { const K = String(p.sku || p.id).toUpperCase(); if ((m.sku || []).map(x => String(x).toUpperCase()).includes(K)) return true
  const t = (namaProduk(p) + ' ' + (p.category || '')).toUpperCase(); return kataMusim(m).some(w => t.includes(w)) }
// Faktor musim tertinggi yang berlaku untuk barang ini sekarang
function faktorMusim(p) { let best = null; (_musim || []).forEach(m => { const st = statusMusim(m); if (st.aktif && +m.faktor > 1 && cocokMusim(m, p) && (!best || +m.faktor > best.f)) best = { f: +m.faktor, nama: m.nama, st, m } }); return best }

const TEMPLATE_MUSIM = {
  ajaran: { nama: 'Tahun ajaran baru', mulai: '06-20', selesai: '07-31', faktor: 2, ingat: 8, kata: 'SEKOLAH, SERAGAM, SD, SMP, SMA, DASI, TOPI', catatan: 'Seragam & atribut sekolah' },
  paskibra: { nama: '17 Agustus / Paskibra', mulai: '07-15', selesai: '08-20', faktor: 2, ingat: 8, kata: 'PASKIBRA, PDU, MERAH PUTIH', catatan: 'Atribut Paskibra & upacara' },
}
window.isiTemplateMusim = k => { const t = TEMPLATE_MUSIM[k]; resetFormMusim(); Object.entries({ nama: t.nama, mulai: t.mulai, selesai: t.selesai, faktor: t.faktor, ingat: t.ingat, kata: t.kata, cat: t.catatan }).forEach(([f, v]) => document.getElementById('ms-' + f).value = v)
  toast('Template diisi — sesuaikan tanggal & kata kunci, lalu simpan'); document.getElementById('ms-form').open = true }
window.resetFormMusim = () => { ['nama', 'mulai', 'selesai', 'kata', 'cat'].forEach(f => document.getElementById('ms-' + f).value = ''); document.getElementById('ms-faktor').value = 2; document.getElementById('ms-ingat').value = 8
  document.getElementById('ms-id').value = ''; document.getElementById('ms-usul').innerHTML = ''; window._msSku = [] }
window.ubahMusim = id => { const m = _musim.find(x => x.id === id); if (!m) return; resetFormMusim()
  Object.entries({ nama: m.nama, mulai: m.mulai, selesai: m.selesai, faktor: m.faktor, ingat: m.ingat, kata: m.kata || '', cat: m.catatan || '' }).forEach(([f, v]) => document.getElementById('ms-' + f).value = v)
  document.getElementById('ms-id').value = id; window._msSku = [...(m.sku || [])]; renderSkuMusim(); const f = document.getElementById('ms-form'); f.open = true; f.scrollIntoView({ behavior: 'smooth' }) }
const mmdd = v => { const m = String(v || '').trim().match(/^(\d{1,2})[-\/](\d{1,2})$/); if (!m) return ''; const b = +m[1], d = +m[2]; return b >= 1 && b <= 12 && d >= 1 && d <= 31 ? `${String(b).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '' }
window.simpanMusim = async () => {
  const v = f => document.getElementById('ms-' + f).value.trim(), nama = v('nama'), mulai = mmdd(v('mulai')), selesai = mmdd(v('selesai'))
  if (!nama) return toast('Nama musim wajib diisi', 'error'); if (!mulai || !selesai) return toast('Isi tanggal mulai & selesai dengan format BB-TT, cth 07-15', 'error')
  const faktor = Math.max(1, +v('faktor') || 1), ingat = Math.max(1, parseInt(v('ingat')) || 8), sku = window._msSku || []
  if (!v('kata') && !sku.length) return toast('Isi kata kunci barang, atau pilih barang dari "Cari dari data penjualan"', 'error')
  const id = v('id') || idSup(nama)
  try { await setDoc(doc(db, 'musim', id), { nama, mulai, selesai, faktor, ingat, kata: v('kata'), sku, catatan: v('cat'), oleh: window._harmoniUserName || '', updated_at: serverTimestamp() })
    toast(`✅ Musim "${nama}" disimpan`); resetFormMusim(); document.getElementById('ms-form').open = false; await muatMusim(true); renderMusim(); if (_bl) aturBudget() } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.hapusMusim = async id => { const m = _musim.find(x => x.id === id); if (!m || !confirm(`Hapus musim "${m.nama}"?`)) return
  try { await deleteDoc(doc(db, 'musim', id)); await muatMusim(true); renderMusim(); if (_bl) aturBudget(); toast('Musim dihapus') } catch (e) { toast('Gagal: ' + e.message, 'error') } }
function renderMusim() {
  const box = document.getElementById('ms-list'); if (!box) return
  const prod = _bh?.produk || stokAllData || []
  const list = (_musim || []).map(m => ({ m, st: statusMusim(m) })).sort((a, b) => (a.st.s || '9').localeCompare(b.st.s || '9'))
  document.getElementById('ms-n').textContent = list.filter(x => x.st.aktif).length ? `· ${list.filter(x => x.st.aktif).length} sedang berlaku` : ''
  box.innerHTML = list.length ? list.map(({ m, st }) => { const n = prod.length ? prod.filter(p => cocokMusim(m, p)).length : null
    return `<div class="po-kartu" style="${st.aktif ? 'border-color:#fcd34d;background:#fffbeb' : ''}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div><b>📅 ${esc(m.nama)}</b> <span style="font-size:12px;color:#666">${tglPendek('2000-' + m.mulai)} – ${tglPendek('2000-' + m.selesai)} · laku ×${m.faktor} · diingatkan ${m.ingat || 8} minggu sebelumnya</span>
        <div style="font-size:12px;font-weight:700;color:${st.aktif ? '#92400e' : '#475569'};margin-top:2px">${st.label}</div>
        <div style="font-size:11px;color:#666;margin-top:2px">${m.kata ? 'Kata kunci: ' + esc(m.kata) : ''}${m.sku?.length ? `${m.kata ? ' · ' : ''}${m.sku.length} barang dipilih` : ''}${n != null ? ` · <b>${n} barang cocok</b>` : ''}${m.catatan ? ' · ' + esc(m.catatan) : ''}</div></div>
      <div style="display:flex;gap:6px;align-items:start"><button class="btn btn-secondary btn-sm" onclick="ubahMusim('${jsStr(m.id)}')">✏️ Ubah</button><button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="hapusMusim('${jsStr(m.id)}')">Hapus</button></div></div></div>` }).join('')
    : '<p style="font-size:13px;color:#666">Belum ada musim. Pakai template di bawah atau tambah sendiri.</p>'
}
// ── Bahan barang custom ────────────────────────────────────────────
// Analitik menyimpan qty barang custom per jenis per bulan (penjualan_custom_ringkas, dari laporan Olsera "Item Penjualan").
// Resep (harmoni-stok `resep_custom`): kata kunci jenis → bahan [{sku, nama, qty per pcs}]. Kebutuhan bahan/bln
// = rata-rata qty jenis yang cocok × qty per pcs, ditambahkan ke laku/bln bahan itu di Daftar Belanja.
let _cu = null
async function muatCustom(paksa) {
  if (_cu && !paksa) return _cu
  _cu = { bulan: [], jenis: {}, resep: [], info: '' }
  const d = hiDb()
  try {
    const [rs, rp] = await Promise.all([d ? d.collection('penjualan_custom_ringkas').get() : null, getDocs(collection(db, 'resep_custom'))])
    _cu.resep = rp.docs.map(x => ({ id: x.id, ...x.data() }))
    const docs = []; rs?.forEach(x => docs.push({ id: x.id, j: x.data().j || [] }))
    docs.sort((a, b) => a.id.localeCompare(b.id)); _cu.bulan = docs.map(x => x.id)
    docs.forEach((m, i) => m.j.forEach(({ k, q }) => { (_cu.jenis[k] = _cu.jenis[k] || new Array(docs.length).fill(0))[i] += +q || 0 }))
    if (!docs.length) _cu.info = 'Belum ada data barang custom — upload laporan Olsera "Item Penjualan" di Analitik → tab 🧵 Barang Custom.'
  } catch (e) { console.warn('custom', e); _cu.info = e.code === 'permission-denied' ? 'Akun ini belum punya akses data custom.' : 'Data custom gagal dimuat.' }
  return _cu
}
const kataResep = r => String(r.kata || '').toUpperCase().split(',').map(t => t.trim()).filter(Boolean)
// Resep yang cocok untuk satu jenis: kata kunci terpanjang yang terkandung di nama jenis
function resepUntuk(jenis) { let best = null, panjang = 0; (_cu?.resep || []).forEach(r => kataResep(r).forEach(k => { if (jenis.includes(k) && k.length > panjang) { best = r; panjang = k.length } })); return best }
const rataJenis = (q, n) => { const a = q.slice(-n); return a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0 }
function kebutuhanCustom(n = 3) {
  const out = {}; if (!_cu) return out
  Object.entries(_cu.jenis).forEach(([j, q]) => { const r = resepUntuk(j); if (!r) return; const avg = rataJenis(q, n); if (!(avg > 0)) return
    ;(r.bahan || []).forEach(b => { const K = String(b.sku).toUpperCase(), v = avg * (+b.qty || 0); if (!(v > 0)) return
      const o = out[K] = out[K] || { laku: 0, per: {} }; o.laku += v; o.per[r.kata] = (o.per[r.kata] || 0) + v }) })
  Object.values(out).forEach(o => { o.laku = +o.laku.toFixed(1); o.rincian = Object.entries(o.per).map(([kata, q]) => ({ kata, q: +q.toFixed(1) })).sort((a, b) => b.q - a.q) })
  return out
}
function renderCustomBahan() {
  const box = document.getElementById('cu-list'); if (!box || !_cu) return
  const n = 3, q = (document.getElementById('cu-cari')?.value || '').trim().toUpperCase()
  const daftar = Object.entries(_cu.jenis).map(([j, a]) => ({ j, avg: rataJenis(a, n), tot: a.reduce((t, v) => t + v, 0), r: resepUntuk(j) }))
    .filter(x => x.tot > 0 && (!q || x.j.includes(q))).sort((a, b) => b.avg - a.avg || b.tot - a.tot)
  const ada = daftar.filter(x => x.r).length, belum = daftar.length - ada
  document.getElementById('cu-n').textContent = _cu.bulan.length ? `· ${_cu.bulan.length} bulan data · ${(_cu.resep || []).length} resep` : ''
  const info = _cu.info ? `<p style="font-size:12px;color:#b45309">${esc(_cu.info)}</p>` : `<p style="font-size:12px;color:#666;margin-bottom:6px">Rata-rata ${n} bulan terakhir (${_cu.bulan.slice(-n).join(', ')}). ${ada} jenis sudah punya bahan, ${belum} belum.</p>`
  box.innerHTML = info + (daftar.length ? `<div style="max-height:360px;overflow:auto"><table class="tbl-cu"><tr><th>Jenis custom & bahan</th><th style="text-align:right">pcs/bln</th><th></th></tr>${daftar.slice(0, 150).map(x => `<tr>
      <td><b style="font-weight:600">${esc(x.j)}</b><div style="font-size:11px;margin-top:2px;color:${x.r ? '#166534' : '#999'}">${x.r ? `🔑 ${esc(x.r.kata)} → ${(x.r.bahan || []).map(b => `${esc(b.nama || b.sku)} ×${b.qty}`).join(', ')}` : 'bahan belum diatur'}</div></td>
      <td style="text-align:right;font-weight:700;white-space:nowrap">${x.avg ? +x.avg.toFixed(1) : '<span style="color:#999">0</span>'}</td>
      <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" onclick="aturResepCustom('${jsStr(x.r ? x.r.id : '')}','${jsStr(x.j)}')">${x.r ? '✏️' : '+ Bahan'}</button></td></tr>`).join('')}</table></div>${daftar.length > 150 ? `<p style="font-size:11px;color:#666">… ${daftar.length - 150} jenis lain — pakai pencarian</p>` : ''}` : '')
  const rl = document.getElementById('cu-resep')
  rl.innerHTML = (_cu.resep || []).length ? (_cu.resep || []).sort((a, b) => String(a.kata).localeCompare(String(b.kata))).map(r => {
    const jml = Object.keys(_cu.jenis).filter(j => resepUntuk(j) === r).length
    return `<div class="po-kartu"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>🔑 ${esc(r.kata)}</b> <span style="font-size:12px;color:#666">· cocok ${jml} jenis</span>
      <div style="font-size:12px;margin-top:2px">${(r.bahan || []).map(b => `${esc(b.nama || b.sku)} <b>×${b.qty}</b>/pcs`).join(' · ') || '<span style="color:#b91c1c">belum ada bahan</span>'}</div></div>
      <div style="display:flex;gap:6px;align-items:start"><button class="btn btn-secondary btn-sm" onclick="aturResepCustom('${jsStr(r.id)}')">✏️ Ubah</button><button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="hapusResepCustom('${jsStr(r.id)}')">🗑</button></div></div></div>` }).join('')
    : '<p style="font-size:12px;color:#666">Belum ada resep bahan.</p>'
}
window.renderCustomBahan = renderCustomBahan
let _cuBahan = []
function renderBahanForm() {
  document.getElementById('cu-bahan').innerHTML = _cuBahan.length ? _cuBahan.map((b, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;font-size:13px">
    <span style="flex:1;min-width:0">${esc(b.nama || b.sku)} <span style="color:#999;font-size:11px">${esc(b.sku)}</span></span>
    <input type="number" min="0" step="0.01" value="${b.qty}" style="width:80px" onchange="_cuQty(${i}, this.value)"><span style="font-size:11px;color:#666">/pcs</span>
    <button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="_cuHapusBahan(${i})">✕</button></div>`).join('') : '<p style="font-size:12px;color:#999">Belum ada bahan — cari barang di bawah lalu Tambah.</p>'
}
window._cuQty = (i, v) => { _cuBahan[i].qty = Math.max(0, +v || 0) }
window._cuHapusBahan = i => { _cuBahan.splice(i, 1); renderBahanForm() }
window.aturResepCustom = async (id, jenis) => {
  const r = id ? _cu.resep.find(x => x.id === id) : null
  document.getElementById('cu-id').value = r ? r.id : ''
  document.getElementById('cu-kata').value = r ? r.kata : (jenis || '')
  _cuBahan = r ? (r.bahan || []).map(b => ({ ...b })) : []
  const prod = await produkSemua()
  document.getElementById('cu-produk-list').innerHTML = prod.map(p => `<option value="${esc(String(p.sku || p.id))} · ${esc(namaProduk(p))}">`).join('')
  renderBahanForm(); const f = document.getElementById('cu-form'); f.open = true; f.scrollIntoView({ behavior: 'smooth' })
}
window.tambahBahanCustom = async () => {
  const el = document.getElementById('cu-produk'), v = el.value.trim(), qty = Math.max(0, +document.getElementById('cu-qty').value || 0)
  const prod = await produkSemua(), sku = v.split(' · ')[0].trim().toUpperCase()
  const p = prod.find(x => String(x.sku || x.id).toUpperCase() === sku) || prod.find(x => namaProduk(x).toUpperCase() === v.toUpperCase())
  if (!p) return toast('Pilih barang dari daftar (ketik nama lalu pilih)', 'error'); if (!(qty > 0)) return toast('Isi qty bahan per 1 pcs custom', 'error')
  const K = String(p.sku || p.id).toUpperCase(), ada = _cuBahan.find(b => String(b.sku).toUpperCase() === K)
  if (ada) ada.qty = qty; else _cuBahan.push({ sku: K, nama: namaProduk(p), qty })
  el.value = ''; renderBahanForm()
}
window.simpanResepCustom = async () => {
  const kata = document.getElementById('cu-kata').value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).join(', ')
  if (!kata) return toast('Isi kata kunci jenis custom', 'error'); if (!_cuBahan.length) return toast('Tambahkan minimal 1 bahan', 'error')
  const id = document.getElementById('cu-id').value || idSup(kata).slice(0, 120)
  try { await setDoc(doc(db, 'resep_custom', id), { kata, bahan: _cuBahan.map(b => ({ sku: b.sku, nama: b.nama || '', qty: +b.qty || 0 })), oleh: window._harmoniUserName || '', updated_at: serverTimestamp() })
    toast('✅ Resep bahan disimpan'); batalResepCustom(); await muatCustom(true); renderCustomBahan(); if (_bl) hitungBelanja() } catch (e) { toast('Gagal: ' + e.message, 'error') }
}
window.batalResepCustom = () => { document.getElementById('cu-id').value = ''; document.getElementById('cu-kata').value = ''; _cuBahan = []; renderBahanForm(); document.getElementById('cu-form').open = false }
window.hapusResepCustom = async id => { const r = _cu.resep.find(x => x.id === id); if (!r || !confirm(`Hapus resep bahan "${r.kata}"?`)) return
  try { await deleteDoc(doc(db, 'resep_custom', id)); await muatCustom(true); renderCustomBahan(); if (_bl) hitungBelanja(); toast('Resep dihapus') } catch (e) { toast('Gagal: ' + e.message, 'error') } }

// Cari barang yang penjualannya naik di bulan-bulan musim (dari riwayat penjualan Analitik)
window.cariBarangMusim = async () => {
  const mulai = mmdd(document.getElementById('ms-mulai').value), selesai = mmdd(document.getElementById('ms-selesai').value), box = document.getElementById('ms-usul')
  if (!mulai || !selesai) return toast('Isi tanggal mulai & selesai dulu', 'error')
  box.innerHTML = '<div class="loading"><div class="spinner"></div><span>Membaca riwayat penjualan…</span></div>'
  await muatLaku(); const prod = await produkSemua()
  const b1 = +mulai.slice(0, 2), b2 = +selesai.slice(0, 2), bulanMusim = setBulanMusim(mulai, selesai)
  const idxM = _riwayat.bulan.map((x, i) => bulanMusim.has(x[1]) ? i : -1).filter(i => i >= 0), idxL = _riwayat.bulan.map((x, i) => x[1] && !bulanMusim.has(x[1]) ? i : -1).filter(i => i >= 0)
  if (!idxM.length || idxL.length < 2) { box.innerHTML = `<p style="font-size:12px;color:#b91c1c">Riwayat penjualan belum mencakup bulan ${NAMA_BLN_ID[b1]}–${NAMA_BLN_ID[b2]} (data ada: ${_riwayat.bulan.length} bulan). Upload data penjualan bulan-bulan itu di Analitik, atau isi kata kunci manual.</p>`; return }
  const bySku = {}; prod.forEach(p => bySku[String(p.sku || p.id).toUpperCase()] = p)
  const avg = (q, idx) => idx.reduce((t, i) => t + (+q[i] || 0), 0) / idx.length
  const hasil = Object.entries(_riwayat.q).map(([K, q]) => { const a = avg(q, idxM), b = avg(q, idxL); return { K, p: bySku[K], a, b, r: b > 0 ? a / b : a >= 3 ? 9 : 0 } })
    .filter(x => x.p && x.a >= 2 && x.r >= 1.5).sort((x, y) => y.a * Math.min(y.r, 9) - x.a * Math.min(x.r, 9)).slice(0, 40)
  if (!hasil.length) { box.innerHTML = '<p style="font-size:12px;color:#666">Tidak ada barang yang penjualannya naik ≥1,5× di bulan-bulan ini.</p>'; return }
  const rs = hasil.map(x => Math.min(x.r, 5)).sort((a, b) => a - b), med = rs[Math.floor((rs.length - 1) / 2)]
  window._msUsul = hasil; window._msSku = window._msSku || []
  box.innerHTML = `<p style="font-size:12px;color:#666;margin:6px 0">Barang yang di bulan ${NAMA_BLN_ID[b1]}–${NAMA_BLN_ID[b2]} terjual jauh lebih banyak dari bulan lain (${idxM.length} bulan musim vs ${idxL.length} bulan biasa). Rata-rata naik ±${med.toFixed(1)}× → <a href="#" onclick="document.getElementById('ms-faktor').value=${Math.max(1.5, Math.round(med * 2) / 2)};return false">pakai faktor ×${Math.max(1.5, Math.round(med * 2) / 2)}</a></p>
    <div style="max-height:320px;overflow:auto;border:1px solid #e5e5e5;border-radius:8px">${hasil.map((x, i) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12.5px"><input type="checkbox" ${window._msSku.includes(x.K) || !window._msSku.length ? 'checked' : ''} data-k="${esc(x.K)}" onchange="pilihSkuMusim()">
      <span style="flex:1;min-width:0"><b>${esc(namaProduk(x.p))}</b> <span style="color:#666">${esc(x.K)}</span></span><span style="white-space:nowrap;color:#166534;font-weight:700">${x.a.toFixed(0)}/bln musim · ${x.b ? '×' + x.r.toFixed(1) : 'baru laku'}</span></label>`).join('')}</div>`
  pilihSkuMusim()
}
window.pilihSkuMusim = () => { window._msSku = [...document.querySelectorAll('#ms-usul input[data-k]:checked')].map(i => i.dataset.k); renderSkuMusim(true) }
function renderSkuMusim(dariUsul) { const el = document.getElementById('ms-sku-n'); if (el) el.textContent = window._msSku?.length ? `${window._msSku.length} barang dipilih` + (dariUsul ? '' : ' (klik "Cari dari data penjualan" untuk mengubah)') : '' }

// ── OPNAME ─────────────────────────────────────────────────────────────────
// opname/{id} = { tanggal, lokasi, area, oleh, status:'menunggu'|'disetujui'|'ditolak', catatan,
//                 items:[{id, sku, nama, sistem (stok saat dihitung), hitung, modal, dipakai?, stok_baru?}], selisih_rp, disetujui_oleh, alasan_tolak }
// products.opname_toko / opname_gudang = tanggal terakhir dihitung (diisi saat disetujui)
// Stok sistem tidak ditampilkan ke staff (hitung buta); selisih & persetujuan hanya untuk Owner.
let _opSesi = []
const isOwnerSM = () => !!window._harmoniIsOwner
const drafOp = () => lsGet('op_draf', { lokasi: 'toko', area: '', catatan: '', items: [] })
const simpanDrafOp = d => lsSet('op_draf', d)
const stokLok = (p, lok) => +p['stock_qty_' + lok] || 0
const diLokasi = (p, lok) => (p.lokasi || []).includes(lok) || stokLok(p, lok) !== 0
async function loadOpname() {
  const d = drafOp(); document.getElementById('op-lokasi').value = d.lokasi; document.getElementById('op-area').value = d.area || ''; document.getElementById('op-cat').value = d.catatan || ''
  document.getElementById('op-lama-lok').value = d.lokasi
  stokAllData = []; const prod = await produkSemua()   // selalu stok terbaru untuk hitung & persetujuan
  const sel = document.getElementById('op-kat'); if (sel.options.length <= 1) [...new Set(prod.map(p => p.category).filter(Boolean))].sort().forEach(k => sel.add(new Option(k, k)))
  await muatSesiOp(); renderDrafOp(); renderLamaOp()
}
document.addEventListener('harmoni-login', () => { if (document.getElementById('opname')?.classList.contains('active')) { renderTungguOp(); renderRiwayatOp(); renderRingkasOp() } })
async function muatSesiOp() {
  try { _opSesi = (await getDocs(collection(db, 'opname'))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0) || String(b.tanggal).localeCompare(String(a.tanggal))) } catch (e) { console.warn('opname', e); _opSesi = [] }
  const dl = document.getElementById('dl-area'); if (dl) dl.innerHTML = [...new Set(_opSesi.map(s => s.area).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')
  renderTungguOp(); renderRiwayatOp(); renderRingkasOp()
}
window.ubahDrafOp = () => { const d = drafOp(), lok = document.getElementById('op-lokasi').value
  if (lok !== d.lokasi && d.items.some(x => x.hitung !== '')) { if (!confirm('Ganti lokasi? Hitungan yang sudah diisi tetap ada, tapi akan dianggap stok ' + lok + '.')) { document.getElementById('op-lokasi').value = d.lokasi; return } }
  d.lokasi = lok; d.area = document.getElementById('op-area').value; d.catatan = document.getElementById('op-cat').value; simpanDrafOp(d) }
const hasilCariOp = q => { q = q.trim().toUpperCase(); if (!q) return []; const lok = document.getElementById('op-lokasi').value
  return stokAllData.filter(p => (namaProduk(p) + ' ' + (p.sku || p.id)).toUpperCase().includes(q)).sort((a, b) => diLokasi(b, lok) - diLokasi(a, lok) || (String(b.sku || '').toUpperCase() === q) - (String(a.sku || '').toUpperCase() === q)).slice(0, 10) }
window.cariOp = () => { const box = document.getElementById('op-hasil'), h = hasilCariOp(document.getElementById('op-cari').value)
  box.style.display = h.length ? 'block' : 'none'
  box.innerHTML = h.map(p => `<button onmousedown="event.preventDefault()" onclick="tambahOp('${jsStr(p.id)}')"><span><b>${esc(namaProduk(p))}</b></span><span style="color:#666;white-space:nowrap">${esc(p.sku || p.id)}</span></button>`).join('') }
document.addEventListener('click', e => { if (!e.target.closest?.('#op-hasil') && e.target.id !== 'op-cari') { const b = document.getElementById('op-hasil'); if (b) b.style.display = 'none' } })
window.enterOp = () => { const q = document.getElementById('op-cari').value.trim(); if (!q) return
  const pas = stokAllData.find(p => String(p.sku || p.id).toUpperCase() === q.toUpperCase()), h = pas ? [pas] : hasilCariOp(q)
  if (h.length === 1) tambahOp(h[0].id); else if (!h.length) toast('Barang tidak ditemukan: ' + q, 'error') }
window.tambahOp = (id, diam) => {
  const p = stokAllData.find(x => x.id === id); if (!p) return
  const d = drafOp(), scan = document.getElementById('op-scan')?.checked; let it = d.items.find(x => x.id === id)
  if (it) { if (scan && !diam) it.hitung = String((+it.hitung || 0) + 1) }
  else { it = { id, sku: p.sku || id, nama: namaProduk(p), hitung: scan && !diam ? '1' : '' }; d.items.unshift(it) }
  simpanDrafOp(d)
  if (diam) return
  const c = document.getElementById('op-cari'); c.value = ''; document.getElementById('op-hasil').style.display = 'none'
  renderDrafOp(id)
  if (scan) c.focus(); else { const inp = document.getElementById('op-q-' + id); if (inp) { inp.focus(); inp.select() } }
}
window.isiHitungOp = (id, v) => { const d = drafOp(), it = d.items.find(x => x.id === id); if (!it) return; it.hitung = v === '' ? '' : String(Math.max(0, parseInt(v) || 0)); simpanDrafOp(d); renderJumlahOp() }
window.hapusOp = id => { const d = drafOp(); d.items = d.items.filter(x => x.id !== id); simpanDrafOp(d); renderDrafOp() }
window.kosongkanOp = () => { const d = drafOp(); if (d.items.length && !confirm('Kosongkan semua hitungan?')) return; d.items = []; d.catatan = ''; document.getElementById('op-cat').value = ''; simpanDrafOp(d); renderDrafOp() }
window.tambahKategoriOp = () => { const k = document.getElementById('op-kat').value, lok = document.getElementById('op-lokasi').value; if (!k) return
  const list = stokAllData.filter(p => p.category === k && diLokasi(p, lok)); list.forEach(p => tambahOp(p.id, true)); renderDrafOp(); toast(`${list.length} barang kategori ${k} ditambahkan`) }
window.tambahLamaOp = n => { const lok = document.getElementById('op-lokasi').value, list = barangLamaOp(lok, 30).slice(0, n)
  list.forEach(p => tambahOp(p.id, true)); renderDrafOp(); toast(list.length ? `${list.length} barang ditambahkan` : 'Semua barang sudah dihitung dalam 30 hari 👍') }
function renderJumlahOp() { const d = drafOp(), n = d.items.filter(x => x.hitung !== '').length, b = document.getElementById('op-kirim'); if (b) b.textContent = `📤 Kirim untuk disetujui (${n}/${d.items.length})` }
function renderDrafOp(baru) {
  const d = drafOp(), box = document.getElementById('op-daftar'); if (!box) return
  box.innerHTML = d.items.length ? `<div style="font-size:12px;color:#666">${d.items.length} barang · kotak kuning = belum diisi</div>` + d.items.map(it => `<div class="op-baris${it.id === baru ? ' baru' : ''}">
      <div style="min-width:0"><b>${esc(it.nama)}</b><div style="font-size:11px;color:#666">${esc(it.sku)}</div></div>
      <input type="number" min="0" inputmode="numeric" id="op-q-${esc(it.id)}" value="${esc(it.hitung)}" placeholder="?" onchange="isiHitungOp('${jsStr(it.id)}', this.value)" onkeydown="if(event.key==='Enter'){this.blur();document.getElementById('op-cari').focus()}">
      <button class="nota-row-remove" onclick="hapusOp('${jsStr(it.id)}')" title="Hapus">✕</button></div>`).join('')
    : '<p style="font-size:13px;color:#999">Belum ada barang. Cari / scan barang di atas, atau tambah satu kategori / barang terlama.</p>'
  renderJumlahOp()
}
window.kirimOpname = async () => {
  const d = drafOp(); ubahDrafOp(); const dd = drafOp()
  if (!d.items.length) return toast('Belum ada barang yang dihitung', 'error')
  const kosong = d.items.filter(x => x.hitung === ''); if (kosong.length) return toast(`${kosong.length} barang belum diisi jumlahnya (kotak kuning). Isi 0 bila tidak ada.`, 'error')
  if (!dd.area.trim() && !confirm('Rak / area belum diisi. Tetap kirim?')) return
  const btn = document.getElementById('op-kirim'); btn.disabled = true
  try {
    const items = d.items.map(it => { const p = stokAllData.find(x => x.id === it.id) || {}; return { id: it.id, sku: it.sku, nama: it.nama, sistem: stokLok(p, dd.lokasi), hitung: +it.hitung, modal: modalP(p) } })
    await addDoc(collection(db, 'opname'), { tanggal: hariIni(), lokasi: dd.lokasi, area: dd.area.trim(), catatan: dd.catatan || '', oleh: window._harmoniUserName || '', status: 'menunggu', items, created_at: serverTimestamp() })
    simpanDrafOp({ lokasi: dd.lokasi, area: '', catatan: '', items: [] }); document.getElementById('op-area').value = ''; document.getElementById('op-cat').value = ''
    toast(`✅ ${items.length} barang dikirim — menunggu persetujuan Owner`); renderDrafOp(); await muatSesiOp()
  } catch (e) { toast('Gagal mengirim: ' + e.message, 'error') } finally { btn.disabled = false; renderJumlahOp() }
}
// Stok baru = hitungan + perubahan stok sistem sejak dihitung (penjualan / upload Olsera setelah hitung)
const stokBaruOp = (it, lok) => { const p = stokAllData.find(x => x.id === it.id); const kini = p ? stokLok(p, lok) : it.sistem; return { kini, baru: Math.max(0, it.hitung + (kini - it.sistem)) } }
function renderTungguOp() {
  const box = document.getElementById('op-tunggu'); if (!box) return
  const list = _opSesi.filter(s => s.status === 'menunggu'), own = isOwnerSM()
  box.innerHTML = list.length ? list.map(s => { const i = _opSesi.indexOf(s), beda = s.items.filter(x => x.hitung !== x.sistem), rpSel = s.items.reduce((t, x) => t + (x.hitung - x.sistem) * (x.modal || 0), 0)
    return `<div class="po-kartu"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${s.lokasi === 'gudang' ? '🏬 Gudang' : '🏪 Toko'}${s.area ? ' · ' + esc(s.area) : ''}</b>
      <div style="font-size:12px;color:#666">${esc(s.tanggal)} · dihitung ${esc(s.oleh || '-')} · ${s.items.length} barang${own ? ` · <b style="color:${beda.length ? '#b91c1c' : '#166534'}">${beda.length ? beda.length + ' selisih (' + (rpSel >= 0 ? '+' : '−') + rpS(Math.abs(rpSel)) + ')' : 'semua cocok ✓'}</b>` : ''}${s.catatan ? ' · 📝 ' + esc(s.catatan) : ''}</div></div>
      ${own ? `<button class="btn btn-secondary btn-sm" onclick="bukaSetujuOp(${i})">Periksa & setujui</button>` : '<span class="bl-tag" style="background:#eff6ff;color:#1e40af">menunggu Owner</span>'}</div><div id="op-s-${i}"></div></div>` }).join('')
    : '<p style="font-size:13px;color:#999">Tidak ada opname yang menunggu.</p>'
}
window.bukaSetujuOp = i => {
  const s = _opSesi[i], el = document.getElementById('op-s-' + i); if (!s || !el || !isOwnerSM()) return
  if (el.innerHTML) { el.innerHTML = ''; return }
  const urut = s.items.map((x, j) => ({ x, j })).sort((a, b) => Math.abs((b.x.hitung - b.x.sistem) * (b.x.modal || 1)) - Math.abs((a.x.hitung - a.x.sistem) * (a.x.modal || 1)))
  el.innerHTML = `<div style="border-top:1px dashed #cbd5e1;margin-top:10px;padding-top:10px"><table style="width:100%"><thead><tr><th></th><th style="text-align:left">Barang</th><th>Sistem<br><span style="font-weight:400;font-size:10px">(Olsera)</span></th><th>Hitung</th><th>Selisih</th></tr></thead><tbody>
    ${urut.map(({ x, j }) => { const sel = x.hitung - x.sistem, { kini, baru } = stokBaruOp(x, s.lokasi)
      return `<tr style="${sel ? '' : 'color:#94a3b8'}"><td><input type="checkbox" id="op-c-${i}-${j}" ${sel ? 'checked' : ''} ${sel ? '' : 'disabled'}></td><td>${esc(x.nama)}<div style="font-size:11px;color:#666">${esc(x.sku)}${kini !== x.sistem ? ` · <span style="color:#92400e">stok sistem berubah ${num(x.sistem)}→${num(kini)} sejak dihitung → jadi ${num(baru)}</span>` : ''}</div></td>
        <td class="number">${num(x.sistem)}</td><td class="number"><b>${num(x.hitung)}</b></td><td class="number" style="font-weight:700;color:${sel < 0 ? '#b91c1c' : sel > 0 ? '#1e40af' : 'inherit'}">${sel > 0 ? '+' : ''}${num(sel)}${sel && x.modal ? `<div style="font-size:10.5px;font-weight:400;white-space:nowrap">${sel > 0 ? '+' : '−'}${rpS(Math.abs(sel * x.modal))}</div>` : ''}</td></tr>` }).join('')}</tbody></table>
    <p style="font-size:11px;color:#666;margin:6px 0">Yang dicentang: stok di Stok Manager diganti hasil hitung. Semua barang di daftar ini dicatat "sudah dihitung" hari ini. Selisih minus = barang hilang/rusak/salah input.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="op-ok-${i}" onclick="setujuiOp(${i})">✅ Setujui</button><button class="btn btn-sm" style="background:#fee2e2;color:#991b1b" onclick="tolakOp(${i})">↩ Tolak — hitung ulang</button></div></div>`
}
window.setujuiOp = async i => {
  const s = _opSesi[i]; if (!s || !isOwnerSM()) return
  const btn = document.getElementById('op-ok-' + i); btn.disabled = true; btn.textContent = 'Menyimpan…'
  try {
    const items = s.items.map((x, j) => ({ ...x, dipakai: !!document.getElementById(`op-c-${i}-${j}`)?.checked }))
    let n = 0
    for (const x of items) {
      const p = stokAllData.find(q => q.id === x.id); if (!p) continue
      const up = { ['opname_' + s.lokasi]: s.tanggal }
      if (x.dipakai) { x.stok_baru = stokBaruOp(x, s.lokasi).baru; up['stock_qty_' + s.lokasi] = x.stok_baru; n++ }
      await updateDoc(doc(db, 'products', p.id), { ...up, updated_at: serverTimestamp() }); Object.assign(p, up)
      if (x.dipakai) sinkronStokKeAnalitik(p.sku || p.id, s.lokasi, x.stok_baru)
    }
    const selisih_rp = items.filter(x => x.dipakai).reduce((t, x) => t + (x.hitung - x.sistem) * (x.modal || 0), 0)
    await updateDoc(doc(db, 'opname', s.id), { status: 'disetujui', items, selisih_rp, disetujui_oleh: window._harmoniUserName || '', disetujui_at: serverTimestamp() })
    toast(`✅ Opname disetujui · ${n} stok diperbarui. Sesuaikan juga di Olsera (unduh CSV di Riwayat).`); invalidateDashboard(); _bh = null
    await muatSesiOp(); renderLamaOp()
  } catch (e) { toast('Gagal: ' + e.message, 'error'); btn.disabled = false; btn.textContent = '✅ Setujui' }
}
window.tolakOp = async i => { const s = _opSesi[i]; if (!s || !isOwnerSM()) return; const a = prompt('Alasan ditolak / yang perlu dihitung ulang:'); if (a === null) return
  try { await updateDoc(doc(db, 'opname', s.id), { status: 'ditolak', alasan_tolak: a.trim(), disetujui_oleh: window._harmoniUserName || '', disetujui_at: serverTimestamp() }); toast('Opname ditolak — staff perlu hitung ulang'); await muatSesiOp() } catch (e) { toast('Gagal: ' + e.message, 'error') } }
window.hitungUlangOp = i => { const s = _opSesi[i]; if (!s) return; const d = drafOp()
  if (d.items.length && !confirm('Daftar hitung sekarang akan diganti dengan barang dari opname ini. Lanjut?')) return
  simpanDrafOp({ lokasi: s.lokasi, area: s.area || '', catatan: '', items: s.items.map(x => ({ id: x.id, sku: x.sku, nama: x.nama, hitung: '' })) }); loadOpname(); scrollTo({ top: 0, behavior: 'smooth' }); toast('Barang dimasukkan ke daftar hitung — hitung ulang lalu kirim') }
function renderRiwayatOp() {
  const box = document.getElementById('op-riwayat'); if (!box) return
  const list = _opSesi.filter(s => s.status !== 'menunggu').slice(0, 30), own = isOwnerSM()
  box.innerHTML = list.length ? list.map(s => { const i = _opSesi.indexOf(s), dip = (s.items || []).filter(x => x.dipakai)
    return `<div class="po-kartu" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:start"><div>
      <b>${s.lokasi === 'gudang' ? '🏬 Gudang' : '🏪 Toko'}${s.area ? ' · ' + esc(s.area) : ''}</b> ${s.status === 'disetujui' ? '<span class="bl-tag" style="background:#dcfce7;color:#166534">disetujui</span>' : '<span class="bl-tag" style="background:#fee2e2;color:#991b1b">ditolak</span>'}
      <div style="font-size:12px;color:#666">${esc(s.tanggal)} · ${esc(s.oleh || '-')} · ${(s.items || []).length} barang${s.status === 'disetujui' && own ? ` · ${dip.length} disesuaikan · selisih <b style="color:${(s.selisih_rp || 0) < 0 ? '#b91c1c' : '#166534'}">${(s.selisih_rp || 0) < 0 ? '−' : '+'}${rpS(Math.abs(s.selisih_rp || 0))}</b>` : ''}${s.alasan_tolak ? ' · alasan: ' + esc(s.alasan_tolak) : ''}${s.disetujui_oleh ? ' · oleh ' + esc(s.disetujui_oleh) : ''}</div></div>
      <div style="display:flex;gap:6px">${s.status === 'ditolak' ? `<button class="btn btn-primary btn-sm" onclick="hitungUlangOp(${i})">🔁 Hitung ulang</button>` : ''}${s.status === 'disetujui' && own && dip.length ? `<button class="btn btn-secondary btn-sm" onclick="csvOlseraOp(${i})">⬇️ CSV untuk Olsera</button>` : ''}</div></div></div>` }).join('')
    : '<p style="font-size:13px;color:#999">Belum ada riwayat.</p>'
}
window.csvOlseraOp = i => { const s = _opSesi[i]; if (!s) return
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, rows = [['SKU', 'Nama', 'Lokasi', 'Stok sistem saat hitung', 'Hasil hitung', 'Selisih', 'Stok baru']]
  s.items.filter(x => x.dipakai).forEach(x => rows.push([x.sku, x.nama, s.lokasi, x.sistem, x.hitung, x.hitung - x.sistem, x.stok_baru ?? x.hitung]))
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = `opname_${s.lokasi}_${s.tanggal}${s.area ? '_' + s.area.replace(/\W+/g, '_') : ''}.csv`; a.click() }
function barangLamaOp(lok, hari) { const batas = tambahHari(hariIni(), -hari)
  return stokAllData.filter(p => diLokasi(p, lok) && (!p['opname_' + lok] || p['opname_' + lok] < batas)).sort((a, b) => (!!a['opname_' + lok]) - (!!b['opname_' + lok]) || stokLok(b, lok) * modalP(b) - stokLok(a, lok) * modalP(a)) }
window.renderLamaOp = () => {
  const box = document.getElementById('op-lama'); if (!box) return
  const lok = document.getElementById('op-lama-lok').value, hari = +document.getElementById('op-hari').value, list = barangLamaOp(lok, hari), own = isOwnerSM()
  const nilai = list.reduce((t, p) => t + Math.max(0, stokLok(p, lok)) * modalP(p), 0), tot = stokAllData.filter(p => diLokasi(p, lok)).length
  box.innerHTML = `<p style="font-size:13px;margin-bottom:8px"><b>${num(list.length)}</b> dari ${num(tot)} barang ${lok} belum dihitung &gt;${hari} hari${own ? ` · nilai stok ±<b>${rpS(nilai)}</b>` : ''}. Paling atas = belum pernah dihitung & nilai stok terbesar.</p>`
    + list.slice(0, 50).map(p => `<div class="op-baris" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><b>${esc(namaProduk(p))}</b><div style="font-size:11px;color:#666">${esc(p.sku || p.id)} · ${p['opname_' + lok] ? 'terakhir ' + esc(p['opname_' + lok]) : '<span style="color:#b91c1c">belum pernah</span>'}${own ? ' · stok ' + num(stokLok(p, lok)) : ''}</div></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('op-lokasi').value='${lok}';ubahDrafOp();tambahOp('${jsStr(p.id)}');scrollTo({top:0,behavior:'smooth'})">+ Hitung</button></div>`).join('')
    + (list.length > 50 ? `<p style="font-size:12px;color:#666;margin-top:6px">… dan ${num(list.length - 50)} lagi.</p>` : '')
}
function renderRingkasOp() {
  const box = document.getElementById('op-ringkas'); if (!box) return
  const tunggu = _opSesi.filter(s => s.status === 'menunggu').length, own = isOwnerSM(), batas = tambahHari(hariIni(), -30)
  const lt = barangLamaOp('toko', 30).length, lg = barangLamaOp('gudang', 30).length
  const sel30 = _opSesi.filter(s => s.status === 'disetujui' && s.tanggal >= batas).reduce((t, s) => t + (s.selisih_rp || 0), 0)
  const kartu = (ikon, judul, val, sub, bg, fg) => `<div class="ringkas-kartu" style="background:${bg};color:${fg};cursor:default"><div class="rk-ikon">${ikon} ${judul}</div><div class="rk-val">${val}</div><div class="rk-sub">${sub}</div></div>`
  box.innerHTML = `<div class="ringkas-grid" style="margin-bottom:14px">${kartu('✅', 'Menunggu persetujuan', num(tunggu), own ? 'periksa di bawah' : 'menunggu Owner', '#eff6ff', '#1e40af')}
    ${kartu('🏪', 'Toko >30 hari', num(lt) + ' barang', 'belum dihitung', '#fff7ed', '#9a3412')}${kartu('🏬', 'Gudang >30 hari', num(lg) + ' barang', 'belum dihitung', '#fff7ed', '#9a3412')}
    ${own ? kartu('⚖️', 'Selisih 30 hari', (sel30 < 0 ? '−' : '+') + rpS(Math.abs(sel30)), 'nilai modal, opname disetujui', sel30 < 0 ? '#fef2f2' : '#ecfdf5', sel30 < 0 ? '#991b1b' : '#166534') : ''}</div>`
}

// Tautan langsung ke halaman, mis. …/harmoni-stok-manager/#belanja (dari Analitik)
document.addEventListener('harmoni-login', () => { const h = location.hash.slice(1); if (h) document.querySelector(`.nav-item[data-page="${CSS.escape(h)}"]`)?.click() }, { once: true })

// ── RIWAYAT HARGA MODAL ────────────────────────────────────────────────────
// riwayat_modal = { sku, nama, lokasi, lama, baru, sumber, status:'terdeteksi'|'diisi'|'dipakai'|'diabaikan'|'diubah', oleh, tgl, at }
async function catatModal(list) {   // list: [{sku, nama, lokasi, lama, baru, sumber, status}]
  const isi = (list || []).filter(x => x && x.sku && +x.baru !== +x.lama); if (!isi.length) return
  try { for (let i = 0; i < isi.length; i += 400) { const b = writeBatch(db); isi.slice(i, i + 400).forEach(x => b.set(doc(collection(db, 'riwayat_modal')), { ...x, sku: String(x.sku).toUpperCase(), lama: +x.lama || 0, baru: +x.baru || 0, oleh: window._harmoniUserName || '', tgl: hariIni(), at: serverTimestamp() })); await b.commit() } }
  catch (e) { console.warn('riwayat modal', e) }
}
const persenUbah = (lama, baru) => lama > 0 ? Math.round((baru - lama) / lama * 1000) / 10 : null
const labelUbah = (lama, baru) => { const pc = persenUbah(lama, baru); return baru > lama ? `<b style="color:#b91c1c">▲ ${rp(baru - lama)}${pc != null ? ' (+' + pc + '%)' : ''}</b>` : baru < lama ? `<b style="color:#166534">▼ ${rp(lama - baru)}${pc != null ? ' (' + pc + '%)' : ''}</b>` : '' }
window.lihatRiwayatModal = async sku => {
  const K = String(sku).toUpperCase(), p = (stokAllData.length ? stokAllData : await produkSemua()).find(x => String(x.sku || x.id).toUpperCase() === K)
  document.getElementById('modal-riwayat')?.remove()
  const bg = document.createElement('div'); bg.id = 'modal-riwayat'
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px'
  bg.onclick = e => { if (e.target === bg) bg.remove() }
  bg.innerHTML = '<div style="background:#fff;border-radius:16px;padding:18px;max-width:560px;width:100%;max-height:88vh;overflow:auto"><div class="loading"><div class="spinner"></div><span>Memuat riwayat…</span></div></div>'
  document.body.appendChild(bg)
  let list = []
  try { list = (await getDocs(query(collection(db, 'riwayat_modal'), where('sku', '==', K)))).docs.map(d => d.data()).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0) || String(b.tgl).localeCompare(String(a.tgl))) } catch (e) { console.warn(e) }
  const ST = { terdeteksi: ['🔔 terdeteksi', '#fff7ed', '#9a3412'], diisi: ['➕ diisi', '#eff6ff', '#1e40af'], dipakai: ['✅ dipakai', '#dcfce7', '#166534'], diabaikan: ['🚫 diabaikan', '#f1f5f9', '#475569'], diubah: ['✏️ diubah', '#ecfdf5', '#065f46'] }
  bg.firstChild.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><div style="font-size:16px;font-weight:800">🕘 Riwayat harga modal</div><div style="font-size:12px;color:#666">${esc(p ? namaProduk(p) : '')} · ${esc(K)}</div></div><button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-riwayat').remove()">✕</button></div>
    <div style="font-size:13px;margin:10px 0">Modal sekarang: <b>${p ? rp(modalP(p)) : '—'}</b>${p && +p.buy_price_toko > 0 && +p.buy_price_gudang > 0 && +p.buy_price_toko !== +p.buy_price_gudang ? ` <span style="color:#666">(toko ${rp(p.buy_price_toko)} · gudang ${rp(p.buy_price_gudang)})</span>` : ''}${p && +p.modal_baru_olsera > 0 ? `<div style="margin-top:4px;color:#9a3412">🔔 Olsera: ${rp(p.modal_baru_olsera)} — belum dipakai</div>` : ''}</div>
    ${list.length ? `<table style="width:100%"><thead><tr><th style="text-align:left">Tanggal</th><th style="text-align:left">Perubahan</th><th style="text-align:left">Sumber</th></tr></thead><tbody>${list.map(x => { const st = ST[x.status] || [x.status || '', '#f1f5f9', '#475569']
      return `<tr><td style="font-size:12px;white-space:nowrap">${esc(x.tgl || '')}</td><td style="font-size:12px">${x.lama ? rp(x.lama) : '—'} → <b>${rp(x.baru)}</b><div>${labelUbah(+x.lama, +x.baru)}</div></td><td style="font-size:11px"><span class="badge-jenis" style="background:${st[1]};color:${st[2]}">${st[0]}</span><div style="color:#666">${esc(x.sumber || '')}${x.lokasi ? ' · ' + esc(x.lokasi) : ''}${x.oleh ? ' · ' + esc(x.oleh) : ''}</div></td></tr>` }).join('')}</tbody></table>`
      : '<p style="font-size:13px;color:#999">Belum ada riwayat perubahan modal (riwayat mulai tercatat sejak fitur ini aktif).</p>'}`
}
