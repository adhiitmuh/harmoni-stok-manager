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
- `musim/{id}` — {nama, mulai:'MM-DD', selesai:'MM-DD', faktor, ingat (minggu), mode:'faktor'|'tahunlalu', kata:'A, B', sku[], catatan}. Mode `tahunlalu` (seragam sekolah): sejak masa persiapan, target belanja = total terjual di bulan musim 12 bulan terakhir × faktor (minimal kebutuhan biasa); template Tahun ajaran = 06-01..07-31, disiapkan 34 minggu (±8 bln). berulang tiap tahun; sejak `ingat` minggu sebelum mulai s/d selesai, laku barang cocok (sku/kata di nama+kategori) = max(laku, laku bulan biasa × faktor) di Daftar Belanja + kartu pengingat Dashboard. "Cari dari data penjualan" = barang yang terjual ≥1,5× di bulan musim (riwayat `penjualan_operator`, label bulan 'Nov-26').
- `opname` — {tanggal, lokasi, area, oleh, status:'menunggu'|'disetujui'|'ditolak', catatan, items:[{id, sku, nama, sistem, hitung, modal, dipakai, stok_baru}], selisih_rp, alasan_tolak}. Hitung buta (staff tidak melihat stok sistem); Owner (`window._harmoniIsOwner`, UI saja — rules harmoni-stok terbuka) menyetujui: stok baru = hitung + (stok kini − sistem saat hitung), set `products.opname_toko/gudang` = tanggal, sinkron stok_fisik; CSV untuk disesuaikan di Olsera. Draf hitung di localStorage `op_draf`.
- `riwayat_modal` — {sku, nama, lokasi, lama, baru, sumber, status:'terdeteksi'|'diisi'|'dipakai'|'diabaikan'|'diubah', oleh, tgl} — setiap perubahan modal (upload Olsera di Analitik/Stok Manager, Isi HPP, Pakai/Abaikan, nota barang datang). Modal Olsera berbeda berapa pun → `modal_baru_olsera` (+`modal_baru_lama`, `modal_baru_lokasi`) ditandai, modal tidak ditimpa sampai Owner Pakai/Abaikan. 🕘 di Update Stok = riwayat per barang.
- `po` — {supplier, tanggal, lama, perkiraan_datang, status:'dipesan'|'datang'|'batal', items:[{sku, nama, nama_sup, qty, harga}], total, terima[], nota_id}
- `resep_custom/{id}` — {kata:'US KECIL, …', bahan:[{sku, nama, qty per pcs}]} bahan barang custom. Jenis custom (dari `penjualan_custom_ringkas/{YYYY-MM}` project harmoni-indonesia, ditulis Analitik tab 🧵) dicocokkan ke resep dengan kata kunci terpanjang yang terkandung di nama jenis; kebutuhan bahan/bln = rata-rata qty jenis (N bulan pilihan Belanja) × qty per pcs → ditambahkan ke laku/bln bahan di Daftar Belanja (tag 🧵). Kartu "🧵 Bahan barang custom" di halaman Belanja.

## Pesanan outlet (project harmoni-indonesia `outlet_pesanan`)
- Kartu "📥 Pesanan dari outlet" di Belanja: pesanan cabang/titik (dibuat di Analitik mode outlet) → Kirim (qty kirim, opsi kurangi stok gudang lalu toko HQ) / Tolak (alasan). Qty pesanan yang masih `diajukan` ditambahkan ke kebutuhan Daftar Belanja (tag 📥). Rules: staf HQ = akses harmoni_stok tanpa `apps.harmoni_analitik.outlet`.

## Sinkron dengan Analitik (project harmoni-indonesia `settings/*`)
- Simpan stok / upload Olsera → `stok_fisik`; upload stok di Analitik → menulis `products` (hanya yang berubah; modal manual tidak ditimpa 0).
- Dashboard / simpan HPP / supplier / kualitas → `modal_produk` (m, s, sup, h).
- Laku/bln dibaca dari `penjualan_operator` (rata-rata 3 bulan; 6 bulan untuk "barang mati").

## Halaman
Dashboard (ringkasan keputusan: penjualan hilang, toko kosong gudang ada, modal tertahan, modal naik, margin tipis) ·
Input Nota/Harga (jenis, tempel daftar harga, pilih produk) · Isi HPP · Upload Olsera · Update Stok (filter kondisi, supplier per barang, set massal) ·
Supplier (lama kirim, usulan dari nota, rata-rata kualitas) · Banding Harga (antrean konfirmasi, harga per supplier, kualitas, jadikan utama) ·
Belanja (budget → prioritas kosong&laku lalu untung/Rp modal; butuh = laku×lama stok + laku selama kirim − stok − sudah di-PO, atau Final Order; supplier rekomendasi/utama/tercepat; PO per supplier via link WA + cetak; Barang datang → nota + stok + modal) · Rekonsiliasi.
Opname (hitung, scan +1, setujui/tolak, lama belum dihitung). Kalender musim (persiapan diisi dalam bulan, disimpan minggu `ingat`; template Tahun ajaran 10 bulan) & 🗓️ Kalender laku (pola laku Jan–Des per kata kunci/kategori dari riwayat Analitik, puncak = bulan tertinggi + tetangga ≥1,5× rata-rata, tombol Jadikan musim) ada di halaman Belanja. Baris Belanja: angka dalam kotak `.bl-stat`. Menu bawah HP bisa digeser (10 menu).

