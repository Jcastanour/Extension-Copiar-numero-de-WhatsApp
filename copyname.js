// copyname.js
function copiarNombreRapido() {
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/[\u202A\u202C]/g, '').trim();
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
      alert("Abre un chat primero.");
      return;
  }
  
  let nameElement = header.querySelector('span[title]');
      
  if (!nameElement || cleanText(nameElement.title) === "") {
      const spans = header.querySelectorAll('span[dir="auto"]');
      for(const span of spans) {
          const text = cleanText(span.textContent);
          if(text.length > 0 && !text.includes("Typing") && !text.includes("escribiendo")) {
              nameElement = span;
              break;
          }
      }
  }
  
  if (nameElement) {
      let text = cleanText(nameElement.title || nameElement.textContent);
      
      const phoneRegex = /^\+?\d{1,4}[\s\-]?\(?\d{1,3}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}$/;
      const digitsOnly = text.replace(/[^\d+]/g, '');
      
      if (text.length >= 8 && text.includes('+') && phoneRegex.test(digitsOnly)) {
          alert("Contacto sin nombre (solo número)");
      } else {
          copiarAlPortapapeles(text);
          alert("Número copiado al portapapeles: " + text); // Conserva el mensaje original, aunque copia nombre
      }
  } else {
      alert("No se encontró el nombre en el encabezado.");
  }
}

copiarNombreRapido();
