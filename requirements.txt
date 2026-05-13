# App Control de Datafonos - Google Sheets

Aplicación profesional en Streamlit para controlar datafonos usando Google Sheets como base de datos.

## Usuario inicial

Usuario: admin  
Contraseña: admin123

## Archivos incluidos

- `app.py`
- `requirements.txt`
- `.streamlit/secrets.toml.example`
- `README.md`

## Base de datos

Debes subir el archivo Excel `Libro_Base_Control_Datafonos_Google_Sheets.xlsx` a Google Drive y abrirlo como Google Sheets.

Pestañas requeridas:

- Inventario
- Historial
- Usuarios
- Config

## Pasos para publicar gratis en Streamlit Cloud

1. Sube este ZIP descomprimido a un repositorio de GitHub.
2. Sube el Excel base a Google Drive.
3. Abre el archivo como Google Sheets.
4. Copia el ID del Google Sheet desde la URL.
5. En Google Cloud crea una Service Account y descarga el JSON.
6. Comparte el Google Sheet con el `client_email` del JSON como Editor.
7. En Streamlit Cloud crea la app desde GitHub.
8. En Settings > Secrets pega el contenido de `.streamlit/secrets.toml.example` con tus datos reales.
9. Deploy.

## Importante

La app no guarda datos localmente. Todo se lee y se escribe en Google Sheets.