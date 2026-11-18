'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const num = s => parseInt(String(s).replace(/\D/g, '')) || 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mem = {}, smem = {};
const store = (name, m) => ({
  get: k => { try { return window[name].getItem(k); } catch { return m[k] ?? null; } },
  set: (k, v) => { try { window[name].setItem(k, v); } catch { m[k] = v; } },
  del: k => { try { window[name].removeItem(k); } catch { delete m[k]; } }
});
const LS = store('localStorage', mem), SS = store('sessionStorage', smem);
const load = (k, d) => { try { return JSON.parse(LS.get(k)) ?? d; } catch { return d; } };
const save = (k, v) => LS.set(k, JSON.stringify(v));

/* ===== DATA AWAL ===== */
// Foto produk otomatis dicari di folder images
const P = (n, c, p) => {
  const id = n.toLowerCase().replace(/\W+/g, '-');
  return { id, name: n, cat: c, price: p, ok: true, img: `images/${id}` };
};
const DEFAULT_MENU = [
  P('Americano','Kopi',12000), P('Berry Americano','Kopi',17000), P('Orange Americano','Kopi',17000),
  P('Cappucino','Kopi',12000), P('Butterscotch Latte','Kopi',17000), P('Spanish Latte','Kopi',17000),
  P('Aren Latte','Kopi',17000), P('Caramel Macchiato','Kopi',17000), P('Pandan Latte','Kopi',17000),
  P('Pistachio Latte','Kopi',17000), P('Matcha Espresso','Kopi',22000), P('Sea Salt Americano','Kopi',17000),
  P('Butterscotch Sea Salt Latte','Kopi',22000), P('Caramel Sea Salt Latte','Kopi',22000),
  P('Matcha Espresso Sea Salt Latte','Kopi',25000),
  P('Chocolate','Non-Kopi',12000), P('Hazelnut','Non-Kopi',17000), P('Thai Tea','Non-Kopi',12000),
  P('Taro','Non-Kopi',17000), P('Cotton Candy','Non-Kopi',17000), P('Milk Tea','Non-Kopi',17000),
  P('Oreo Crumble','Non-Kopi',17000), P('Strawberry Latte','Non-Kopi',17000), P('Matcha Latte','Non-Kopi',17000),
  P('Oreo Matcha Latte','Non-Kopi',22000), P('Caramel Matcha Latte','Non-Kopi',22000),
  P('Strawberry Matcha Latte','Non-Kopi',22000), P('Strawberry Pink Latte','Non-Kopi',22000),
  P('Strawberry Taro Latte','Non-Kopi',22000), P('Strawberry Cocoa Latte','Non-Kopi',17000),
  P('Ube Matcha Latte','Non-Kopi',22000), P('Ube Latte','Non-Kopi',17000), P('Matcha Sea Salt Latte','Non-Kopi',22000),
  ...['Ice Cream','Boba','Strawberry Jam','Sea Salt Foam','Espresso'].map(n => P(n,'Toppings',5000)),
];
const PIN = '1234'; // ganti PIN pemilik di sini
// Jika data bawaan menu diubah lagi, naikkan v2 menjadi v3 agar browser memuat data terbaru
let menu = load('kk_menu_v2', DEFAULT_MENU), trx = load('kk_trx', []);
let cart = {}, cat = 'Kopi', method = null, lastTx = null, pin = '', editId = null, fImg = '';
const IMG = src => {
  if (!src) return '☕';

  // Foto yang diunggah melalui form menu
  if (src.startsWith('data:')) {
    return `<img src="${src}" alt="" onerror="this.replaceWith('☕')">`;
  }

  // Mencoba JPG, JPEG, lalu PNG
  const base = src.replace(/\.(jpg|jpeg|png)$/i, '');

  return `<img src="${base}.jpg" alt=""
    data-img-try="0"
    onerror="
      const exts = ['.jpg', '.jpeg', '.png'];
      const i = Number(this.dataset.imgTry || 0) + 1;
      this.dataset.imgTry = i;
      if (i < exts.length) {
        this.src = '${base}' + exts[i];
      } else {
        this.replaceWith(document.createTextNode('☕'));
      }
    ">
  `;
};
/* ===== NAVIGASI ===== */
function screen(id) { $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); window.scrollTo(0, 0); }
function view(v) {
  $$('.view').forEach(x => x.classList.toggle('hidden', x.id !== 'v-' + v));
  const tab = ['pay', 'done'].includes(v) ? 'order' : v;
  $$('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  if (v === 'recap') renderRecap(); if (v === 'menu') renderMenuList(); window.scrollTo(0, 0);
}
$('#btnMasuk').onclick = () => { if (SS.get('kk_in')) { screen('app'); view('order'); } else screen('login'); };
$('#btnFitur').onclick = () => $('#fitur').scrollIntoView({ behavior: 'smooth' });
$$('#nav [data-view]').forEach(b => b.onclick = () => view(b.dataset.view));
$('#btnLogout').onclick = () => { SS.del('kk_in'); screen('landing'); };

/* ===== LOGIN ===== */
$('#keypad').innerHTML = [1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('') +
  '<button class="sp"></button><button data-k="0">0</button><button data-k="del">Hapus</button>';
function pinUI() { $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); }
$('#keypad').onclick = e => {
  const k = e.target.dataset.k; if (k === undefined) return;
  $('#pinError').textContent = '';
  if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
  pinUI(); if (pin.length === 4) login();
};
document.addEventListener('keydown', e => {
  if ($('#login').classList.contains('hidden')) return;
  if (/^\d$/.test(e.key) && pin.length < 4) { pin += e.key; pinUI(); if (pin.length === 4) login(); }
  else if (e.key === 'Backspace') { pin = pin.slice(0, -1); pinUI(); }
  else if (e.key === 'Enter') login();
});
function login() {
  if (pin === load('kk_pin', PIN)) { SS.set('kk_in', '1'); pin = ''; pinUI(); screen('app'); view('order'); renderProducts(); }
  else { $('#pinError').textContent = 'PIN salah, coba lagi.'; pin = ''; setTimeout(pinUI, 300); }
}
$('#btnLogin').onclick = login;
if (SS.get('kk_in')) { screen('app'); view('order'); }

/* ===== PESANAN ===== */
$('#chips').onclick = e => {
  const c = e.target.dataset.cat; if (!c) return; cat = c;
  $$('#chips button').forEach(b => b.classList.toggle('active', b.dataset.cat === c)); renderProducts();
};
function renderProducts() {
  const list = menu.filter(p => cat === 'Semua' || p.cat === cat);
  $('#products').innerHTML = list.map(p => `
    <button class="prod ${p.ok ? '' : 'off'}" data-id="${p.id}">
      ${cart[p.id] ? `<div class="qty">${cart[p.id]}</div>` : ''}
      <div class="img">${IMG(p.img)}</div>
      <b>${esc(p.name)}</b><span class="pr">${rp(p.price)}</span>
    </button>`).join('') || '<p class="muted">Belum ada produk.</p>';
}
$('#products').onclick = e => {
  const el = e.target.closest('.prod'); if (!el) return;
  cart[el.dataset.id] = (cart[el.dataset.id] || 0) + 1; renderProducts(); renderCart();
};
const cartList = () => Object.entries(cart).map(([id, q]) => ({ p: menu.find(m => m.id === id), q })).filter(x => x.p);
const cartTotal = () => cartList().reduce((s, x) => s + x.p.price * x.q, 0);
function renderCart() {
  $('#cartItems').innerHTML = cartList().map(({ p, q }) => `
    <div class="ci"><div class="n">${esc(p.name)}<small>${rp(p.price)} × ${q}</small></div>
    <button data-d="${p.id}">−</button><b>${q}</b><button data-a="${p.id}">+</button></div>`).join('');
  $('#cartTotal').textContent = rp(cartTotal()); $('#btnPay').disabled = !cartList().length;
}
$('#cartItems').onclick = e => {
  const d = e.target.dataset.d, a = e.target.dataset.a;
  if (d) { if (--cart[d] <= 0) delete cart[d]; } else if (a) cart[a]++; else return;
  renderProducts(); renderCart();
};

/* ===== PEMBAYARAN ===== */
$('#btnPay').onclick = () => {
  const t = cartTotal(), name = $('#custName').value.trim() || '-';
  $('#payName').textContent = 'Atas nama: ' + name;
  $('#payLines').innerHTML = cartList().map(({ p, q }) => `<div><span>${esc(p.name)} ×${q}</span><span>${rp(p.price * q)}</span></div>`).join('');
  $('#payTotal').textContent = rp(t);
  $('#qrisTotal').textContent = rp(t);
  method = null; $$('.method').forEach(b => b.classList.remove('active'));
  ['#boxQris', '#boxCash', '#btnConfirm'].forEach(s => $(s).classList.add('hidden'));
  $('#cashIn').value = ''; $('#cashChange').textContent = rp(0); view('pay');
};
$$('.method').forEach(b => b.onclick = () => {
  method = b.dataset.m; $$('.method').forEach(x => x.classList.toggle('active', x === b));
  $('#boxQris').classList.toggle('hidden', method !== 'QRIS');
  $('#boxCash').classList.toggle('hidden', method !== 'Tunai');
  $('#btnConfirm').classList.remove('hidden'); calcCash();
});
function calcCash() {
  const paid = num($('#cashIn').value), t = cartTotal(), ok = paid >= t;
  $('#cashChange').textContent = rp(Math.max(0, paid - t));
  $('#cashErr').textContent = paid && !ok ? 'Uang diterima kurang ' + rp(t - paid) : '';
  $('#btnConfirm').disabled = method === 'Tunai' ? !ok : false;
}
$('#cashIn').oninput = e => { const n = num(e.target.value); e.target.value = n ? rp(n) : ''; calcCash(); };
$('#btnConfirm').onclick = () => finish(method, method === 'Tunai' ? num($('#cashIn').value) : cartTotal());

function finish(m, paid) {
  const t = cartTotal(), now = new Date();
  lastTx = {
    id: Date.now(), time: now.toISOString(), name: $('#custName').value.trim() || '-',
    items: cartList().map(({ p, q }) => ({ n: p.name, q, p: p.price })), total: t, method: m, paid, change: Math.max(0, paid - t)
  };
  trx.push(lastTx); save('kk_trx', trx);
  $('#doneTime').textContent = 'Tersimpan di Riwayat — ' + now.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  $('#receipt').innerHTML = `<div class="l brown"><span>Atas nama</span><b>${esc(lastTx.name)}</b></div><div class="sep"></div>` +
    lastTx.items.map(i => `<div class="l"><span>${esc(i.n)} ×${i.q}</span><span>${rp(i.p * i.q)}</span></div>`).join('') +
    `<div class="sep"></div><div class="l brown"><span>Metode</span><span>${m}</span></div>` +
    (m === 'Tunai' ? `<div class="l brown"><span>Diterima</span><span>${rp(paid)}</span></div><div class="l brown"><span>Kembalian</span><b>${rp(lastTx.change)}</b></div>` : '') +
    `<div class="sep"></div><div class="l t"><span>Total</span><span>${rp(t)}</span></div>`;
  view('done');
}
$('#btnPrint').onclick = () => window.print();
$('#btnNew').onclick = () => { cart = {}; $('#custName').value = ''; renderProducts(); renderCart(); view('order'); };

/* ===== REKAP ===== */
const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
$('#recapDay').value = ymd(new Date()); $('#recapDay').onchange = renderRecap;
function renderRecap() {
  const day = $('#recapDay').value || ymd(new Date()), isToday = day === ymd(new Date());
  const list = trx.filter(t => ymd(t.time) === day).sort((a, b) => b.time.localeCompare(a.time));
  const d = new Date(day + 'T00:00');
  $('#recapTitle').textContent = isToday ? 'Rekap Hari Ini' : 'Rekap Harian';
  $('#recapDate').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#rItems').textContent = list.reduce((s, t) => s + t.items.reduce((a, i) => a + i.q, 0), 0);
  $('#rTrx').textContent = list.length;
  $('#rRev').textContent = rp(list.reduce((s, t) => s + t.total, 0));
  const sold = {};
  list.forEach(t => t.items.forEach(i => sold[i.n] = (sold[i.n] || 0) + i.q));
  $('#rItemList').innerHTML = Object.entries(sold).sort((a, b) => b[1] - a[1])
    .map(([n, q]) => `<div><span>${esc(n)}</span><b>${q}</b></div>`).join('') || '<p class="muted">Belum ada produk terjual.</p>';
  $('#rTable').innerHTML = list.map(t => `<tr><td>${new Date(t.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
    <td><b>${esc(t.name)}</b><br><small>${t.items.map(i => esc(i.n) + ' ×' + i.q).join(', ')}</small></td><td>${rp(t.total)}</td><td>${t.method}</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">Belum ada transaksi.</td></tr>';
  const sum = m => list.filter(t => t.method === m).reduce((s, t) => s + t.total, 0);
  const vals = { Tunai: sum('Tunai'), QRIS: sum('QRIS') }, max = Math.max(...Object.values(vals), 1);
  $('#chart').innerHTML = Object.entries(vals).map(([k, v]) =>
    `<div class="bar"><b>${(v / 1000).toLocaleString('id-ID')}</b><i style="height:${v / max * 78}%"></i><span>${k}</span></div>`).join('');
}

/* ===== KELOLA MENU ===== */
function renderMenuList() {
  $('#mCount').textContent = menu.length + ' Produk';
  $('#mList').innerHTML = menu.map(p => `<div class="mi"><div class="th">${IMG(p.img)}</div>
    <div class="i"><b>${esc(p.name)}</b><span>${p.cat} · ${rp(p.price)}</span></div>
    <button class="badge ${p.ok ? '' : 'off'}" data-t="${p.id}">${p.ok ? 'Tersedia' : 'Habis'}</button>
    <button class="edit" data-e="${p.id}">Edit</button></div>`).join('');
}
$('#mList').onclick = e => {
  const t = e.target.dataset.t, ed = e.target.dataset.e;
  if (t) { const p = menu.find(m => m.id === t); p.ok = !p.ok; persistMenu(); }
  if (ed) startEdit(ed);
};
function persistMenu() { save('kk_menu_v2', menu); renderMenuList(); renderProducts(); }
function resetForm() {
  editId = null; fImg = ''; ['#fName', '#fPrice'].forEach(s => $(s).value = ''); $('#fCat').value = 'Kopi';
  $('#fFile').value = ''; $('#fFileLbl').textContent = 'Unggah Foto Produk';
  $('#formTitle').textContent = 'Tambah Produk'; $('#btnDel').classList.add('hidden'); $('#btnCancel').classList.add('hidden');
}
function startEdit(id) {
  const p = menu.find(m => m.id === id); editId = id; fImg = p.img;
  $('#fName').value = p.name; $('#fPrice').value = p.price; $('#fCat').value = p.cat;
  $('#formTitle').textContent = 'Edit Produk'; $('#btnDel').classList.remove('hidden'); $('#btnCancel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#fFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { fImg = r.result; $('#fFileLbl').innerHTML = `<img src="${fImg}" alt="">`; }; r.readAsDataURL(f);
};
$('#btnSave').onclick = () => {
  const name = $('#fName').value.trim(), price = num($('#fPrice').value);
  if (!name || !price) return alert('Nama dan harga wajib diisi.');
  if (editId) Object.assign(menu.find(m => m.id === editId), { name, price, cat: $('#fCat').value, img: fImg });
  else menu.push({ id: 'p' + Date.now(), name, price, cat: $('#fCat').value, ok: true, img: fImg });
  persistMenu(); resetForm();
};
$('#btnDel').onclick = () => {
  if (!confirm('Hapus produk ini?')) return;
  menu = menu.filter(m => m.id !== editId); delete cart[editId]; persistMenu(); renderCart(); resetForm();
};
$('#btnCancel').onclick = resetForm;

renderProducts(); renderCart();
