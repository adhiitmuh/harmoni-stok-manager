"""
Sync data Olsera (Excel) → Firebase Firestore
Jalankan sekali untuk upload awal, lalu setiap ada update data dari Olsera.

Install dulu: pip3 install firebase-admin pandas openpyxl rapidfuzz
"""

import pandas as pd
import os
import json
from rapidfuzz import process, fuzz
import firebase_admin
from firebase_admin import credentials, firestore

GUDANG_DIR  = '/Users/adhiitmuh/Downloads/Data Stok Gudang HI '
TOKO_DIR    = '/Users/adhiitmuh/Downloads/Data Stok Toko HI'
NOTA_FILE   = '/Users/adhiitmuh/Downloads/Rekap_Nota_Pembelian_Harmonis.xlsx'
MASTER_NOTA = os.path.join(os.path.dirname(__file__), '..', 'sync', 'master_nota_cache.xlsx')

# ── Firebase init ──────────────────────────────────────────────────────────
# Letakkan file serviceAccountKey.json di folder sync/
KEY_FILE = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')

def init_firebase():
    if not firebase_admin._apps:
        if not os.path.exists(KEY_FILE):
            print("ERROR: File serviceAccountKey.json tidak ditemukan di folder sync/")
            print("Download dari: Firebase Console → Project Settings → Service accounts → Generate new private key")
            exit(1)
        cred = credentials.Certificate(KEY_FILE)
        firebase_admin.initialize_app(cred)
    return firestore.client()


# ── Load data ──────────────────────────────────────────────────────────────
def load_olsera(folder):
    frames = []
    for f in sorted(os.listdir(folder)):
        if f.endswith('.xlsx'):
            frames.append(pd.read_excel(os.path.join(folder, f)))
    df = pd.concat(frames, ignore_index=True).dropna(how='all')
    df['sku']  = df['sku'].astype(str).str.strip().str.upper()
    df['name'] = df['name'].astype(str).str.strip().str.upper()
    return df


def load_nota():
    src = NOTA_FILE
    if os.path.exists(MASTER_NOTA):
        src = MASTER_NOTA
    df = pd.read_excel(src, sheet_name='Nota Pembelian' if src == NOTA_FILE else 0)
    df.columns = df.columns.str.strip()
    df = df.dropna(subset=['Nama Barang', 'Harga Satuan'])
    df['nama_upper'] = df['Nama Barang'].astype(str).str.upper().str.strip()
    df['hpp']        = pd.to_numeric(df['Harga Satuan'], errors='coerce').fillna(0)
    if 'Tanggal' in df.columns:
        df['Tanggal'] = pd.to_datetime(df['Tanggal'], errors='coerce')
        df = df.sort_values('Tanggal', ascending=False)
    return df.drop_duplicates(subset='nama_upper', keep='first')


def get_hpp_match(name, nota_df):
    result = process.extractOne(
        name, nota_df['nama_upper'].tolist(),
        scorer=fuzz.token_sort_ratio, score_cutoff=70
    )
    if result:
        matched, score, _ = result
        row = nota_df[nota_df['nama_upper'] == matched].iloc[0]
        return row['hpp'], matched, score, str(row.get('Supplier', ''))
    return 0, '', 0, ''


# ── Merge gudang + toko ────────────────────────────────────────────────────
def merge_products(gudang, toko):
    g_keys = set(gudang['sku'])
    t_keys = set(toko['sku'])

    records = {}

    for _, r in gudang.iterrows():
        sku = r['sku']
        records[sku] = {
            'sku'              : sku,
            'name'             : r['name'],
            'category'         : str(r.get('category', '') or ''),
            'variant_label'    : str(r.get('variant_label', '') or ''),
            'variant_names'    : str(r.get('variant_names', '') or ''),
            'stock_qty_gudang' : float(r.get('stock_qty', 0) or 0),
            'buy_price_gudang' : float(r.get('buy_price', 0) or 0),
            'pos_sell_price'   : float(r.get('pos_sell_price', 0) or 0),
            'lokasi'           : ['gudang'],
        }

    for _, r in toko.iterrows():
        sku = r['sku']
        if sku in records:
            records[sku]['stock_qty_toko'] = float(r.get('stock_qty', 0) or 0)
            records[sku]['buy_price_toko'] = float(r.get('buy_price', 0) or 0)
            records[sku]['lokasi']         = ['gudang', 'toko']
            if records[sku]['name'] != r['name']:
                records[sku]['name_gudang'] = records[sku]['name']
                records[sku]['name_toko']   = r['name']
        else:
            records[sku] = {
                'sku'            : sku,
                'name'           : r['name'],
                'category'       : str(r.get('category', '') or ''),
                'variant_label'  : str(r.get('variant_label', '') or ''),
                'variant_names'  : str(r.get('variant_names', '') or ''),
                'stock_qty_toko' : float(r.get('stock_qty', 0) or 0),
                'buy_price_toko' : float(r.get('buy_price', 0) or 0),
                'pos_sell_price' : float(r.get('pos_sell_price', 0) or 0),
                'lokasi'         : ['toko'],
            }

    return list(records.values())


# ── Upload ke Firestore ────────────────────────────────────────────────────
def upload_products(db, products, nota_df):
    col = db.collection('products')
    batch_size = 400
    total = len(products)
    print(f"Upload {total:,} produk ke Firestore...")

    for i in range(0, total, batch_size):
        batch = db.batch()
        chunk = products[i:i+batch_size]

        for p in chunk:
            hpp_g, nama_nota_g, skor_g, sup_g = get_hpp_match(p['name'], nota_df)

            # Status HPP gudang
            has_hpp_g = p.get('buy_price_gudang', 0) > 0
            has_hpp_t = p.get('buy_price_toko', 0) > 0

            if not has_hpp_g or not has_hpp_t:
                p['hpp_suggestion']          = hpp_g
                p['hpp_suggestion_nama_nota'] = nama_nota_g
                p['hpp_suggestion_score']     = skor_g
                p['hpp_suggestion_supplier']  = sup_g
                p['hpp_status'] = ('AUTO' if skor_g >= 85 else
                                   'CEK'  if skor_g >= 70 else 'MANUAL')
            else:
                p['hpp_status'] = 'OK'

            ref = col.document(p['sku'])
            batch.set(ref, p, merge=True)

        batch.commit()
        print(f"  {min(i+batch_size, total):,}/{total:,} selesai")

    print("Upload produk selesai!")


def upload_nota(db, nota_src):
    """Upload nota awal dari file Excel ke Firestore."""
    df = pd.read_excel(nota_src, sheet_name='Nota Pembelian')
    df.columns = df.columns.str.strip()
    df = df.dropna(subset=['Nama Barang'])

    col   = db.collection('nota')
    batch = db.batch()
    count = 0

    for _, r in df.iterrows():
        doc_ref = col.document()
        batch.set(doc_ref, {
            'tanggal'    : str(r.get('Tanggal', '') or ''),
            'no_invoice' : str(r.get('No. Invoice', '') or ''),
            'supplier'   : str(r.get('Supplier', '') or ''),
            'items'      : [{
                'nama_barang'  : str(r.get('Nama Barang', '')),
                'qty'          : float(r.get('Qty', 0) or 0),
                'harga_satuan' : float(r.get('Harga Satuan', 0) or 0),
            }],
            'created_at' : firestore.SERVER_TIMESTAMP,
        })
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()

    if count % 400 != 0:
        batch.commit()

    print(f"Upload {count} nota selesai!")


# ── Main ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=== Sync Olsera → Firestore ===\n")
    db = init_firebase()

    print("Memuat data Excel...")
    gudang   = load_olsera(GUDANG_DIR)
    toko     = load_olsera(TOKO_DIR)
    nota_df  = load_nota()

    print(f"  Gudang: {len(gudang):,} | Toko: {len(toko):,} | Nota: {len(nota_df):,} item")

    print("\nMenggabungkan data produk...")
    products = merge_products(gudang, toko)
    print(f"  Total produk unik: {len(products):,}")

    upload_products(db, products, nota_df)

    print("\nMengupload riwayat nota...")
    upload_nota(db, NOTA_FILE)

    print("\n✅ Sync selesai! Buka web app untuk melihat hasilnya.")
