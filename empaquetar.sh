#!/usr/bin/env bash
# Genera el .zip para la Chrome Web Store en dist/.
#
# Trabaja sobre una COPIA: el manifest.json del repo no se toca. La versión
# anterior de estas instrucciones decía "edita el manifest, empaqueta y acuérdate
# de revertirlo", que es justo la clase de paso manual que un día se olvida —y se
# sube a la tienda un permiso de host sobre localhost, o se queda el repo sin él y
# el desarrollo local deja de funcionar sin decir por qué.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
SALIDA="dist/copiar-numero-whatsapp-${VERSION}.zip"

# Lo que va dentro. Fuera quedan docs, LICENSE, dist/ y el propio script: la
# tienda rechaza lo que no se usa y cada archivo de más es superficie que revisar.
ARCHIVOS=(
  manifest.json Logo.png
  numero-utils.js background.js overlay.js telegram.js
  popup.html popup.js
  copynumber.js copyusername.js copyname.js content.js buscarelixir.js
)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for f in "${ARCHIVOS[@]}"; do
  [ -f "$f" ] || { echo "FALTA: $f"; exit 1; }
  cp "$f" "$TMP/"
done

# localhost solo sirve para probar contra el backend en el propio equipo. En el
# paquete sería un permiso de host más que declarar y justificar, sobre un origen
# HTTP en claro, y eso alarga la revisión sin darle nada a quien la instala.
python3 - "$TMP/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
antes = len(m["host_permissions"])
m["host_permissions"] = [h for h in m["host_permissions"] if "localhost" not in h]
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
print(f"  host_permissions: {antes} -> {len(m['host_permissions'])} (localhost fuera)")
PY

mkdir -p dist
rm -f "$SALIDA"
(cd "$TMP" && zip -qr - .) > "$SALIDA"

echo "  $SALIDA"
unzip -l "$SALIDA" | tail -3
echo
echo "Comprobación final del manifest empaquetado:"
unzip -p "$SALIDA" manifest.json | python3 -c "
import json,sys
m=json.load(sys.stdin)
print('  version:', m['version'])
print('  permisos:', ', '.join(m['permissions']))
for h in m['host_permissions']:
    print('  host:', h)
assert not any('localhost' in h for h in m['host_permissions']), 'localhost SIGUE en el paquete'
print('  OK: sin localhost')
"
