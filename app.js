'use strict';

/* =====================================================================
   KOPI KASIR (POS) — app.js
   Struktur:
   1. Konfigurasi
   2. Helper umum
   3. State
   4. Data layer (semua akses Supabase ada di sini)
   5. Tampilan: gambar, navigasi, login
   6. Pesanan, Pembayaran, Rekap, Kelola Menu
   7. Inisialisasi
   ===================================================================== */

/* ========== 1. KONFIGURASI ========== */
const SUPABASE_URL = 'https://pkjrozyoknngefxnlikc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OyTdRRjTU78o7jK7iLm7AA_mnFaUv4k';
const DEFAULT_PIN = '1234'; // PIN pemilik (sementara; lihat catatan keamanan)

const db = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

/* ========== 2. HELPER UMUM ========== */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const rp  = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const num = s => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ymd = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// Storage aman (fallback ke memori kalau localStorage/sessionStorage diblokir)
const makeStore = (name, fallback = {}) => ({
  get: k => { try { return window[name].getItem(k); } catch { return fallback[k] ?? null; } },
  set: (k, v) => { try { window[name].setItem(k, v); } catch { fallback[k] = v; } },
  del: k => { try { window[name].removeItem(k); } catch { delete fallback[k]; } },
});
const LS = makeStore('localStorage');
const SS = makeStore('sessionStorage');
const load = (k, d) => { try { return JSON.parse(LS.get(k)) ?? d; } catch { return d; } };

/* ========== 3. STATE ========== */
const DEFAULT_MENU = (() => {
  const P = (nama, kategori, harga) => ({
    nama, kategori, harga, tersedia: true,
    foto_url: 'images/' + nama.toLowerCase().replace(/\W+/g, '-'),
  });
  const kopi = [
    ['Americano', 12000], ['Berry Americano', 17000], ['Orange Americano', 17000],
    ['Cappucino', 12000], ['Butterscotch Latte', 17000], ['Spanish Latte', 17000],
    ['Aren Latte', 17000], ['Caramel Macchiato', 17000], ['Pandan Latte', 17000],
    ['Pistachio Latte', 17000], ['Matcha Espresso', 22000], ['Sea Salt Americano', 17000],
    ['Butterscotch Sea Salt Latte', 22000], ['Caramel Sea Salt Latte', 22000],
    ['Matcha Espresso Sea Salt Latte', 25000],
  ];
  const nonKopi = [
    ['Chocolatte', 12000], ['Hazelnut', 17000], ['Thai Tea', 12000], ['Taro', 17000],
    ['Cotton Candy', 17000], ['Milk Tea', 17000], ['Oreo Crumble', 17000],
    ['Strawberry Latte', 17000], ['Matcha Latte', 17000], ['Oreo Matcha Latte', 22000],
    ['Caramel Matcha Latte', 22000], ['Strawberry Matcha Latte', 22000],
    ['Strawberry Pink Latte', 22000], ['Strawberry Taro Latte', 22000],
    ['Strawberry Cocoa Latte', 17000], ['Ube Matcha Latte', 22000], ['Ube Latte', 17000],
    ['Matcha Sea Salt Latte', 22000],
  ];
  const topping = ['Ice Cream', 'Boba', 'Strawberry Jam', 'Sea Salt Foam', 'Espresso'];
  return [
    ...kopi.map(([n, h]) => P(n, 'Kopi', h)),
    ...nonKopi.map(([n, h]) => P(n, 'Non-Kopi', h)),
    ...topping.map(n => P(n, 'Toppings', 5000)),
  ];
})();

let menu = [];       // daftar produk (dari DB)
let trx  = [];       // riwayat transaksi (dari DB)
let cart = {};       // { idProduk: jumlah }
let cat = 'Kopi';    // kategori aktif
let method = null;   // 'QRIS' | 'Tunai'
let lastTx = null;
let pin = '';
let editId = null;   // id produk yang sedang diedit
let fImg = '';       // foto produk di form

/* ========== 4. DATA LAYER (Supabase / PostgreSQL) ========== */
// Konversi baris DB <-> objek aplikasi
const toMenu = p => ({
  id: String(p.id), name: p.nama, price: p.harga,
  cat: p.kategori, img: p.foto_url || '', ok: p.tersedia,
});
const toMenuRow = p => ({
  nama: p.name, harga: p.price, kategori: p.cat,
  foto_url: p.img || null, tersedia: p.ok,
});
const toTrx = t => ({
  id: t.id, time: t.waktu, name: t.nama_pelanggan || '-', items: t.items,
  total: t.total, method: t.metode,
  paid: t.uang_diterima || t.total, change: t.kembalian || 0,
});

const MenuAPI = {
  async list() {
    const { data, error } = await db.from('menu').select('*').order('id');
    if (error) throw error;
    return data.map(toMenu);
  },
  async seed() {
    const { data, error } = await db.from('menu').insert(DEFAULT_MENU).select();
    if (error) throw error;
    return data.map(toMenu);
  },
  async add(p) {
    const { data, error } = await db.from('menu').insert(toMenuRow(p)).select().single();
    if (error) throw error;
    return toMenu(data);
  },
  async update(p) {
    const { error } = await db.from('menu').update(toMenuRow(p)).eq('id', p.id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await db.from('menu').delete().eq('id', id);
    if (error) throw error;
  },
};

const TrxAPI = {
  async list() {
    const { data, error } = await db.from('transaksi').select('*').order('waktu', { ascending: false });
    if (error) throw error;
    return data.map(toTrx);
  },
  async add(row) {
    const { data, error } = await db.from('transaksi').insert(row).select().single();
    if (error) throw error;
    return toTrx(data);
  },
};

async function loadDatabase() {
  try {
    if (!db) throw new Error('Supabase belum tersedia');

    menu = await MenuAPI.list();

    if (!menu.length) {
      menu = await MenuAPI.seed();
    }

    trx = await TrxAPI.list();

  } catch (err) {
    console.error('Database bermasalah:', err);

    // Gunakan menu bawaan agar aplikasi tetap interaktif
    menu = DEFAULT_MENU.map((p, i) => ({
      id: 'local-' + (i + 1),
      name: p.nama,
      price: p.harga,
      cat: p.kategori,
      img: p.foto_url,
      ok: true
    }));

    trx = [];
  }

  // Tetap tampilkan produk dan keranjang
  renderProducts();
  renderCart();
}

/* ========== 5. TAMPILAN UMUM ========== */

/* --- Gambar produk: coba .jpg → .jpeg → .png, kalau gagal tampilkan ☕ --- */
const IMG_EXTS = ['.jpg', '.jpeg', '.png'];

const IMG = src => {
  if (!src) return '☕';
  if (src.startsWith('data:')) return `<img data-pic src="${src}" alt="">`;
  const base = src.replace(/\.(jpg|jpeg|png)$/i, '');
  return `<img data-pic src="${esc(base)}.jpg" data-base="${esc(base)}" data-try="0" alt="">`;
};

// Handler gambar gagal dimuat (hanya untuk foto produk, bukan logo/QRIS)
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.hasAttribute('data-pic')) return;
  const next = Number(img.dataset.try || 0) + 1;
  if (img.dataset.base !== undefined && next < IMG_EXTS.length) {
    img.dataset.try = next;
    img.src = img.dataset.base + IMG_EXTS[next];
  } else {
    img.replaceWith(document.createTextNode('☕'));
  }
}, true);

/* --- Navigasi --- */
function screen(id) {
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  window.scrollTo(0, 0);
}

function view(v) {
  $$('.view').forEach(x => x.classList.toggle('hidden', x.id !== 'v-' + v));
  const tab = ['pay', 'done'].includes(v) ? 'order' : v;
  $$('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  if (v === 'recap') renderRecap();
  if (v === 'menu') renderMenuList();
  window.scrollTo(0, 0);
}

$('#btnMasuk').onclick = () => {
  if (SS.get('kk_in')) { screen('app'); view('order'); } else screen('login');
};
$('#btnFitur').onclick = () => $('#fitur').scrollIntoView({ behavior: 'smooth' });
$('#btnLogout').onclick = () => { SS.del('kk_in'); screen('landing'); };
$$('#nav [data-view]').forEach(b => b.onclick = () => view(b.dataset.view));

/* --- Login PIN --- */
$('#keypad').innerHTML =
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('') +
  '<button class="sp"></button><button data-k="0">0</button><button data-k="del">Hapus</button>';

const pinUI = () => $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));

function pressKey(k) {
  $('#pinError').textContent = '';
  if (k === 'del') pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += k;
  pinUI();
  if (pin.length === 4) login();
}

function login() {
  if (pin === load('kk_pin', DEFAULT_PIN)) {
    SS.set('kk_in', '1');
    pin = '';
    pinUI();
    screen('app');
    view('order');
    renderProducts();
  } else {
    $('#pinError').textContent = 'PIN salah, coba lagi.';
    pin = '';
    setTimeout(pinUI, 300);
  }
}

$('#keypad').onclick = e => { if (e.target.dataset.k !== undefined) pressKey(e.target.dataset.k); };
$('#btnLogin').onclick = login;
document.addEventListener('keydown', e => {
  if ($('#login').classList.contains('hidden')) return;
  if (/^\d$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('del');
  else if (e.key === 'Enter') login();
});

/* ========== 6a. PESANAN ========== */
const cartList  = () => Object.entries(cart).map(([id, q]) => ({ p: menu.find(m => m.id === id), q })).filter(x => x.p);
const cartTotal = () => cartList().reduce((s, x) => s + x.p.price * x.q, 0);

function renderProducts() {
  const list = menu.filter(p => cat === 'Semua' || p.cat === cat);
  $('#products').innerHTML = list.map(p => `
    <button class="prod ${p.ok ? '' : 'off'}" data-id="${p.id}">
      ${cart[p.id] ? `<div class="qty">${cart[p.id]}</div>` : ''}
      <div class="img">${IMG(p.img)}</div>
      <b>${esc(p.name)}</b><span class="pr">${rp(p.price)}</span>
    </button>`).join('') || '<p class="muted">Belum ada produk.</p>';
}

function renderCart() {
  $('#cartItems').innerHTML = cartList().map(({ p, q }) => `
    <div class="ci">
      <div class="n">${esc(p.name)}<small>${rp(p.price)} × ${q}</small></div>
      <button data-d="${p.id}">−</button><b>${q}</b><button data-a="${p.id}">+</button>
    </div>`).join('');
  $('#cartTotal').textContent = rp(cartTotal());
  $('#btnPay').disabled = !cartList().length;
}

$('#chips').onclick = e => {
  const c = e.target.dataset.cat;
  if (!c) return;
  cat = c;
  $$('#chips button').forEach(b => b.classList.toggle('active', b.dataset.cat === c));
  renderProducts();
};

$('#products').onclick = e => {
  const el = e.target.closest('.prod');
  if (!el) return;
  const id = el.dataset.id;
  cart[id] = (cart[id] || 0) + 1;
  renderProducts();
  renderCart();
};

$('#cartItems').onclick = e => {
  const { d, a } = e.target.dataset;
  if (d) { if (--cart[d] <= 0) delete cart[d]; }
  else if (a) cart[a]++;
  else return;
  renderProducts();
  renderCart();
};

/* ========== 6b. PEMBAYARAN ========== */
$('#btnPay').onclick = () => {
  const total = cartTotal();
  const name = $('#custName').value.trim() || '-';

  $('#payName').textContent = 'Atas nama: ' + name;
  $('#payLines').innerHTML = cartList()
    .map(({ p, q }) => `<div><span>${esc(p.name)} ×${q}</span><span>${rp(p.price * q)}</span></div>`).join('');
  $('#payTotal').textContent = rp(total);
  $('#qrisTotal').textContent = rp(total);

  method = null;
  $$('.method').forEach(b => b.classList.remove('active'));
  ['#boxQris', '#boxCash', '#btnConfirm'].forEach(s => $(s).classList.add('hidden'));
  $('#cashIn').value = '';
  $('#cashChange').textContent = rp(0);
  view('pay');
};

$$('.method').forEach(b => b.onclick = () => {
  method = b.dataset.m;
  $$('.method').forEach(x => x.classList.toggle('active', x === b));
  $('#boxQris').classList.toggle('hidden', method !== 'QRIS');
  $('#boxCash').classList.toggle('hidden', method !== 'Tunai');
  $('#btnConfirm').classList.remove('hidden');
  calcCash();
});

function calcCash() {
  const paid = num($('#cashIn').value);
  const total = cartTotal();
  const enough = paid >= total;
  $('#cashChange').textContent = rp(Math.max(0, paid - total));
  $('#cashErr').textContent = paid && !enough ? 'Uang diterima kurang ' + rp(total - paid) : '';
  $('#btnConfirm').disabled = method === 'Tunai' ? !enough : false;
}

$('#cashIn').oninput = e => {
  const n = num(e.target.value);
  e.target.value = n ? rp(n) : '';
  calcCash();
};

$('#btnConfirm').onclick = () =>
  finish(method, method === 'Tunai' ? num($('#cashIn').value) : cartTotal());

function renderReceipt(tx) {
  const cash = tx.method === 'Tunai'
    ? `<div class="l brown"><span>Diterima</span><span>${rp(tx.paid)}</span></div>
       <div class="l brown"><span>Kembalian</span><b>${rp(tx.change)}</b></div>`
    : '';
  $('#receipt').innerHTML = `
    <div class="l brown"><span>Atas nama</span><b>${esc(tx.name)}</b></div>
    <div class="sep"></div>
    ${tx.items.map(i => `<div class="l"><span>${esc(i.n)} ×${i.q}</span><span>${rp(i.p * i.q)}</span></div>`).join('')}
    <div class="sep"></div>
    <div class="l brown"><span>Metode</span><span>${tx.method}</span></div>
    ${cash}
    <div class="sep"></div>
    <div class="l t"><span>Total</span><span>${rp(tx.total)}</span></div>`;
}

async function finish(m, paid) {
  const total = cartTotal();
  const items = cartList().map(({ p, q }) => ({ n: p.name, q, p: p.price }));

  try {
    lastTx = await TrxAPI.add({
      nama_pelanggan: $('#custName').value.trim() || '-',
      items,
      total,
      metode: m,
      uang_diterima: paid,
      kembalian: Math.max(0, paid - total),
    });
    trx.unshift(lastTx);

    $('#doneTime').textContent = 'Tersimpan di Riwayat — ' +
      new Date(lastTx.time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    renderReceipt(lastTx);
    view('done');
  } catch (err) {
    console.error('Gagal menyimpan transaksi:', err);
    alert('Transaksi gagal disimpan. Silakan coba lagi.');
  }
}

$('#btnPrint').onclick = () => window.print();
$('#btnNew').onclick = () => {
  cart = {};
  $('#custName').value = '';
  renderProducts();
  renderCart();
  view('order');
};

/* ========== 6c. REKAP ========== */
$('#recapDay').value = ymd(new Date());
$('#recapDay').onchange = renderRecap;

function renderRecap() {
  const day = $('#recapDay').value || ymd(new Date());
  const isToday = day === ymd(new Date());
  const list = trx
    .filter(t => ymd(t.time) === day)
    .sort((a, b) => b.time.localeCompare(a.time));

  $('#recapTitle').textContent = isToday ? 'Rekap Hari Ini' : 'Rekap Harian';
  $('#recapDate').textContent = new Date(day + 'T00:00')
    .toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  $('#rItems').textContent = list.reduce((s, t) => s + t.items.reduce((a, i) => a + i.q, 0), 0);
  $('#rTrx').textContent = list.length;
  $('#rRev').textContent = rp(list.reduce((s, t) => s + t.total, 0));

  // Produk terjual
  const sold = {};
  list.forEach(t => t.items.forEach(i => { sold[i.n] = (sold[i.n] || 0) + i.q; }));
  $('#rItemList').innerHTML = Object.entries(sold)
    .sort((a, b) => b[1] - a[1])
    .map(([n, q]) => `<div><span>${esc(n)}</span><b>${q}</b></div>`).join('')
    || '<p class="muted">Belum ada produk terjual.</p>';

  // Tabel transaksi
  $('#rTable').innerHTML = list.map(t => `
    <tr>
      <td>${new Date(t.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><b>${esc(t.name)}</b><br><small>${t.items.map(i => esc(i.n) + ' ×' + i.q).join(', ')}</small></td>
      <td>${rp(t.total)}</td>
      <td>${t.method}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada transaksi.</td></tr>';

  // Grafik per metode bayar
  const sumBy = m => list.filter(t => t.method === m).reduce((s, t) => s + t.total, 0);
  const vals = { Tunai: sumBy('Tunai'), QRIS: sumBy('QRIS') };
  const max = Math.max(...Object.values(vals), 1);
  $('#chart').innerHTML = Object.entries(vals).map(([k, v]) => `
    <div class="bar"><b>${(v / 1000).toLocaleString('id-ID')}</b>
    <i style="height:${v / max * 78}%"></i><span>${k}</span></div>`).join('');
}

/* ========== 6d. KELOLA MENU ========== */
function renderMenuList() {
  $('#mCount').textContent = menu.length + ' Produk';
  $('#mList').innerHTML = menu.map(p => `
    <div class="mi">
      <div class="th">${IMG(p.img)}</div>
      <div class="i"><b>${esc(p.name)}</b><span>${p.cat} · ${rp(p.price)}</span></div>
      <button class="badge ${p.ok ? '' : 'off'}" data-t="${p.id}">${p.ok ? 'Tersedia' : 'Habis'}</button>
      <button class="edit" data-e="${p.id}">Edit</button>
    </div>`).join('');
}

function refreshMenuViews() {
  renderMenuList();
  renderProducts();
  renderCart();
}

function resetForm() {
  editId = null;
  fImg = '';
  ['#fName', '#fPrice'].forEach(s => { $(s).value = ''; });
  $('#fCat').value = 'Kopi';
  $('#fFile').value = '';
  $('#fFileLbl').textContent = 'Unggah Foto Produk';
  $('#formTitle').textContent = 'Tambah Produk';
  $('#btnDel').classList.add('hidden');
  $('#btnCancel').classList.add('hidden');
}

function startEdit(id) {
  const p = menu.find(m => m.id === id);
  editId = id;
  fImg = p.img;
  $('#fName').value = p.name;
  $('#fPrice').value = p.price;
  $('#fCat').value = p.cat;
  $('#formTitle').textContent = 'Edit Produk';
  $('#btnDel').classList.remove('hidden');
  $('#btnCancel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#mList').onclick = async e => {
  const { t, e: editTarget } = e.target.dataset;

  if (t) { // ubah ketersediaan
    const p = menu.find(m => m.id === t);
    p.ok = !p.ok;
    try {
      await MenuAPI.update(p);
      refreshMenuViews();
    } catch (err) {
      p.ok = !p.ok; // batalkan perubahan lokal
      console.error('Gagal mengubah status menu:', err);
      alert('Status menu gagal disimpan.');
    }
  }
  if (editTarget) startEdit(editTarget);
};

$('#fFile').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    fImg = r.result;
    $('#fFileLbl').innerHTML = `<img src="${fImg}" alt="">`;
  };
  r.readAsDataURL(f);
};

$('#btnSave').onclick = async () => {
  const name = $('#fName').value.trim();
  const price = num($('#fPrice').value);
  if (!name || !price) return alert('Nama dan harga wajib diisi.');

  const data = { name, price, cat: $('#fCat').value, img: fImg };

  try {
    if (editId) {
      const p = menu.find(m => m.id === editId);
      const updated = { ...p, ...data };
      await MenuAPI.update(updated);
      Object.assign(p, updated);
    } else {
      menu.push(await MenuAPI.add({ ...data, ok: true }));
    }
    resetForm();
    refreshMenuViews();
  } catch (err) {
    console.error('Gagal menyimpan menu:', err);
    alert('Menu gagal disimpan ke database.');
  }
};

$('#btnDel').onclick = async () => {
  if (!confirm('Hapus produk ini?')) return;
  try {
    await MenuAPI.remove(editId);
    menu = menu.filter(m => m.id !== editId);
    delete cart[editId];
    resetForm();
    refreshMenuViews();
  } catch (err) {
    console.error('Gagal menghapus menu:', err);
    alert('Menu gagal dihapus.');
  }
};

$('#btnCancel').onclick = resetForm;

/* ========== 7. INISIALISASI ========== */
if (SS.get('kk_in')) { screen('app'); view('order'); }
loadDatabase();
