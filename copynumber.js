// copynumber.js
function copiarNumeroOptimizado() {
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/[\u202A\u202C]/g, '').trim();
  }

  function isNumberMatch(text) {
    const clean = cleanText(text);
    if (clean.length < 8 || !clean.includes('+')) return false;
    // Quitamos todo excepto el + y los números para probar
    const digitsOnly = clean.replace(/[^\d+]/g, '');
    // Un número de WhatsApp (E.164) tiene un + opcional seguido de 7 a 15 dígitos
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
    alert("Por favor abre un chat de WhatsApp Web primero.");
    return;
  }

  // 1. CHEQUEAR ENCABEZADO
  const headerSpans = header.querySelectorAll('span[dir="auto"], span[title]');
  for (const span of headerSpans) {
    const text = cleanText(span.textContent);
    if (isNumberMatch(text)) {
      copiarAlPortapapeles(text);
      return; 
    }
  }

  // 2. HACER CLIC PARA ABRIR EL PANEL DE CONTACTO
  // En WhatsApp, el evento de abrir el panel suele estar en el texto del nombre o la foto.
  // Dar clic directamente en la etiqueta <header> puede no hacer nada en versiones recientes de React.
  const clickableArea = header.querySelector('span[dir="auto"]') || header.querySelector('div[role="button"]') || header;
  clickableArea.click();

  // 3. ESPERAR 500ms Y EXTRAER EL NÚMERO
  setTimeout(() => {
    const mainArea = document.querySelector('#main');
    const leftPane = document.getElementById('pane-side') || document.querySelector('#pane-side');
    const allSpans = document.querySelectorAll('span[dir="auto"], span.copyable-text');
    
    let foundNumber = null;

    for (const span of allSpans) {
      if (mainArea && mainArea.contains(span)) continue; // descartar chat #main
      if (leftPane && leftPane.contains(span)) continue; // descartar lista izquierda

      const rect = span.getBoundingClientRect();
      if (rect.left < window.innerWidth / 3) continue; // asegurar que visualmente está a la derecha

      const text = cleanText(span.textContent);
      if (isNumberMatch(text)) {
        foundNumber = text;
        break;
      }
    }

    if (foundNumber) {
      copiarAlPortapapeles(foundNumber);
    } else {
      alert("No se encontró el número de teléfono.");
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

copiarNumeroOptimizado();
