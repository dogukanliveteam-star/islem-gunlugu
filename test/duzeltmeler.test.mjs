// Çalıştırma: node --test test/duzeltmeler.test.mjs
// İsteğe bağlı: IG_CSV_KLASOR=<csv klasörü> IG_ESKI_HTML=<önceki index.html> ile eski sürümle karşılaştırır.
process.env.TZ = "Europe/Istanbul";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HTML = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
const betikAl = (html) => {
  const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(m.length, 1, "tek satır içi betik beklenir");
  return m[0][1];
};
const BETIK = betikAl(HTML);

class Oge {
  constructor(ad, ortam) {
    this.tagName = ad.toUpperCase();
    this.ortam = ortam;
    this.children = [];
    this.metin = "";
    this.className = "";
    this.dataset = {};
    this.title = "";
    this.value = "";
    this.style = {};
    this.width = 680;
    this.height = 170;
    const o = this;
    this.classList = {
      add: (...s) => s.forEach((x) => { if (!o.classList.contains(x)) o.className = (o.className + " " + x).trim(); }),
      remove: (...s) => { o.className = o.className.split(/\s+/).filter((x) => x && !s.includes(x)).join(" "); },
      contains: (x) => o.className.split(/\s+/).includes(x),
      toggle: (x, a) => { (a === undefined ? !o.classList.contains(x) : a) ? o.classList.add(x) : o.classList.remove(x); },
    };
  }
  set textContent(v) { this.children = []; this.metin = String(v); }
  get textContent() { return this.metin + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(v) { if (this.ortam.siki) throw new Error("innerHTML kullanıldı"); this.ortam.htmlYazildi.push(String(v)); }
  get innerHTML() { return ""; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  getContext() { const b = () => {}; return { clearRect: b, beginPath: b, moveTo: b, lineTo: b, stroke: b }; }
  click() {}
}

function ortamKur({ yerel = {}, bulut = null, simdi = null, betik = BETIK, siki = true, yazmaEngel = null } = {}) {
  const ortam = { siki, htmlYazildi: [], uretilen: [], uyarilar: [], yerel, ogeler: {} };
  const TarihSinifi = simdi == null ? Date : class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(simdi); }
    static now() { return simdi; }
  };
  const document = {
    getElementById: (id) => ortam.ogeler[id] || (ortam.ogeler[id] = new Oge("div", ortam)),
    createElement: (ad) => { const e = new Oge(ad, ortam); ortam.uretilen.push(e); return e; },
    querySelectorAll: () => [],
    head: new Oge("head", ortam),
  };
  const localStorage = {
    getItem: (k) => (k in yerel ? yerel[k] : null),
    setItem: (k, v) => { if (yazmaEngel && yazmaEngel(k)) throw new Error("kota"); yerel[k] = String(v); },
    removeItem: (k) => { delete yerel[k]; },
  };
  const g = {
    document, localStorage, console, TextDecoder, URL, Blob, Date: TarihSinifi,
    confirm: () => true, alert: (m) => ortam.uyarilar.push(String(m)),
  };
  if (bulut) {
    g.Telegram = { WebApp: {
      initData: "x", ready() {}, expand() {}, isVersionAtLeast: () => true,
      CloudStorage: {
        setItem: (k, v, cb) => { bulut[k] = String(v); cb && cb(null, true); },
        getItem: (k, cb) => cb(null, bulut[k] || ""),
        getItems: (ks, cb) => cb(null, Object.fromEntries(ks.map((k) => [k, bulut[k] || ""]))),
      },
    } };
  }
  g.window = g;
  ortam.ctx = vm.createContext(g);
  vm.runInContext(betik, ortam.ctx);
  ortam.js = (kod) => vm.runInContext(kod, ortam.ctx);
  ortam.liste = () => JSON.parse(ortam.js("JSON.stringify(islemler)"));
  ortam.el = (id) => document.getElementById(id);
  ortam.satirlar = () => ortam.el("liste").children.map((tr) => tr.children.map((td) => td.textContent));
  ortam.dosyaYukle = async (metin) => {
    const b = Buffer.from(metin, "utf8");
    await ortam.el("yukle").onchange({ target: { files: [{ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }], value: "x" } });
  };
  ortam.ekle = (a) => {
    const v = { tur: "spot", tarih: "2026-11-10", varlik: "BTC", yon: "long", kaldirac: "1", giris: "1", cikis: "2", miktar: "1", ucret: "0", fonlama: "0", not: "", ...a };
    for (const k in v) ortam.el(k).value = v[k];
    ortam.el("form").onsubmit({ preventDefault() {} });
  };
  ortam.sil = (id) => ortam.el("liste").onclick({ target: { dataset: { id: String(id) } } });
  return ortam;
}

const ANAHTAR = "islem_gunlugu_v1";
const kayit = (id, ek = {}) => ({ id, tarih: "2026-11-0" + id, varlik: "BTC", tur: "spot", yon: "long", kaldirac: 1, giris: 100, cikis: 110, miktar: 1, ucret: 0, fonlama: 0, not: "", ...ek });
const GUVENLI_ETIKETLER = new Set(["TR", "TD", "SPAN", "BUTTON", "A"]);
const YUK1 = "<img src=x onerror=alert(1)>";
const YUK2 = "\"><script>alert(1)</script>";

test("kaynakta HTML olarak yazan çağrı yok", () => {
  assert.doesNotMatch(BETIK, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("XSS: kendi CSV biçiminde zararlı alanlar etiket üretmiyor", async () => {
  const o = ortamKur();
  const csv = "tarih,varlik,tur,yon,kaldirac,giris,cikis,miktar,ucret,fonlama,not\n" +
    `2026-11-01,"${YUK1}",spot,long,1,100,110,1,0,0,"${YUK2.replace(/"/g, '""')}"\n` +
    `2026-11-02,"<script>alert(2)</script>",kaldirac,short,"<b>5</b>",100,90,1,0,0,x\n`;
  await o.dosyaYukle(csv);
  assert.equal(o.liste().length, 2);
  assert.match(o.uyarilar[0], /2 kapanmış işlem eklendi/);
  for (const t of o.liste()) assert.match(t.varlik, /^[A-Z0-9._\/-]{1,20}$/);
  assert.deepEqual(o.htmlYazildi, []);
  for (const e of o.uretilen) assert.ok(GUVENLI_ETIKETLER.has(e.tagName), "beklenmeyen etiket: " + e.tagName);
  const satirlar = o.satirlar();
  assert.equal(satirlar.length, 2);
  for (const s of satirlar) assert.doesNotMatch(s[1], /[<>"'=\s]/);
  const basliklar = o.el("liste").children.map((tr) => tr.title);
  assert.ok(basliklar.includes(YUK2), "not düz metin olarak title özelliğinde durur");
});

test("XSS: borsa dosyasında zararlı sembol etiket üretmiyor", async () => {
  const o = ortamKur();
  const csv = "Time,Futures,Direction,Leverage,Avg. Entry Price,Avg. Close Price,Closed Quantity,Realized PNL,Trading Fee\n" +
    `2026-11-03 10:00:00,"${YUK1}",Short,10,150,140,10,100,0.56\n`;
  await o.dosyaYukle(csv);
  assert.equal(o.liste().length, 1);
  assert.match(o.liste()[0].varlik, /^[A-Z0-9._\/-]{1,20}$/);
  for (const e of o.uretilen) assert.ok(GUVENLI_ETIKETLER.has(e.tagName));
  assert.doesNotMatch(o.el("sEnIyi").textContent, /[<>]/);
});

test("XSS: yerel kayıttan ve buluttan gelen zararlı alanlar düz metin basılıyor", () => {
  const kotu = kayit(1, { varlik: YUK1, not: YUK2, tarih: "2026-<i>x</i>", kaldirac: "<u>3</u>", tur: "kaldirac" });
  for (const o of [
    ortamKur({ yerel: { [ANAHTAR]: JSON.stringify([kotu]) } }),
    ortamKur({ bulut: { ig_n: "1", ig_0: JSON.stringify([kotu]) } }),
  ]) {
    assert.equal(o.liste().length, 1);
    assert.deepEqual(o.htmlYazildi, []);
    for (const e of o.uretilen) assert.ok(GUVENLI_ETIKETLER.has(e.tagName));
    assert.doesNotMatch(o.satirlar()[0][1], /[<>"'=\s]/);
    assert.equal(o.liste()[0].varlik, YUK1, "saklanan veri dönüştürülmez, yalnız güvenli basılır");
  }
});

test("elle girilen varlık adı harf, rakam ve sınırlı işaretle sınırlanıyor", () => {
  const o = ortamKur();
  o.ekle({ varlik: " btc<svg/onload=alert(1)> " });
  assert.match(o.liste()[0].varlik, /^[A-Z0-9._\/-]{1,20}$/);
  assert.equal(o.js("varlikTemiz('pepe')"), "PEPE");
  assert.equal(o.js("varlikTemiz('1000SHIB-USDT')"), "1000SHIB-USDT");
  assert.equal(o.js("varlikTemiz('<>')"), "?");
});

test("küçük fiyat 0 görünmüyor, Türkçe sayı biçimi korunuyor", () => {
  const o = ortamKur();
  assert.equal(o.js("sayi(0.00001234)"), "0,00001234");
  assert.equal(o.js("sayi(-0.00001234)"), "-0,00001234");
  assert.equal(o.js("sayi(0.5)"), "0,5");
  assert.equal(o.js("sayi(0)"), "0");
  assert.equal(o.js("sayi(1e-17)"), "0");
  assert.equal(o.js("sayi(1234.567)"), "1.234,57");
  assert.equal(o.js("sayi(-12.5)"), "-12,5");
  assert.equal(o.js("sayi(60000)"), "60.000");
  o.ekle({ varlik: "PEPE", giris: "0.00001234", cikis: "0.00001300", miktar: "1000000" });
  const s = o.satirlar()[0];
  assert.equal(s[3], "0,00001234");
  assert.equal(s[4], "0,000013");
  assert.equal(s[5], "0,66");
});

test("bozuk yerel kayıt: uygulama açılıyor, veri silinmiyor, yedekleniyor, not gösteriliyor", () => {
  const ham = '[{"id":1,"tarih":"2026-11-01","varl';
  const yerel = { [ANAHTAR]: ham };
  const o = ortamKur({ yerel });
  assert.deepEqual(o.liste(), []);
  assert.equal(yerel[ANAHTAR], ham, "bozuk veri yerinde duruyor");
  assert.equal(yerel[ANAHTAR + "_bozuk"], ham, "yedek alındı");
  const n = o.el("bozukNot");
  assert.ok(!n.classList.contains("gizli"));
  assert.match(n.textContent, /silinmedi/);
  assert.doesNotMatch(n.textContent, /[—–]/);
  o.ekle({ varlik: "ETH" });
  assert.equal(o.liste().length, 1);
  assert.equal(yerel[ANAHTAR + "_bozuk"], ham, "yeni kayıttan sonra yedek duruyor");
  assert.equal(JSON.parse(yerel[ANAHTAR]).length, 1);
});

test("beklenmeyen biçim: nesne ya da karışık dizi uygulamayı düşürmüyor", () => {
  for (const ham of ['{"a":1}', "null", '"metin"', "5"]) {
    const yerel = { [ANAHTAR]: ham };
    const o = ortamKur({ yerel });
    assert.deepEqual(o.liste(), [], ham);
    assert.equal(yerel[ANAHTAR + "_bozuk"], ham);
  }
  const karisik = JSON.stringify([1, null, "x", kayit(3), [2]]);
  const yerel = { [ANAHTAR]: karisik };
  const o = ortamKur({ yerel });
  assert.equal(o.liste().length, 1, "okunabilen kayıt kurtarılır");
  assert.equal(yerel[ANAHTAR + "_bozuk"], karisik);
  const eksik = ortamKur({ yerel: { [ANAHTAR]: JSON.stringify([{ id: 9 }]) } });
  assert.equal(eksik.satirlar().length, 1, "eksik alanlı kayıt çizimi düşürmez");
  assert.equal(eksik.el("sToplam").textContent, "0");
});

test("ikinci bozuk kayıt ilk yedeğin üstüne yazmıyor; yedek alınamazsa ana kayıt ezilmiyor", () => {
  const yerel = { [ANAHTAR]: "{yeni bozuk", [ANAHTAR + "_bozuk"]: "{eski bozuk" };
  ortamKur({ yerel, simdi: Date.UTC(2026, 10, 12, 9) });
  assert.equal(yerel[ANAHTAR + "_bozuk"], "{eski bozuk");
  assert.ok(Object.entries(yerel).some(([k, v]) => k.startsWith(ANAHTAR + "_bozuk_") && v === "{yeni bozuk"));

  const y2 = { [ANAHTAR]: "{bozuk" };
  const o = ortamKur({ yerel: y2, yazmaEngel: (k) => k.startsWith(ANAHTAR + "_bozuk") });
  o.ekle({ varlik: "BTC" });
  assert.equal(o.liste().length, 1);
  assert.equal(y2[ANAHTAR], "{bozuk", "yedeksiz bozuk veri ezilmedi");
  assert.match(o.el("bozukNot").textContent, /CSV indirerek yedekle/);
});

test("gece 01:30 yerel saatte tarih bugünü gösteriyor", () => {
  const simdi = Date.UTC(2026, 10, 11, 22, 30);
  assert.equal(new Date(simdi).toISOString().slice(0, 10), "2026-11-11", "UTC tarihi dün");
  assert.equal(new Date(simdi).getHours(), 1);
  const o = ortamKur({ simdi });
  assert.equal(o.el("tarih").value, "2026-11-12");
  assert.equal(o.js("tarihOku('anlasilmayan')"), "2026-11-12");
  assert.equal(o.js("tarihOku('2026/11/01')"), "2026-11-01");
  assert.equal(o.js("tarihOku('2026-11-01 10:00:00')"), "2026-11-01");
  assert.equal(o.js("tarihOku('05.11.2026')"), "2026-11-05");
});

test("birlestir: mezar taşı olan kayıt geri gelmiyor, yinelenen tek kalıyor", () => {
  const o = ortamKur();
  const s = o.js("JSON.stringify(birlestir([{id:1},{id:2}],[{id:2},{id:3},{id:4}],{'3':1}).map(t=>t.id))");
  assert.deepEqual(JSON.parse(s), [1, 2, 4]);
});

test("bir cihazda silinen işlem diğer cihazdan geri gelmiyor", () => {
  const ikisi = JSON.stringify([kayit(1), kayit(2)]);
  const bulut = { ig_n: "1", ig_0: ikisi };
  const yerelA = { [ANAHTAR]: ikisi }, yerelB = { [ANAHTAR]: ikisi };

  const a = ortamKur({ yerel: yerelA, bulut });
  a.sil(1);
  assert.deepEqual(a.liste().map((t) => t.id), [2]);
  assert.ok(Array.isArray(JSON.parse(bulut.ig_0)), "bulut kayıt biçimi dizi olarak kaldı");
  assert.deepEqual(JSON.parse(bulut.ig_0).map((t) => t.id), [2]);
  assert.equal(JSON.parse(bulut.ig_sil_0)[0][0], "1");

  const b = ortamKur({ yerel: yerelB, bulut });
  assert.deepEqual(b.liste().map((t) => t.id), [2], "B cihazında silinen geri gelmedi");
  b.ekle({ varlik: "ETH" });
  assert.equal(b.liste().length, 2);
  assert.ok(!JSON.parse(bulut.ig_0).some((t) => t.id === 1), "B kaydedince silinen buluta dönmedi");

  const a2 = ortamKur({ yerel: yerelA, bulut });
  assert.equal(a2.liste().length, 2);
  assert.ok(!a2.liste().some((t) => t.id === 1));
  assert.ok(a2.liste().some((t) => t.varlik === "ETH"), "diğer cihazda eklenen geldi");
});

test("hepsini sil diğer cihazdan geri gelmiyor", () => {
  const ikisi = JSON.stringify([kayit(1), kayit(2)]);
  const bulut = { ig_n: "1", ig_0: ikisi };
  const yerelB = { [ANAHTAR]: ikisi };
  const a = ortamKur({ yerel: { [ANAHTAR]: ikisi }, bulut });
  a.el("temizle").onclick();
  assert.deepEqual(a.liste(), []);
  const b = ortamKur({ yerel: yerelB, bulut });
  assert.deepEqual(b.liste(), []);
});

test("bulut aynı sayıda ama farklı içerikteyse açılışta güncelleniyor", () => {
  const z = Date.now();
  const bulut = { ig_n: "1", ig_0: JSON.stringify([kayit(1), kayit(2)]), ig_sil_n: "1", ig_sil_0: JSON.stringify([["1", z]]) };
  const yerel = { [ANAHTAR]: JSON.stringify([kayit(2), kayit(3)]), [ANAHTAR + "_silinen"]: JSON.stringify({ 1: z }) };
  const o = ortamKur({ yerel, bulut });
  assert.deepEqual(o.liste().map((t) => t.id).sort(), [2, 3]);
  assert.deepEqual(JSON.parse(bulut.ig_0).map((t) => t.id).sort(), [2, 3], "yereldeki yüklendi, silinen buluttan çıktı");
});

test("kimliksiz kayıt: tek silme ve hepsini sil diğer cihazdan geri gelmiyor", () => {
  const { id: _a, ...k1 } = kayit(1), { id: _b, ...k2 } = kayit(2);
  const ikisi = JSON.stringify([k1, k2]);
  for (const hepsi of [false, true]) {
    const bulut = { ig_n: "1", ig_0: ikisi };
    const yerelB = { [ANAHTAR]: ikisi };
    const a = ortamKur({ yerel: { [ANAHTAR]: ikisi }, bulut });
    assert.equal(a.liste().length, 2, "kimliksiz kayıtlar çoğalmadı");
    if (hepsi) a.el("temizle").onclick();
    else a.el("liste").onclick({ target: a.el("liste").children.find((tr) => tr.children[0].textContent === "11-01").children[7].children[0] });
    const kalan = hepsi ? [] : ["2026-11-02"];
    assert.deepEqual(a.liste().map((t) => t.tarih), kalan);
    assert.ok(!Object.keys(JSON.parse(a.js("JSON.stringify(silinen)"))).includes("undefined"));
    const b = ortamKur({ yerel: yerelB, bulut });
    assert.deepEqual(b.liste().map((t) => t.tarih), kalan, "B cihazında geri gelmedi");
    assert.deepEqual(JSON.parse(bulut.ig_0).map((t) => t.tarih), kalan, "buluta geri yazılmadı");
  }
});

test("CSV'den gelen not 80 karaktere kesiliyor", async () => {
  const o = ortamKur();
  await o.dosyaYukle("tarih,varlik,tur,yon,kaldirac,giris,cikis,miktar,ucret,fonlama,not\n2026-11-01,BTC,spot,long,1,100,110,1,0,0," + "a".repeat(200) + "\n");
  assert.equal(o.liste()[0].not.length, 80);
});

test("eski bulut kaydı (mezar taşı anahtarı yok, eski alanlar) okunuyor", () => {
  const eski = [{ id: 5, tarih: "2026-10-01", varlik: "SOL", yon: "short", giris: 150, cikis: 140, miktar: 10, ucret: 1, not: "" }];
  const bulut = { ig_n: "1", ig_0: JSON.stringify(eski) };
  const yerel = {};
  const o = ortamKur({ yerel, bulut });
  assert.equal(o.liste().length, 1);
  assert.equal(o.liste()[0].tur, "kaldirac");
  assert.equal(o.el("sToplam").textContent, "99");
  assert.equal(JSON.parse(yerel[ANAHTAR]).length, 1);
  assert.deepEqual(JSON.parse(bulut.ig_0), eski, "eski bulut kaydı değiştirilmedi");
});

test("yalnız yerelde olan işlem bulut okununca kaybolmuyor", () => {
  const bulut = { ig_n: "1", ig_0: JSON.stringify([kayit(1), kayit(2)]) };
  const o = ortamKur({ yerel: { [ANAHTAR]: JSON.stringify([kayit(3)]) }, bulut });
  assert.deepEqual(o.liste().map((t) => t.id).sort(), [1, 2, 3]);
  assert.equal(JSON.parse(bulut.ig_0).length, 3);
});

test("süresi dolan mezar taşı atılıyor", () => {
  const simdi = Date.UTC(2026, 10, 12, 9);
  const yerel = { [ANAHTAR + "_silinen"]: JSON.stringify({ 1: simdi - 400 * 864e5, 2: simdi - 864e5 }) };
  const o = ortamKur({ yerel, simdi });
  assert.deepEqual(Object.keys(JSON.parse(o.js("JSON.stringify(silinen)"))), ["2"]);
});

const CSV_KLASOR = process.env.IG_CSV_KLASOR;
const ESKI_HTML = process.env.IG_ESKI_HTML;
test("mevcut test CSV'leri hâlâ içe aktarılıyor (eski sürümle aynı sonuç)", { skip: !CSV_KLASOR && "IG_CSV_KLASOR verilmedi" }, (t) => {
  const dosyalar = fs.readdirSync(CSV_KLASOR).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
  assert.ok(dosyalar.length > 0);
  const simdi = Date.UTC(2026, 10, 12, 9);
  const eskiBetik = ESKI_HTML ? betikAl(fs.readFileSync(ESKI_HTML, "utf8")) : null;
  const calistir = (betik, metin) => {
    const o = ortamKur({ betik, simdi, siki: false });
    o.ctx.__metin = metin;
    return JSON.parse(o.js("JSON.stringify((s=>({n:s.n,tip:s.tip||null,acik:s.acik||null,yeni:(s.yeni||[]).map(({id,...r})=>r)}))(iceAktar(__metin)))"));
  };
  let toplam = 0;
  for (const f of dosyalar) {
    const metin = fs.readFileSync(path.join(CSV_KLASOR, f), "utf8");
    const yeni = calistir(BETIK, metin);
    toplam += yeni.n;
    t.diagnostic(`${f}: ${yeni.n} işlem, tip=${yeni.tip}`);
    assert.ok(yeni.tip, f + " tanınmadı");
    if (eskiBetik) assert.deepEqual(yeni, calistir(eskiBetik, metin), f + " eski sürümden farklı");
  }
  assert.ok(toplam > 0);
  if (!eskiBetik) t.diagnostic("IG_ESKI_HTML verilmedi, eski sürüm karşılaştırması yapılmadı");
});
