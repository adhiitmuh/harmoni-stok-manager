# Harmoni Stok Manager

Stok toko/gudang, modal (HPP), nota & harga supplier. Vanilla JS: `index.html` + `js/app.js` (ES module) + `css/style.css`.
Auth lewat Portal (`harmoni-indonesia`, compat SDK, `window._harmoniAuthApp`, akses `apps.harmoni_stok`).
Data utama di project **harmoni-stok** (modular SDK, `js/firebase-config.js`, rules terbuka).
Aturan kerja lintas app: lihat `harmoni-indonesia/CLAUDE.md`. Naikkan `?v=` di link CSS bila CSS berubah.

## Koleksi (harmoni-stok)
- `products/{SKU}` — sku, name, variant_names, category, lokasi[], stock_qty_toko/gudang, buy_price_toko/gudang (modal), pos_sell_price, supplier (utama), modal_baru_olsera (tanda modal naik >10%)
- `nota` — {supplier, tanggal, no_invoice, jenis:'nota'|'penawaran'|'catatan', items:[{nama_barang, sku?, qty, harga_satuan}]}
- `supplier/{ID}` — {nama, lama (hari kirim), wa, catatan}
- `cocok_nota/{kunci nama}` — {nama, sku|null, status:'cocok'|'otomatis'|'abaikan'} jawaban konfirmasi nama nota ↔ produk (tidak ditanya lagi)
- `kualitas/{SKU__SUP}` — {sku, supplier, nilai 1–5, catatan}
- `musim/{id}` — {nama, mulai:'MM-DD', selesai:'MM-DD', faktor, ingat (minggu), kata:'A, B', sku[], catatan} berulang tiap tahun; sejak `ingat` minggu sebelum mulai s/d selesai, laku barang cocok (sku/kata di nama+kategori) = max(laku, laku bulan biasa × faktor) di Daftar Belanja + kartu pengingat Dashboard. "Cari dari data penjualan" = barang yang terjual ≥1,5× di bulan musim (riwayat `penjualan_operator`, label bulan 'Nov-26').
- `po` — {supplier, tanggal, lama, perkiraan_datang, status:'dipesan'|'datang'|'batal', items:[{sku, nama, nama_sup, qty, harga}], total, terima[], nota_id}

## Sinkron dengan Analitik (project harmoni-indonesia `settings/*`)
- Simpan stok / upload Olsera → `stok_fisik`; upload stok di Analitik → menulis `products` (hanya yang berubah; modal manual tidak ditimpa 0).
- Dashboard / simpan HPP / supplier / kualitas → `modal_produk` (m, s, sup, h).
- Laku/bln dibaca dari `penjualan_operator` (rata-rata 3 bulan; 6 bulan untuk "barang mati").

## Halaman
Dashboard (ringkasan keputusan: penjualan hilang, toko kosong gudang ada, modal tertahan, modal naik, margin tipis) ·
Input Nota/Harga (jenis, tempel daftar harga, pilih produk) · Isi HPP · Upload Olsera · Update Stok (filter kondisi, supplier per barang, set massal) ·
Supplier (lama kirim, usulan dari nota, rata-rata kualitas) · Banding Harga (antrean konfirmasi, harga per supplier, kualitas, jadikan utama) ·
Belanja (budget → prioritas kosong&laku lalu untung/Rp modal; butuh = laku×lama stok + laku selama kirim − stok − sudah di-PO, atau Final Order; supplier rekomendasi/utama/tercepat; PO per supplier via link WA + cetak; Barang datang → nota + stok + modal) · Rekonsiliasi.
Kalender musim ada di halaman Belanja. Menu bawah HP bisa digeser (9 menu).

## Rencana berikutnya
6 opname (staff hitung, Owner setujui).
