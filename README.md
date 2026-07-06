# Control de Datafonos

Aplicación Streamlit para administrar el inventario de datafonos, registrar movimientos, consultar historial, exportar reportes y gestionar usuarios con roles.

## Funcionalidades

- Dashboard con métricas por estatus, hotel y departamento.
- Inventario maestro unificado con filtros, tabla, registro de datafonos y exportación CSV/Excel.
- Edición de ubicación, responsable, estatus y bitácora desde la fila seleccionada.
- Generación de carta de resguardo en PDF para firma del responsable.
- Historial de cambios con filtros y exportación.
- Administración de usuarios para rol `Administrador`.

## Requisitos

- Python 3.11.
- Acceso a un Google Sheet compartido con el `client_email` de una cuenta de servicio.
- Dependencias en `requirements.txt`.
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
app.py                  # Aplicación Streamlit
requirements.txt        # Dependencias Python
runtime.txt             # Runtime esperado
secrets.toml.example    # Plantilla de configuración sin credenciales reales
devcontainer.json       # Configuración para Codespaces/devcontainer
```

## Mejoras recomendadas siguientes

- Separar `app.py` en módulos: conexión Google Sheets, autenticación, dominio/inventario, PDF, reportes y vistas.
- Agregar pruebas unitarias para validaciones, hashing, filtros y serialización de Excel.
- Incorporar control de concurrencia para evitar sobrescrituras cuando dos usuarios actualicen la misma terminal.
- Añadir reglas de negocio configurables, por ejemplo exigir `sustituido_por` cuando el estatus sea `Sustituido`.
- Crear una pantalla de configuración administrable para hoteles, áreas, departamentos y estatus.
