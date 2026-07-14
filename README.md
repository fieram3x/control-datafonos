# Control de Datafonos

Aplicación para administrar el inventario de datafonos, registrar movimientos, consultar historial, exportar reportes y gestionar usuarios con roles.

El repositorio conserva la versión Streamlit (`app.py`) y agrega una versión Cloudflare Workers + Static Assets que usa la misma base de datos en Google Sheets.

## Funcionalidades

- Dashboard con métricas por estatus, hotel y departamento.
- Dashboard interactivo: las métricas y alertas abren el inventario ya filtrado.
- Inventario maestro con búsqueda global, vistas rápidas, filtros por columna, selección múltiple, actualización masiva controlada y exportación XLSX real.
- Edición de ubicación, responsable, estatus y bitácora desde la fila seleccionada.
- Generación de carta de resguardo en PDF únicamente para los datafonos seleccionados.
- Historial con búsqueda, rango de fechas, usuario responsable y exportación XLSX.
- Administración de usuarios para rol `Administrador`.
- Control de concurrencia para advertir si otra persona modificó un registro antes de guardar.

## Ejecutar en Cloudflare

La versión Cloudflare está en:

```text
src/worker.js          # API sobre Cloudflare Workers
public/                # Frontend HTML/CSS/JS
wrangler.jsonc         # Configuración de Cloudflare
package.json           # Scripts de desarrollo y despliegue
```

Requisitos:

- Node.js 20 o superior.
- Cuenta de Cloudflare con Wrangler.
- El mismo Google Sheet compartido con el `client_email` de la cuenta de servicio.
- Credenciales de la cuenta de servicio de Google con acceso a Sheets.

Instalación local:

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
```

Edita `.dev.vars` con tus valores reales:

```text
GOOGLE_SHEET_ID="..."
GOOGLE_CLIENT_EMAIL="..."
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APP_INITIAL_ADMIN_USER="admin"
APP_INITIAL_ADMIN_PASSWORD="cambia-esta-clave"
APP_SESSION_SECRET="cambia-este-secreto-largo"
```

Ejecutar local:

```powershell
pnpm run dev:cf
```

Validar antes de publicar:

```powershell
pnpm run check:cf
```

Publicar en Cloudflare:

```powershell
pnpm exec wrangler secret put GOOGLE_SHEET_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_EMAIL
pnpm exec wrangler secret put GOOGLE_PRIVATE_KEY
pnpm exec wrangler secret put APP_INITIAL_ADMIN_USER
pnpm exec wrangler secret put APP_INITIAL_ADMIN_PASSWORD
pnpm exec wrangler secret put APP_SESSION_SECRET
pnpm run deploy:cf
```

Importante: la hoja de Google debe estar compartida con el correo `GOOGLE_CLIENT_EMAIL`. No hace falta cambiar la estructura de la base de datos; la app usa las hojas `Inventario`, `Historial`, `Usuarios` y `Config`.

## Ejecutar en Streamlit

La versión anterior sigue disponible en `app.py`.

Requisitos:

- Python 3.11.
- Acceso a un Google Sheet compartido con el `client_email` de una cuenta de servicio.
- Dependencias en `requirements.txt`.
- `streamlit-aggrid` para la tabla de inventario con filtros por columna.
- `reportlab` para crear los resguardos en PDF.

Instalación local:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
streamlit run app.py
```

## Configuración de Secrets

En local, crea `.streamlit/secrets.toml` a partir de `secrets.toml.example`.

La app espera estas secciones:

- `[google_sheets]`: `spreadsheet_id` del archivo de Google Sheets.
- `[gcp_service_account]`: credenciales de la cuenta de servicio.
- `[app]`: usuario y contraseña inicial para crear el primer administrador cuando la hoja `Usuarios` esté vacía.

Importante: `.streamlit/secrets.toml` está ignorado por Git. No subas credenciales reales al repositorio.

## Hojas de Google Sheets

La app crea hojas faltantes con encabezados esperados:

- `Inventario`
- `Historial`
- `Usuarios`
- `Config` opcional para listas como hoteles, áreas, departamentos, estatus, roles y estados activo/inactivo.

Si `Config` no existe o está incompleta, se usan valores por defecto definidos en `app.py`.

La versión web agrega automáticamente las columnas `fecha_hora` y `usuario` al final de `Historial` cuando todavía no existen. Los movimientos anteriores continúan siendo compatibles.

## Seguridad

- Las contraseñas nuevas se guardan con PBKDF2-SHA256 y salt aleatorio.
- Si existen contraseñas antiguas en texto plano, se migran a hash automáticamente después de un login exitoso.
- El primer administrador ya no usa una contraseña fija en el código; define `app.initial_admin_password` en Secrets.
- Los valores leídos desde Google Sheets se escapan antes de renderizarse en bloques HTML personalizados.

## Resguardos PDF

En `Inventario Maestro`, selecciona una fila de la tabla y usa `Generar resguardo PDF`. La app solicita:

- Tipo de documento: cédula o pasaporte.
- Número de documento.
- Nombre del responsable.
- Puesto del responsable.
- Observación opcional.

La fecha del resguardo se genera automáticamente con la fecha del día.

## Estructura

```text
app.py                  # Aplicación Streamlit anterior
src/worker.js           # API Cloudflare Workers
public/                 # Interfaz web Cloudflare
wrangler.jsonc          # Configuración Cloudflare
package.json            # Scripts Node/Wrangler
requirements.txt        # Dependencias Python
runtime.txt             # Runtime esperado
secrets.toml.example    # Plantilla de configuración sin credenciales reales
.dev.vars.example       # Plantilla de configuración local para Cloudflare
devcontainer.json       # Configuración para Codespaces/devcontainer
```

## Mejoras recomendadas siguientes

- Separar `app.py` en módulos: conexión Google Sheets, autenticación, dominio/inventario, PDF, reportes y vistas.
- Agregar pruebas unitarias para validaciones, hashing, filtros y serialización de Excel.
- Incorporar control de concurrencia para evitar sobrescrituras cuando dos usuarios actualicen la misma terminal.
- Añadir reglas de negocio configurables, por ejemplo exigir `sustituido_por` cuando el estatus sea `Sustituido`.
- Crear una pantalla de configuración administrable para hoteles, áreas, departamentos y estatus.
