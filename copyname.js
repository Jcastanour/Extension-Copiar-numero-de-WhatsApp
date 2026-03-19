// copyname.js
function copiarNombreRobusto() {
  const phoneRegex = /^\+?\d{1,4}[\s\-]?\(?\d{1,3}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}$/;

  function cleanText(text) {
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
  if (header) {
      let nameElement = header.querySelector('span[title]');
      
      if (!nameElement) {
         const spans = header.querySelectorAll('span[dir="auto"]');
         for(const span of spans) {
             const text = cleanText(span.innerText || "");
             if(text.length > 0 && !text.includes("Typing") && !text.includes("escribiendo")) {
                 nameElement = span;
                 break;
             }
         }
      }
      
      if (nameElement) {
          let text = cleanText(nameElement.innerText || nameElement.title || "");
          // Si el "nombre" tiene formato de número, avisamos
          if (text.length >= 8 && text.includes('+') && phoneRegex.test(text.replace(/[^\d+]/g, ''))) {
              alert("Contacto sin nombre (solo número)");
          } else {
              copiarAlPortapapeles(text);
          }
      } else {
          alert("No se encontró el nombre en el encabezado.");
      }
  } else {
      alert("Abre un chat primero.");
  }
}

copiarNombreRobusto();
