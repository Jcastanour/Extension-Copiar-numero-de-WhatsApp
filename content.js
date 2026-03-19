// content.js
function abrirContactosRapido() {
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/[\u202A\u202C]/g, '').trim();
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

  const header = document.querySelector('#main header');
  if (!header) {
    alert("Abre un chat de WhatsApp Web primero.");
    return;
  }

  let fallbackName = "";
  const titleSpan = header.querySelector('span[title]');
  if (titleSpan && titleSpan.title) fallbackName = cleanText(titleSpan.title);

  // 1. CHEQUEAR EN CABECERA
  const headerSpans = header.querySelectorAll('span[dir="auto"], span[title]');
  for (const span of headerSpans) {
    const text = cleanText(span.textContent);
    if (isNumberMatch(text)) {
      copiarAlPortapapeles(text);
      window.open("https://contacts.google.com/new", "_blank");
      return; 
    }
    if (text.length > 0 && !text.toLowerCase().includes('click') && !text.includes('typing') && !text.includes('escribiendo') && !isNumberMatch(text)) {
        if (!fallbackName) fallbackName = text;
    }
  }

  // 2. ABRIR PANEL LATERAL BÚSQUEDA ROBUSTA
  const clickableArea = header.querySelector('span[dir="auto"]') || header.querySelector('div[role="button"]') || header;
  clickableArea.click();

  // 3. ESPERAR Y BUSCAR EN LATERAL DERECHO
  setTimeout(() => {
    const mainArea = document.querySelector('#main');
    const leftPane = document.getElementById('pane-side') || document.querySelector('#pane-side');
    const allSpans = document.querySelectorAll('span[dir="auto"], span.copyable-text');
    
    let foundNumber = null;

    for (const span of allSpans) {
      if (mainArea && mainArea.contains(span)) continue; // descartar chat activo
      if (leftPane && leftPane.contains(span)) continue; // descartar historial de chats

      if (span.getBoundingClientRect().left < window.innerWidth / 3) continue;

      const text = cleanText(span.textContent);
      if (isNumberMatch(text)) {
        foundNumber = text;
        break;
      }
    }

    if (foundNumber) {
      copiarAlPortapapeles(foundNumber);
      window.open("https://contacts.google.com/search/" + encodeURIComponent(foundNumber), "_blank");
    } else {
      console.log("No se pudo encontrar el número, buscando por nombre.");
      if (fallbackName) {
         window.open("https://contacts.google.com/search/" + encodeURIComponent(fallbackName), "_blank");
      } else {
         alert("No se encontró ni número ni nombre válido.");
      }
    }

    // 4. CERRAR EL PANEL LATERAL INFALIBLEMENTE
    const headers = document.querySelectorAll('header');
    for (let i = headers.length - 1; i >= 0; i--) {
      const h = headers[i];
      if (h.closest('#main')) continue; // ignorar header principal
      
      let closeSpan = h.querySelector('span[data-icon="x"]');
      if (!closeSpan) {
          // Soporte para nuevo diseño de WhatsApp con SVG interno
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

abrirContactosRapido();
