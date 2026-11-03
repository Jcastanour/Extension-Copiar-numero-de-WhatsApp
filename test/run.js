// Pruebas sin navegador: node test/run.js
//
// 1) codigo-html.js contra correos reales de Storetools (test/fixtures), para
//    que un cambio en la extracción no rompa Max, Disney+ ni Prime.
// 2) rutaCodigo() de numero-utils.js: quién es el proveedor y por dónde va el
//    código según los ajustes. numero-utils.js espera un `window`, así que se
//    evalúa en un contexto con uno de mentira.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
let pasadas = 0;
function prueba(nombre, fn) {
  try { fn(); pasadas++; console.log("  ok  " + nombre); }
  catch (e) { console.log("  FALLA " + nombre + "\n      " + (e && e.message)); process.exitCode = 1; }
}
function fixture(nombre) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", nombre + ".json"), "utf8"));
}

console.log("codigo-html.js");
const { extraerCodigoDeHtml, textoDeHtml } = require(path.join(raiz, "codigo-html.js"));
for (const [f, esperado] of [["storetools-max", "930070"], ["storetools-disney", "165784"], ["storetools-prime", "868766"]]) {
  prueba(`${f} → ${esperado}`, () => {
    const r = extraerCodigoDeHtml(fixture(f).resultadoCorreos[0].mensaje);
    assert.equal(r.codigo, esperado, `sacó ${r.codigo} (${r.como})`);
  });
}
prueba("un año no es un código", () => {
  assert.equal(extraerCodigoDeHtml("<p>©2026 Acme. Your code: 4471</p>").codigo, "4471");
  assert.equal(extraerCodigoDeHtml("<p>©2026 Acme</p>").codigo, null);
});
prueba("sin dígitos pero con enlace útil devuelve el enlace", () => {
  const r = extraerCodigoDeHtml('<a href="https://ablink.alerts.hbomax.com/x">t</a><a href="https://www.netflix.com/account/travel/verify?x=1">Sí</a>');
  assert.equal(r.codigo, null);
  assert.equal(r.link, "https://www.netflix.com/account/travel/verify?x=1");
});
prueba("quita estilos, comentarios e invisibles", () => {
  assert.equal(textoDeHtml("<style>a{b:1}</style><!-- c --><p>Ho‌la&nbsp;<b>mundo</b></p>"), "Hola mundo");
});

console.log("numero-utils.js · rutaCodigo");
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, "numero-utils.js"), "utf8"), ctx);
const u = ctx.window.__elixirUtils;

const YT_MAX = { provider: "ProveedorYT", account_type_name: "Max" };
const YT_AMAZON = { provider: "ProveedorYT", account_type_name: "Amazon" };
const YT_PLEX = { provider: "ProveedorYT", account_type_name: "Plex 2" };
const KH_DISNEY = { provider: "Digital KH", account_type_name: "Disney Premium", is_disney: true };
const WOLF_MAX = { provider: "Andrés", account_type_name: "Max" };
const NETFLIX = { provider: "Elixir", account_type_name: "Netflix Celular/PC" };
const SIN_PROV_DISNEY = { account_type_name: "Disney Premium", is_disney: true };
const SIN_PROV = { account_type_name: "Max" };

prueba("proveedorDe: ProveedorYT gana a kh/wolf y Netflix a todo", () => {
  assert.equal(u.proveedorDe(YT_MAX), "storetools");
  assert.equal(u.proveedorDe(KH_DISNEY), "kh");
  assert.equal(u.proveedorDe(WOLF_MAX), "wolf");
  assert.equal(u.proveedorDe(NETFLIX), "netflix-elixir");
  assert.equal(u.proveedorDe({ provider: "ProveedorYT", account_type_name: "Netflix Exterior" }), "netflix-elixir");
  assert.equal(u.proveedorDe(SIN_PROV_DISNEY), "kh", "sin proveedor, Disney sigue yendo a KH");
  assert.equal(u.proveedorDe(SIN_PROV), "otro");
});
prueba("plataformaStoretools: Amazon es Prime, Max es max, Plex no es nada", () => {
  assert.equal(u.plataformaStoretools(YT_AMAZON).num, 3);
  assert.equal(u.plataformaStoretools(YT_MAX).id, "max");
  assert.equal(u.plataformaStoretools(KH_DISNEY).nombre, "Disney+");
  assert.equal(u.plataformaStoretools(YT_PLEX), null);
  assert.equal(u.plataformaStoretools({ account_type_name: "Vix" }).num, 7);
  assert.equal(u.plataformaStoretools({ account_type_name: "Universal" }).num, 10);
});
prueba("por defecto todo va por Telegram, cada uno a su bot", () => {
  const sinCfg = {};
  assert.deepEqual([u.rutaCodigo(YT_MAX, sinCfg).ruta, u.rutaCodigo(YT_MAX, sinCfg).bot], ["telegram", "CodigosTV_bot"]);
  assert.deepEqual([u.rutaCodigo(KH_DISNEY, sinCfg).ruta, u.rutaCodigo(KH_DISNEY, sinCfg).bot], ["telegram", "userdkh_bot"]);
  assert.deepEqual([u.rutaCodigo(WOLF_MAX, sinCfg).ruta, u.rutaCodigo(WOLF_MAX, sinCfg).bot], ["telegram", "WolfStr_bot"]);
  assert.equal(u.rutaCodigo(SIN_PROV, sinCfg).bot, "WolfStr_bot");
});
prueba("Netflix Elixir es directo siempre, sin interruptor", () => {
  assert.equal(u.rutaCodigo(NETFLIX, {}).ruta, "directo");
  assert.equal(u.rutaCodigo(NETFLIX, { modoCodigo: { storetools: "telegram", kh: "telegram" } }).ruta, "directo");
});
prueba("directo solo si el interruptor está en directo Y hay configuración", () => {
  assert.equal(u.rutaCodigo(YT_MAX, { modoCodigo: { storetools: "directo" } }).ruta, "telegram", "sin ID baja a Telegram");
  assert.equal(u.rutaCodigo(YT_MAX, { modoCodigo: { storetools: "directo" }, storetoolsId: " 123 " }).ruta, "directo");
  assert.equal(u.rutaCodigo(YT_MAX, { storetoolsId: "123" }).ruta, "telegram", "con ID pero interruptor en Telegram");
  assert.equal(u.rutaCodigo(KH_DISNEY, { modoCodigo: { kh: "directo" } }).ruta, "telegram", "sin slug baja a Telegram");
  assert.equal(u.rutaCodigo(KH_DISNEY, { modoCodigo: { kh: "directo" }, fcmSlug: "digital-kh" }).ruta, "directo");
});
prueba("los interruptores son independientes", () => {
  const cfg = { modoCodigo: { storetools: "directo", kh: "telegram" }, storetoolsId: "1", fcmSlug: "digital-kh" };
  assert.equal(u.rutaCodigo(YT_MAX, cfg).ruta, "directo");
  assert.equal(u.rutaCodigo(KH_DISNEY, cfg).ruta, "telegram");
  assert.equal(u.rutaCodigo(WOLF_MAX, { modoCodigo: { wolf: "directo" } }).ruta, "telegram", "Wolf nunca es directo todavía");
});
prueba("la ruta lleva la plataforma para el menú del bot y para el endpoint", () => {
  assert.equal(u.rutaCodigo(YT_AMAZON, {}).plataforma.nombre, "Prime");
  assert.equal(u.rutaCodigo(YT_PLEX, {}).plataforma, null);
  assert.equal(u.rutaCodigo(KH_DISNEY, { modoCodigo: { kh: "directo" }, fcmSlug: "x" }).plataforma.id, "disney");
});
prueba("los bots se pueden cambiar desde Ajustes", () => {
  assert.equal(u.rutaCodigo(YT_MAX, { tgBotStore: "OtroBot" }).bot, "OtroBot");
  assert.equal(u.rutaCodigo(KH_DISNEY, { tgBotKh: "kh2" }).bot, "kh2");
});

console.log(process.exitCode ? "\nHAY FALLOS" : `\n${pasadas} pruebas, todo bien`);
