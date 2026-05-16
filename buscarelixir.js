// buscarelixir.js
// 👇 Cambiar aquí cuando se tenga el dominio definitivo
const ELIXIR_BASE_URL = "https://elixircuentas-prod.fly.dev/";

function buscarEnElixir() {
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/[‪‬]/g, '').trim();
  }

  function isNumberMatch(text) {
    const clean = cleanText(text);
    if (clean.length < 8 || !clean.includes('+')) return false;
    const digitsOnly = clean.replace(/[^\d+]/g, '');
    return /^\+?\d{7,16}$/.test(digitsOnly);
  }

  function copiarAlPortapapeles(texto) {
    const temp = document.createElement("textarea");
    temp.value = texto;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }

  function abrirElixir(numero) {
    const url = ELIXIR_BASE_URL + "?" +
                new URLSearchParams({ q: numero }).toString();
    window.open(url, "_blank");
  }

  const header = document.querySelector('#main header');
  if (!header) {
    alert("Abre un chat de WhatsApp Web primero.");
    return;
  }

  // 1. CHEQUEAR ENCABEZADO
  const headerSpans = header.querySelectorAll('span[dir="auto"], span[title]');
  for (const span of headerSpans) {
    const text = cleanText(span.textContent);
    if (isNumberMatch(text)) {
      copiarAlPortapapeles(text);
      abrirElixir(text);
      return;
    }
  }

  // 2. ABRIR PANEL LATERAL
  const clickableArea = header.querySelector('span[dir="auto"]') || header.querySelector('div[role="button"]') || header;
  clickableArea.click();

  // 3. ESPERAR Y BUSCAR EN LATERAL DERECHO
  setTimeout(() => {
    const mainArea = document.querySelector('#main');
    const leftPane = document.getElementById('pane-side') || document.querySelector('#pane-side');
    const allSpans = document.querySelectorAll('span[dir="auto"], span.copyable-text');

    let foundNumber = null;

    for (const span of allSpans) {
      if (mainArea && mainArea.contains(span)) continue;
      if (leftPane && leftPane.contains(span)) continue;

      if (span.getBoundingClientRect().left < window.innerWidth / 3) continue;

      const text = cleanText(span.textContent);
      if (isNumberMatch(text)) {
        foundNumber = text;
        break;
      }
    }

    if (foundNumber) {
      copiarAlPortapapeles(foundNumber);
      abrirElixir(foundNumber);
    } else {
      alert("No se encontró el número de teléfono.");
    }

    // 4. CERRAR EL PANEL LATERAL
    const headers = document.querySelectorAll('header');
    for (let i = headers.length - 1; i >= 0; i--) {
      const h = headers[i];
      if (h.closest('#main')) continue;

      let closeSpan = h.querySelector('span[data-icon="x"]');
      if (!closeSpan) {
        const titles = h.querySelectorAll('title');
        for (const t of titles) {
          if (t.textContent === 'ic-close' || t.textContent.includes('close') || t.textContent.includes('cerrar')) {
            closeSpan = t.closest('span') || t.parentElement;
            break;
          }
        }
      }

      if (closeSpan) {
        const btn = closeSpan.closest('div[role="button"]') || closeSpan.closest('button') || closeSpan.parentElement;
        if (btn) btn.click();
        break;
      }
    }
  }, 500);
}

buscarEnElixir();
