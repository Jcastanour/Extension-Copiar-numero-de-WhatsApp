// content.js
function abrirContactosRobusto() {
  const phoneRegex = /^\+?\d{1,4}[\s\-]?\(?\d{1,3}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}$/;
  
  function cleanText(text) {
    return text.replace(/[\u202A\u202C]/g, '').trim();
  }

  function findNumberInElement(element) {
    if (!element) return null;
    const elements = element.querySelectorAll('span, div');
    for (const el of elements) {
      if (el.childElementCount > 1) continue; 
      
      const text = cleanText(el.innerText || el.textContent);
      if (text.length >= 8 && text.includes('+') && phoneRegex.test(text.replace(/[^\d+]/g, ''))) {
          return text;
      }
    }
    return null;
  }
  
  function getContactNameFromHeader(header) {
      if (!header) return "";
      const spans = header.querySelectorAll('span[title], span[dir="auto"]');
      for (const span of spans) {
        const text = cleanText(span.innerText || span.textContent);
        if (text && text.length > 0 && !text.toLowerCase().includes('click') && !text.includes('typing') && !text.includes('escribiendo')) {
            return text;
        }
      }
      return "";
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
  let number = findNumberInElement(header);
  let nameFallback = header ? getContactNameFromHeader(header) : "";

  if (number) {
    copiarAlPortapapeles(number);
    window.open("https://contacts.google.com/new", "_blank");
    return;
  }

  if (header) {
    header.click(); 
    
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const sidePanel = document.querySelector('#app').querySelector(':scope > div > div > div:nth-child(6)') || document.querySelector('[data-testid="contact-info-drawer"]') || document.body;
      let foundNumber = findNumberInElement(sidePanel);
      
      if (foundNumber) {
        clearInterval(interval);
        copiarAlPortapapeles(foundNumber);
        window.open("https://contacts.google.com/search/" + encodeURIComponent(foundNumber), "_blank");
      } else if (attempts >= 10) {
        clearInterval(interval);
        console.log("No se pudo encontrar el número, buscando por nombre.");
        if (nameFallback) {
           window.open("https://contacts.google.com/search/" + encodeURIComponent(nameFallback), "_blank");
        } else {
           alert("No se encontró ni número ni nombre válido.");
        }
      }
    }, 500);
  } else {
    alert("Abre un chat de WhatsApp Web primero.");
  }
}

abrirContactosRobusto();
