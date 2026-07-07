import streamlit as st
import pandas as pd
import altair as alt
from datetime import date, datetime
import base64
import hashlib
import hmac
import html
import os
import re
import uuid
import time
from io import BytesIO
import gspread
from google.oauth2.service_account import Credentials

try:
    from st_aggrid import AgGrid, DataReturnMode, GridOptionsBuilder, GridUpdateMode, JsCode
except ModuleNotFoundError:
    AgGrid = None
    DataReturnMode = None
    GridOptionsBuilder = None
    GridUpdateMode = None
    JsCode = None

st.set_page_config(
    page_title="Control de Datafonos",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="expanded"
)

INVENTARIO_COLUMNS = [
    "id", "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
    "responsable", "estatus", "fecha_asignacion", "fecha_cambio", "sustituido_por",
    "observacion", "creado_el", "actualizado_el"
]

HISTORIAL_COLUMNS = [
    "id_movimiento", "fecha", "terminal_anterior", "terminal_nueva", "hotel", "area",
    "departamento", "estatus_anterior", "estatus_nuevo", "motivo", "responsable", "observacion"
]

USUARIOS_COLUMNS = ["usuario", "clave", "rol", "activo"]
PASSWORD_PREFIX = "pbkdf2_sha256"
SEARCHABLE_INVENTORY_COLUMNS = [
    "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
    "responsable", "estatus", "sustituido_por", "observacion"
]
SEARCHABLE_HISTORY_COLUMNS = [
    "fecha", "terminal_anterior", "terminal_nueva", "hotel", "area",
    "departamento", "estatus_anterior", "estatus_nuevo", "motivo", "responsable",
    "observacion"
]
ROW_ACTION_COLUMN = "acciones"
ROW_ACTION_PLACEHOLDER = "⋮"
ROW_ACTION_TOKEN_COLUMN = "_accion_token"
ROW_ACTION_LABELS = ["Editar estatus", "Editar datos", "Ver bitácora"]

DASHBOARD_PALETTE = [
    "#2563EB", "#16A34A", "#F97316", "#DC2626", "#7C3AED",
    "#0891B2", "#CA8A04", "#DB2777", "#475569", "#65A30D"
]

MONTH_NAMES_ES = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}

STATUS_COLORS = {
    "Activo": "#16A34A",
    "Resguardo": "#2563EB",
    "En reparación": "#F97316",
    "Sustituido": "#7C3AED",
    "Decomisado": "#DC2626",
    "Baja": "#64748B",
}

CONFIG_DEFAULT = {
    "Hoteles": ["5918-MCB", "5917-MPCB", "5910-PPRL", "5911-ZEL", "5930-PGC", "6034-GOLF Hoyo 10&9", "6254-TENNIS", "6374-CASINO"],
    "Departamentos": ["Recepción", "Spa", "A&B", "Hoyo 10&9", "Golf", "Tenis", "Casino", "Administración", "Auditoría", "Otro"],
    "Estatus": ["Activo", "Resguardo", "En reparación", "Sustituido", "Decomisado", "Baja"],
    "Roles": ["Administrador", "Usuario"],
    "Activo": ["Sí", "No"],
    "Areas": ["Operación", "Administración"]
}

CUSTOM_CSS = """
<style>
    .main {background-color: #F7FAFC;}
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);
        border-right: 1px solid #E5E7EB;
    }
    .block-container {padding-top: 1.5rem; padding-bottom: 2rem;}
    .title-card {
        background: linear-gradient(135deg, #EAF6FF 0%, #FFFFFF 72%);
        border: 1px solid #D7ECFF;
        padding: 24px 28px;
        border-radius: 24px;
        margin-bottom: 18px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }
    .title-card h1 {margin: 0; color: #0F172A; font-size: 2rem; font-weight: 800;}
    .title-card p {color: #475569; margin: 7px 0 0 0; font-size: 1rem;}
    div[data-testid="stMetric"] {
        background: white;
        border: 1px solid #E5E7EB;
        padding: 16px;
        border-radius: 18px;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
    }
    .small-note {color: #64748B; font-size: 0.9rem;}
    .status-pill {
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 700;
        display: inline-block;
        text-align: center;
    }
    .pill-activo {background:#DCFCE7; color:#166534;}
    .pill-resguardo {background:#DBEAFE; color:#1D4ED8;}
    .pill-reparacion {background:#FFEDD5; color:#C2410C;}
    .pill-sustituido {background:#F3E8FF; color:#7E22CE;}
    .pill-decomisado {background:#FEE2E2; color:#991B1B;}
    .pill-baja {background:#E5E7EB; color:#374151;}
    .pill-default {background:#F1F5F9; color:#334155;}
    .mini-label {font-size:0.75rem; color:#64748B; margin-bottom:0;}
    .mini-value {font-size:0.95rem; color:#0F172A; font-weight:600;}
    .st-key-sticky_cambios_header,
    div[data-testid="stVerticalBlock"]:has(.sticky-cambios-marker) {
        position: sticky !important;
        top: 0;
        z-index: 999;
        background: #F7FAFC !important;
        padding-bottom: 10px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
    }

    /* Ocultar botones superiores innecesarios y dejar la vista limpia */
    [data-testid="stToolbar"] > div:not(:last-child) {display: none !important;}
    [data-testid="stDecoration"] {display: none !important;}

    .login-card {
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
        margin-top: 18px;
    }
    .login-title {
        font-size: 1.55rem;
        font-weight: 800;
        color: #0F172A;
        margin-bottom: 4px;
    }
    .login-subtitle {
        color: #64748B;
        font-size: 0.95rem;
        margin-bottom: 20px;
    }
    .sidebar-title {
        font-size: 1.2rem;
        font-weight: 800;
        color: #0F172A;
        margin-bottom: 10px;
    }
    .sidebar-user-card {
        background: #F8FAFC;
        border: 1px solid #E5E7EB;
        border-radius: 16px;
        padding: 12px;
        margin-bottom: 16px;
    }
    .sidebar-user-card p {
        margin: 2px 0;
        color: #475569;
        font-size: 0.88rem;
    }
    .sidebar-footer {
        background: #F8FAFC;
        border: 1px solid #E5E7EB;
        border-radius: 14px;
        padding: 10px;
        color: #475569;
        font-size: 0.85rem;
        margin-bottom: 10px;
    }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


@st.cache_resource(show_spinner=False)
def connect_gsheet():
    try:
        spreadsheet_id = st.secrets["google_sheets"]["spreadsheet_id"]
        service_account_info = {
            "type": st.secrets["gcp_service_account"]["type"],
            "project_id": st.secrets["gcp_service_account"]["project_id"],
            "private_key_id": st.secrets["gcp_service_account"]["private_key_id"],
            "private_key": st.secrets["gcp_service_account"]["private_key"].replace("\\n", "\n"),
            "client_email": st.secrets["gcp_service_account"]["client_email"],
            "client_id": st.secrets["gcp_service_account"]["client_id"],
            "auth_uri": st.secrets["gcp_service_account"]["auth_uri"],
            "token_uri": st.secrets["gcp_service_account"]["token_uri"],
            "auth_provider_x509_cert_url": st.secrets["gcp_service_account"]["auth_provider_x509_cert_url"],
            "client_x509_cert_url": st.secrets["gcp_service_account"]["client_x509_cert_url"],
        }
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        creds = Credentials.from_service_account_info(service_account_info, scopes=scopes)
        client = gspread.authorize(creds)
        return client.open_by_key(spreadsheet_id)
    except Exception as e:
        st.error("No fue posible conectar con Google Sheets. Verifica los Secrets y que el Google Sheet esté compartido con el client_email.")
        if should_show_debug_errors():
            st.exception(e)
        st.stop()



def retry_gspread(func, attempts=3, wait=1.5):
    last_error = None
    for attempt in range(attempts):
        try:
            return func()
        except gspread.exceptions.APIError as e:
            last_error = e
            time.sleep(wait * (attempt + 1))
    raise last_error


def clear_sheet_cache(name=None, columns=None):
    if name and columns:
        try:
            read_sheet_cached.clear(name, tuple(columns))
            return
        except (TypeError, ValueError):
            pass
    read_sheet_cached.clear()


def normalize_text(value):
    return str(value or "").strip()


def escape_html(value):
    return html.escape(normalize_text(value), quote=True)


def get_secret_value(section, key, default=""):
    try:
        section_values = st.secrets.get(section, {})
    except Exception:
        return default

    if hasattr(section_values, "get"):
        return section_values.get(key, default)
    return default


def should_show_debug_errors():
    value = get_secret_value("app", "show_debug_errors", os.getenv("APP_SHOW_DEBUG_ERRORS", ""))
    return normalize_text(value).lower() in {"1", "true", "yes", "si", "sí"}


def get_initial_admin_credentials():
    usuario = normalize_text(get_secret_value("app", "initial_admin_user", os.getenv("APP_INITIAL_ADMIN_USER", "admin")))
    clave = str(get_secret_value("app", "initial_admin_password", os.getenv("APP_INITIAL_ADMIN_PASSWORD", "")) or "")
    return usuario or "admin", clave


def format_spanish_date(value):
    if isinstance(value, datetime):
        parsed_date = value.date()
    elif isinstance(value, date):
        parsed_date = value
    else:
        try:
            parsed_date = date.fromisoformat(normalize_text(value)[:10])
        except ValueError:
            parsed_date = date.today()
    month_name = MONTH_NAMES_ES.get(parsed_date.month, "")
    return f"{parsed_date.day} de {month_name} de {parsed_date.year}"


def parse_date_or_today(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(normalize_text(value)[:10])
    except ValueError:
        return date.today()


def normalize_filename_part(value):
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", normalize_text(value))
    return cleaned.strip("_") or "datafono"


def normalize_terminal(value):
    return re.sub(r"\s+", "", normalize_text(value))


def validate_terminal_fields(numero_terminal, numero_afiliado):
    terminal = normalize_terminal(numero_terminal)
    afiliado = normalize_terminal(numero_afiliado)
    if not terminal or not afiliado:
        return None, None, "Terminal y afiliado son obligatorios."
    if not re.fullmatch(r"[A-Za-z0-9-]{3,30}", terminal):
        return None, None, "El número de terminal debe tener 3-30 caracteres alfanuméricos o guiones."
    if not re.fullmatch(r"[A-Za-z0-9-]{3,30}", afiliado):
        return None, None, "El número de afiliado debe tener 3-30 caracteres alfanuméricos o guiones."
    return terminal, afiliado, None


def make_password_hash(password):
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    digest_b64 = base64.b64encode(digest).decode("ascii")
    return f"{PASSWORD_PREFIX}${salt_b64}${digest_b64}"


def is_password_hash(value):
    return normalize_text(value).startswith(f"{PASSWORD_PREFIX}$")


def verify_password(password, stored_value):
    stored = normalize_text(stored_value)
    if not is_password_hash(stored):
        return hmac.compare_digest(password, stored)
    try:
        _, salt_b64, digest_b64 = stored.split("$", 2)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return hmac.compare_digest(actual, expected)


def prepare_sheet_df(df, columns):
    df = df.copy()
    for col in columns:
        if col not in df.columns:
            df[col] = ""
    return df[columns].fillna("").astype(str)


@st.cache_resource(show_spinner=False)
def get_ws_cached(name, columns_tuple):
    columns = list(columns_tuple)
    sh = connect_gsheet()

    def open_or_create():
        try:
            return sh.worksheet(name)
        except gspread.WorksheetNotFound:
            ws_new = sh.add_worksheet(title=name, rows=1000, cols=max(20, len(columns)))
            ws_new.update("A1", [columns])
            return ws_new

    ws = retry_gspread(open_or_create)

    headers = retry_gspread(lambda: ws.row_values(1))
    if not headers:
        retry_gspread(lambda: ws.update("A1", [columns]))

    return ws


def get_ws(name, columns):
    return get_ws_cached(name, tuple(columns))


@st.cache_data(ttl=20, show_spinner=False)
def read_sheet_cached(name, columns_tuple):
    columns = list(columns_tuple)
    ws = get_ws(name, columns)

    def get_values():
        return ws.get_all_values()

    values = retry_gspread(get_values)

    if not values:
        return pd.DataFrame(columns=columns)

    raw_headers = values[0]
    data_rows = values[1:]

    header_positions = {}
    for idx, header in enumerate(raw_headers):
        h = str(header).strip()
        if h and h not in header_positions:
            header_positions[h] = idx

    records = []
    for row in data_rows:
        if not any(str(cell).strip() for cell in row):
            continue

        item = {}
        for col in columns:
            pos = header_positions.get(col)
            item[col] = str(row[pos]).strip() if pos is not None and pos < len(row) else ""
        records.append(item)

    return pd.DataFrame(records, columns=columns).astype(str).fillna("")


def read_sheet(name, columns):
    return read_sheet_cached(name, tuple(columns))


def write_sheet(name, df, columns):
    ws = get_ws(name, columns)
    df = prepare_sheet_df(df, columns)

    def do_write():
        ws.clear()
        ws.update("A1", [columns] + df.values.tolist())

    retry_gspread(do_write)
    clear_sheet_cache(name, columns)
    if name == "Config":
        read_config_cached.clear()


def append_sheet_row(name, row, columns):
    ws = get_ws(name, columns)
    values = [normalize_text(row.get(col, "")) for col in columns]
    retry_gspread(lambda: ws.append_row(values, value_input_option="USER_ENTERED"))
    clear_sheet_cache(name, columns)


def find_sheet_row_number(name, columns, key_col, key_value):
    ws = get_ws(name, columns)
    values = retry_gspread(lambda: ws.get_all_values())
    if not values:
        return None

    headers = [normalize_text(header) for header in values[0]]
    try:
        key_idx = headers.index(key_col)
    except ValueError:
        return None

    key_value = normalize_text(key_value)
    for row_number, row in enumerate(values[1:], start=2):
        if key_idx < len(row) and normalize_text(row[key_idx]) == key_value:
            return row_number
    return None


def update_sheet_row(name, columns, key_col, key_value, row_values):
    ws = get_ws(name, columns)
    row_number = find_sheet_row_number(name, columns, key_col, key_value)
    if not row_number:
        return False

    values = [normalize_text(row_values.get(col, "")) for col in columns]
    retry_gspread(lambda: ws.update(f"A{row_number}", [values]))
    clear_sheet_cache(name, columns)
    return True


@st.cache_data(ttl=60, show_spinner=False)
def read_config_cached():
    sh = connect_gsheet()
    try:
        ws = retry_gspread(lambda: sh.worksheet("Config"))
        values = retry_gspread(lambda: ws.get_all_values())

        if not values:
            return CONFIG_DEFAULT

        headers = values[0]
        config = {}

        for col_idx, header in enumerate(headers):
            key = str(header).strip()
            if not key:
                continue

            items = []
            for row in values[1:]:
                if col_idx < len(row):
                    value = str(row[col_idx]).strip()
                    if value:
                        items.append(value)
            config[key] = items

        for key, default_values in CONFIG_DEFAULT.items():
            if key not in config or not config[key]:
                config[key] = default_values

        return config

    except Exception:
        return CONFIG_DEFAULT


def read_config():
    return read_config_cached()


def cfg(key):
    return read_config().get(key, CONFIG_DEFAULT.get(key, []))


def get_inventory():
    return read_sheet("Inventario", INVENTARIO_COLUMNS)


def save_inventory(df):
    write_sheet("Inventario", df, INVENTARIO_COLUMNS)


def get_history():
    return read_sheet("Historial", HISTORIAL_COLUMNS)


def save_history(df):
    write_sheet("Historial", df, HISTORIAL_COLUMNS)


def get_users():
    users = read_sheet("Usuarios", USUARIOS_COLUMNS)
    if users.empty:
        initial_user, initial_password = get_initial_admin_credentials()
        if not initial_password:
            st.error(
                "No hay usuarios configurados. Define app.initial_admin_password en los Secrets "
                "para crear el primer administrador."
            )
            st.stop()
        if len(initial_password) < 8:
            st.error("La contraseña inicial del administrador debe tener al menos 8 caracteres.")
            st.stop()

        users = pd.DataFrame([{
            "usuario": initial_user,
            "clave": make_password_hash(initial_password),
            "rol": "Administrador",
            "activo": "Sí"
        }])
        write_sheet("Usuarios", users, USUARIOS_COLUMNS)
    return users


def save_users(df):
    write_sheet("Usuarios", df, USUARIOS_COLUMNS)


def add_history(terminal_anterior, terminal_nueva, hotel, area, departamento, estatus_anterior, estatus_nuevo, motivo, responsable, observacion):
    new_row = {
        "id_movimiento": str(uuid.uuid4())[:8],
        "fecha": str(date.today()),
        "terminal_anterior": terminal_anterior,
        "terminal_nueva": terminal_nueva,
        "hotel": hotel,
        "area": area,
        "departamento": departamento,
        "estatus_anterior": estatus_anterior,
        "estatus_nuevo": estatus_nuevo,
        "motivo": motivo,
        "responsable": responsable,
        "observacion": observacion
    }
    append_sheet_row("Historial", new_row, HISTORIAL_COLUMNS)


def status_html(status):
    status_clean = str(status).strip()
    css_map = {
        "Activo": "pill-activo",
        "Resguardo": "pill-resguardo",
        "En reparación": "pill-reparacion",
        "Sustituido": "pill-sustituido",
        "Decomisado": "pill-decomisado",
        "Baja": "pill-baja"
    }
    css_class = css_map.get(status_clean, "pill-default")
    return f'<span class="status-pill {css_class}">{escape_html(status_clean)}</span>'


def upgrade_legacy_password_hash(usuario, password, user_row):
    if is_password_hash(user_row.get("clave", "")):
        return

    updated_user = user_row.to_dict()
    updated_user["clave"] = make_password_hash(password)
    try:
        update_sheet_row("Usuarios", USUARIOS_COLUMNS, "usuario", usuario, updated_user)
    except Exception as e:
        if should_show_debug_errors():
            st.warning("No se pudo migrar la contraseña heredada a hash.")
            st.exception(e)


def palette_for(values):
    values = [str(v) for v in values]
    return {
        value: DASHBOARD_PALETTE[idx % len(DASHBOARD_PALETTE)]
        for idx, value in enumerate(values)
    }


def colored_bar_chart(data, category_col, value_col, color_map, title=None, horizontal=True):
    base = alt.Chart(data).encode(
        tooltip=[
            alt.Tooltip(f"{category_col}:N", title=category_col.replace("_", " ").title()),
            alt.Tooltip(f"{value_col}:Q", title=value_col),
        ],
        color=alt.Color(
            f"{category_col}:N",
            scale=alt.Scale(domain=list(color_map.keys()), range=list(color_map.values())),
            legend=None,
        ),
    )

    if horizontal:
        bars = base.mark_bar(cornerRadiusEnd=6).encode(
            y=alt.Y(f"{category_col}:N", sort="-x", title=None),
            x=alt.X(f"{value_col}:Q", title=None, axis=alt.Axis(format="d")),
        )
        labels = base.mark_text(align="left", baseline="middle", dx=5, color="#0F172A").encode(
            y=alt.Y(f"{category_col}:N", sort="-x", title=None),
            x=alt.X(f"{value_col}:Q", title=None),
            text=alt.Text(f"{value_col}:Q", format="d"),
        )
    else:
        bars = base.mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6).encode(
            x=alt.X(f"{category_col}:N", sort="-y", title=None, axis=alt.Axis(labelAngle=-30)),
            y=alt.Y(f"{value_col}:Q", title=None, axis=alt.Axis(format="d")),
        )
        labels = base.mark_text(dy=-8, color="#0F172A").encode(
            x=alt.X(f"{category_col}:N", sort="-y", title=None),
            y=alt.Y(f"{value_col}:Q", title=None),
            text=alt.Text(f"{value_col}:Q", format="d"),
        )

    chart = (bars + labels).properties(height=330)
    if title:
        chart = chart.properties(title=title)
    return chart


def donut_chart(data, category_col, value_col, color_map):
    data = data.copy()
    label_col = f"{category_col}_label"
    data[label_col] = data[category_col].astype(str) + " (" + data[value_col].astype(int).astype(str) + ")"
    label_color_map = {
        f"{category} ({int(data.loc[data[category_col] == category, value_col].iloc[0])})": color
        for category, color in color_map.items()
        if not data.loc[data[category_col] == category, value_col].empty
    }
    return alt.Chart(data).mark_arc(innerRadius=70, outerRadius=125, cornerRadius=4).encode(
        theta=alt.Theta(f"{value_col}:Q", stack=True),
        color=alt.Color(
            f"{label_col}:N",
            scale=alt.Scale(domain=list(label_color_map.keys()), range=list(label_color_map.values())),
            legend=alt.Legend(title=None, orient="bottom", columns=2),
        ),
        tooltip=[
            alt.Tooltip(f"{category_col}:N", title=category_col.replace("_", " ").title()),
            alt.Tooltip(f"{value_col}:Q", title=value_col),
        ],
    ).properties(height=330)


@st.cache_data(ttl=300, show_spinner=False)
def df_to_excel_bytes(sheets):
    output = BytesIO()
    try:
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            for sheet_name, df in sheets.items():
                df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
        return output.getvalue()
    except ModuleNotFoundError:
        return None


def build_resguardo_pdf_bytes(row, tipo_documento, numero_documento, nombre_responsable, puesto_responsable, observacion_resguardo):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    def cell(value, style):
        return Paragraph(escape_html(value).replace("\n", "<br/>"), style)

    def row_value(key):
        return normalize_text(row.get(key, ""))

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title="Carta de Resguardo de Datafono",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="TitleCenter",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="MetaRight",
        parent=styles["Normal"],
        alignment=TA_RIGHT,
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    ))
    styles.add(ParagraphStyle(
        name="BodyJustify",
        parent=styles["BodyText"],
        alignment=TA_JUSTIFY,
        fontSize=10,
        leading=14,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="LabelCell",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
    ))
    styles.add(ParagraphStyle(
        name="ValueCell",
        parent=styles["BodyText"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="Signature",
        parent=styles["BodyText"],
        alignment=TA_CENTER,
        fontSize=9,
        leading=12,
    ))

    fecha_resguardo = format_spanish_date(date.today())
    terminal = row_value("numero_terminal")
    afiliado = row_value("numero_afiliado")
    hotel = row_value("hotel")
    area = row_value("area")
    departamento = row_value("departamento")
    estatus = row_value("estatus")
    fecha_asignacion = row_value("fecha_asignacion") or str(date.today())
    observacion_inventario = row_value("observacion")

    story = [
        Paragraph("CARTA DE RESGUARDO DE DATAFONO", styles["TitleCenter"]),
        Paragraph(f"Santo Domingo, {fecha_resguardo}", styles["MetaRight"]),
        Spacer(1, 12),
        Paragraph(
            "Por medio de la presente se deja constancia de la entrega en calidad de resguardo "
            "del datafono detallado a continuación. La persona responsable declara recibir el "
            "equipo para uso operativo, comprometiéndose a custodiarlo, utilizarlo de forma "
            "adecuada y reportar oportunamente cualquier cambio, pérdida, daño o devolución.",
            styles["BodyJustify"],
        ),
        Spacer(1, 8),
    ]

    details = [
        [cell("Número de terminal", styles["LabelCell"]), cell(terminal, styles["ValueCell"]),
         cell("Número de afiliado", styles["LabelCell"]), cell(afiliado, styles["ValueCell"])],
        [cell("Hotel", styles["LabelCell"]), cell(hotel, styles["ValueCell"]),
         cell("Área", styles["LabelCell"]), cell(area, styles["ValueCell"])],
        [cell("Departamento", styles["LabelCell"]), cell(departamento, styles["ValueCell"]),
         cell("Estatus actual", styles["LabelCell"]), cell(estatus, styles["ValueCell"])],
        [cell("Fecha de asignación", styles["LabelCell"]), cell(fecha_asignacion, styles["ValueCell"]),
         cell("Fecha de resguardo", styles["LabelCell"]), cell(fecha_resguardo, styles["ValueCell"])],
    ]
    details_table = Table(details, colWidths=[1.45 * inch, 1.85 * inch, 1.35 * inch, 1.85 * inch])
    details_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F8FAFC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(details_table)
    story.append(Spacer(1, 14))

    responsible = [
        [cell("Tipo de documento", styles["LabelCell"]), cell(tipo_documento, styles["ValueCell"]),
         cell("Documento", styles["LabelCell"]), cell(numero_documento, styles["ValueCell"])],
        [cell("Responsable", styles["LabelCell"]), cell(nombre_responsable, styles["ValueCell"]),
         cell("Puesto", styles["LabelCell"]), cell(puesto_responsable, styles["ValueCell"])],
    ]
    responsible_table = Table(responsible, colWidths=[1.45 * inch, 1.85 * inch, 1.35 * inch, 1.85 * inch])
    responsible_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F8FAFC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(responsible_table)

    notes = [value for value in [observacion_inventario, observacion_resguardo] if normalize_text(value)]
    if notes:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Observaciones:</b>", styles["BodyText"]))
        for note in notes:
            story.append(Paragraph(escape_html(note), styles["BodyJustify"]))

    story.extend([
        Spacer(1, 28),
        Paragraph("Firmas", styles["TitleCenter"]),
        Spacer(1, 22),
    ])

    signature_table = Table([
        [
            Paragraph("__________________________________<br/>Responsable<br/>" + escape_html(nombre_responsable), styles["Signature"]),
            Paragraph("__________________________________<br/>Entregado por<br/>Nombre y firma", styles["Signature"]),
        ],
        [
            Paragraph("<br/><br/>__________________________________<br/>Auditoría / Administración<br/>Nombre y firma", styles["Signature"]),
            Paragraph("<br/><br/>__________________________________<br/>Recibido conforme<br/>Fecha y hora", styles["Signature"]),
        ],
    ], colWidths=[3.25 * inch, 3.25 * inch], rowHeights=[1.0 * inch, 1.15 * inch])
    signature_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(signature_table)

    doc.build(story)
    return buffer.getvalue()


def build_resguardo_filtrado_pdf_bytes(filtered_df, tipo_documento, numero_documento, nombre_responsable, puesto_responsable, observacion_resguardo):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    def cell(value, style):
        return Paragraph(escape_html(value).replace("\n", "<br/>") or "&nbsp;", style)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=0.45 * inch,
        leftMargin=0.45 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
        title="Carta de Resguardo de Datafonos",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="TitleCenterFiltered",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        spaceAfter=10,
    ))
    styles.add(ParagraphStyle(
        name="MetaRightFiltered",
        parent=styles["Normal"],
        alignment=TA_RIGHT,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#334155"),
    ))
    styles.add(ParagraphStyle(
        name="BodyJustifyFiltered",
        parent=styles["BodyText"],
        alignment=TA_JUSTIFY,
        fontSize=9,
        leading=12,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="LabelCellFiltered",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0F172A"),
    ))
    styles.add(ParagraphStyle(
        name="ValueCellFiltered",
        parent=styles["BodyText"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="TableHeaderFiltered",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        fontSize=7.5,
        leading=9,
        textColor=colors.white,
    ))
    styles.add(ParagraphStyle(
        name="TableCellFiltered",
        parent=styles["BodyText"],
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor("#0F172A"),
    ))
    styles.add(ParagraphStyle(
        name="SignatureFiltered",
        parent=styles["BodyText"],
        alignment=TA_CENTER,
        fontSize=8.5,
        leading=11,
    ))

    fecha_resguardo = format_spanish_date(date.today())
    filtered_df = filtered_df.copy().fillna("")

    story = [
        Paragraph("CARTA DE RESGUARDO DE DATAFONOS", styles["TitleCenterFiltered"]),
        Paragraph(f"Santo Domingo, {fecha_resguardo}", styles["MetaRightFiltered"]),
        Spacer(1, 8),
        Paragraph(
            "Por medio de la presente se deja constancia de la entrega en calidad de resguardo "
            "de los datafonos detallados en este documento. La persona responsable declara recibir "
            "los equipos para uso operativo, comprometiéndose a custodiarlos, utilizarlos de forma "
            "adecuada y reportar oportunamente cualquier cambio, pérdida, daño o devolución.",
            styles["BodyJustifyFiltered"],
        ),
        Paragraph(f"<b>Cantidad de datafonos incluidos:</b> {len(filtered_df)}", styles["BodyJustifyFiltered"]),
        Spacer(1, 8),
    ]

    responsible = [
        [cell("Tipo de documento", styles["LabelCellFiltered"]), cell(tipo_documento, styles["ValueCellFiltered"]),
         cell("Documento", styles["LabelCellFiltered"]), cell(numero_documento, styles["ValueCellFiltered"])],
        [cell("Responsable", styles["LabelCellFiltered"]), cell(nombre_responsable, styles["ValueCellFiltered"]),
         cell("Puesto", styles["LabelCellFiltered"]), cell(puesto_responsable, styles["ValueCellFiltered"])],
        [cell("Fecha de resguardo", styles["LabelCellFiltered"]), cell(fecha_resguardo, styles["ValueCellFiltered"]),
         cell("Observación", styles["LabelCellFiltered"]), cell(observacion_resguardo, styles["ValueCellFiltered"])],
    ]
    responsible_table = Table(responsible, colWidths=[1.35 * inch, 2.25 * inch, 1.15 * inch, 4.1 * inch])
    responsible_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F8FAFC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(responsible_table)
    story.append(Spacer(1, 12))

    headers = ["Terminal", "Afiliado", "Hotel", "Área", "Departamento", "Estatus", "Fecha asignación", "Observación"]
    table_rows = [[Paragraph(header, styles["TableHeaderFiltered"]) for header in headers]]
    for _, row in filtered_df.iterrows():
        table_rows.append([
            cell(row.get("numero_terminal", ""), styles["TableCellFiltered"]),
            cell(row.get("numero_afiliado", ""), styles["TableCellFiltered"]),
            cell(row.get("hotel", ""), styles["TableCellFiltered"]),
            cell(row.get("area", ""), styles["TableCellFiltered"]),
            cell(row.get("departamento", ""), styles["TableCellFiltered"]),
            cell(row.get("estatus", ""), styles["TableCellFiltered"]),
            cell(row.get("fecha_asignacion", ""), styles["TableCellFiltered"]),
            cell(row.get("observacion", ""), styles["TableCellFiltered"]),
        ])

    inventory_table = Table(
        table_rows,
        repeatRows=1,
        colWidths=[
            0.78 * inch, 0.95 * inch, 0.85 * inch, 0.85 * inch,
            1.05 * inch, 0.8 * inch, 1.05 * inch, 2.15 * inch,
        ],
    )
    inventory_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(inventory_table)

    signature_table = Table([
        [
            Paragraph("__________________________________<br/>Responsable<br/>" + escape_html(nombre_responsable), styles["SignatureFiltered"]),
            Paragraph("__________________________________<br/>Entregado por<br/>Nombre y firma", styles["SignatureFiltered"]),
            Paragraph("__________________________________<br/>Auditoría / Administración<br/>Nombre y firma", styles["SignatureFiltered"]),
        ],
    ], colWidths=[3.0 * inch, 3.0 * inch, 3.0 * inch], rowHeights=[0.85 * inch])
    signature_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(KeepTogether([
        Spacer(1, 22),
        Paragraph("Firmas", styles["TitleCenterFiltered"]),
        Spacer(1, 18),
        signature_table,
    ]))

    doc.build(story)
    return buffer.getvalue()


def dataframe_signature(df):
    if df.empty:
        return (tuple(df.columns), 0, 0)
    hashed = pd.util.hash_pandas_object(df.astype(str), index=True).sum()
    return (tuple(df.columns), len(df), int(hashed))


def sheets_signature(sheets):
    return tuple((name, dataframe_signature(df)) for name, df in sheets.items())


def render_excel_export(button_label, download_label, sheets, file_name, key):
    signature = sheets_signature(sheets)
    signature_key = f"{key}_excel_signature"
    bytes_key = f"{key}_excel_bytes"
    if st.session_state.get(signature_key) != signature:
        st.session_state.pop(bytes_key, None)
        st.session_state[signature_key] = signature

    if st.button(button_label, key=f"{key}_prepare", use_container_width=True):
        with st.spinner("Preparando Excel..."):
            st.session_state[bytes_key] = df_to_excel_bytes(sheets)

    excel_bytes = st.session_state.get(bytes_key)
    if excel_bytes:
        st.download_button(
            download_label,
            data=excel_bytes,
            file_name=file_name,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
            key=f"{key}_download"
        )
    elif excel_bytes is None and bytes_key in st.session_state:
        st.info("Para activar la exportación a Excel, agrega openpyxl al archivo requirements.txt.")


def get_dataframe_selected_rows(event):
    if event is None:
        return []

    selection = getattr(event, "selection", None)
    if selection is None and isinstance(event, dict):
        selection = event.get("selection", {})

    rows = getattr(selection, "rows", None)
    if rows is None and isinstance(selection, dict):
        rows = selection.get("rows", [])

    return list(rows or [])


def get_grid_response_value(grid_response, key, default=None):
    if grid_response is None:
        return default

    if isinstance(grid_response, dict):
        return grid_response.get(key, default)

    value = getattr(grid_response, key, None)
    if value is not None:
        return value

    try:
        return grid_response[key]
    except (KeyError, TypeError, AttributeError):
        return default


def get_aggrid_selected_row_id(grid_response):
    if grid_response is None:
        return None

    selected_rows = get_grid_response_value(grid_response, "selected_rows", [])
    if selected_rows is None:
        return None

    if isinstance(selected_rows, pd.DataFrame):
        if selected_rows.empty or "id" not in selected_rows.columns:
            return None
        return normalize_text(selected_rows.iloc[0]["id"])

    if isinstance(selected_rows, dict):
        return normalize_text(selected_rows.get("id"))

    if selected_rows:
        first_row = selected_rows[0]
        if isinstance(first_row, dict):
            return normalize_text(first_row.get("id"))

    return None


def get_aggrid_visible_data(grid_response, fallback_df):
    if grid_response is None:
        return fallback_df.copy()

    data = get_grid_response_value(grid_response, "data")
    if data is None:
        return fallback_df.copy()

    if isinstance(data, pd.DataFrame):
        return data.copy()

    return pd.DataFrame(data)


def get_aggrid_event_data(grid_response):
    event_data = get_grid_response_value(grid_response, "event_data")
    if event_data is None:
        event_data = get_grid_response_value(grid_response, "eventData")
    return event_data if isinstance(event_data, dict) else {}


def get_inventory_status_row_class():
    if JsCode is None:
        return None
    return JsCode("""
        function(params) {
            const rawStatus = String((params.data && params.data.estatus) || '').trim();
            const status = rawStatus.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();

            if (status === 'activo') return 'status-row status-activo';
            if (status === 'resguardo') return 'status-row status-resguardo';
            if (status === 'en reparacion') return 'status-row status-reparacion';
            if (status === 'sustituido') return 'status-row status-sustituido';
            if (status === 'decomisado') return 'status-row status-decomisado';
            if (status === 'baja') return 'status-row status-baja';
            return 'status-row status-default';
        }
    """)


def get_inventory_action_value_setter():
    if JsCode is None:
        return None
    return JsCode("""
        function(params) {
            params.data[params.colDef.field] = '⋮';
            if (params.newValue && params.newValue !== '⋮') {
                params.data._accion_token = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
            }
            return true;
        }
    """)


def get_inventory_action_click_handler():
    if JsCode is None:
        return None
    return JsCode("""
        function(params) {
            params.api.startEditingCell({
                rowIndex: params.rowIndex,
                colKey: params.column.getColId()
            });
        }
    """)


def get_inventory_row_action(grid_response):
    event_data = get_aggrid_event_data(grid_response)
    if not event_data:
        return None

    col_def = event_data.get("colDef") if isinstance(event_data.get("colDef"), dict) else {}
    column_data = event_data.get("column") if isinstance(event_data.get("column"), dict) else {}
    col_id = (
        event_data.get("colId")
        or event_data.get("columnId")
        or event_data.get("field")
        or col_def.get("field")
        or col_def.get("colId")
        or column_data.get("field")
        or column_data.get("colId")
    )
    if col_id != ROW_ACTION_COLUMN:
        return None

    action = normalize_text(event_data.get("newValue") or event_data.get("value"))
    if action not in ROW_ACTION_LABELS:
        return None

    row_data = event_data.get("data")
    if not isinstance(row_data, dict):
        node = event_data.get("node") if isinstance(event_data.get("node"), dict) else {}
        row_data = node.get("data") if isinstance(node.get("data"), dict) else {}

    row_id = normalize_text(row_data.get("id") or event_data.get("id"))
    if not row_id:
        return None

    token = normalize_text(
        row_data.get(ROW_ACTION_TOKEN_COLUMN)
        or event_data.get("timestamp")
        or event_data.get("eventId")
        or event_data.get("rowIndex")
    )
    return {"row_id": row_id, "action": action, "token": token}


def dispatch_inventory_row_action(action_event):
    if not action_event:
        return

    row_id = action_event["row_id"]
    action = action_event["action"]
    token = f"{row_id}|{action}|{action_event.get('token')}"
    if st.session_state.get("inventario_last_row_action") == token:
        return
    st.session_state["inventario_last_row_action"] = token

    if action == "Editar estatus":
        dialog_editar_terminal(row_id)
    elif action == "Editar datos":
        dialog_editar_datos_terminal(row_id)
    elif action == "Ver bitácora":
        dialog_bitacora_terminal(row_id)


def get_registered_options(df, column):
    if df.empty or column not in df.columns:
        return []
    values = sorted([v for v in df[column].astype(str).str.strip().unique().tolist() if v])
    return values


def apply_common_filters(df, hoteles, departamentos, estatus_list, prefix=""):
    hoteles_registrados = get_registered_options(df, "hotel")
    departamentos_registrados = get_registered_options(df, "departamento")
    estatus_registrados = get_registered_options(df, "estatus")

    with st.container(border=True):
        st.markdown("#### Filtros")
        c1, c2, c3, c4 = st.columns(4)
        f_hotel = c1.multiselect("Hotel", hoteles_registrados, key=f"{prefix}_hotel", placeholder="Seleccione")
        f_depto = c2.multiselect("Departamento", departamentos_registrados, key=f"{prefix}_depto", placeholder="Seleccione")
        f_estatus = c3.multiselect("Estatus", estatus_registrados, key=f"{prefix}_estatus", placeholder="Seleccione")
        busqueda = c4.text_input("Buscar", key=f"{prefix}_buscar")

    filtered = df.copy()
    if f_hotel:
        filtered = filtered[filtered["hotel"].isin(f_hotel)]
    if f_depto:
        filtered = filtered[filtered["departamento"].isin(f_depto)]
    if f_estatus:
        filtered = filtered[filtered["estatus"].isin(f_estatus)]
    if busqueda:
        b = busqueda.lower()
        searchable_cols = [col for col in SEARCHABLE_INVENTORY_COLUMNS if col in filtered.columns]
        searchable_text = filtered[searchable_cols].astype(str).agg(" ".join, axis=1).str.lower()
        filtered = filtered[searchable_text.str.contains(re.escape(b), na=False)]

    return filtered


def header():
    st.markdown("""
    <div class="title-card">
        <h1>Control de Datafonos</h1>
    </div>
    """, unsafe_allow_html=True)


def attempt_login():
    usuario = normalize_text(st.session_state.get("login_usuario"))
    clave = st.session_state.get("login_clave", "")
    st.session_state.pop("login_error", None)

    if not usuario or not clave:
        st.session_state["login_error"] = "Digite usuario y contraseña."
        return False

    users = get_users()
    match = users[(users["usuario"] == usuario) & (users["activo"] == "Sí")]
    if match.empty:
        st.session_state["login_error"] = "Usuario o contraseña incorrectos."
        return False

    idx = match.index[0]
    stored_password = match.loc[idx, "clave"]
    if not verify_password(clave, stored_password):
        st.session_state["login_error"] = "Usuario o contraseña incorrectos."
        return False

    upgrade_legacy_password_hash(usuario, clave, match.loc[idx])
    st.session_state["logged"] = True
    st.session_state["usuario"] = usuario
    st.session_state["rol"] = match.iloc[0]["rol"]
    st.session_state.pop("login_clave", None)
    return True


def login():
    st.markdown("""
    <div class="title-card" style="text-align:center;">
        <div style="font-size:48px;">💳</div>
        <h1>Control de Datafonos</h1>
    </div>
    """, unsafe_allow_html=True)

    col1, col2, col3 = st.columns([1.2, 1, 1.2])
    with col2:
        st.markdown("""
        <div class="login-card">
            <div class="login-title">Iniciar sesión</div>
            <div class="login-subtitle">Ingresa tus credenciales para continuar.</div>
        </div>
        """, unsafe_allow_html=True)

        with st.form("form_login", border=True):
            st.text_input("Usuario", placeholder="Digite su usuario", key="login_usuario")
            st.text_input(
                "Contraseña",
                type="password",
                placeholder="Digite su contraseña",
                key="login_clave"
            )
            entrar = st.form_submit_button("Entrar al sistema", use_container_width=True, type="primary")

        if st.session_state.get("login_error"):
            st.error(st.session_state["login_error"])

        if entrar and attempt_login():
            st.rerun()



def dashboard():
    header()
    df = get_inventory()
    hist = get_history()

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    st.markdown("### Panel ejecutivo")

    filtered = apply_common_filters(df, hoteles, departamentos, estatus_list, prefix="dash")

    total = len(filtered)
    activos = int((filtered["estatus"] == "Activo").sum()) if not filtered.empty else 0
    resguardo = int((filtered["estatus"] == "Resguardo").sum()) if not filtered.empty else 0
    reparacion = int((filtered["estatus"] == "En reparación").sum()) if not filtered.empty else 0
    decomisados = int((filtered["estatus"] == "Decomisado").sum()) if not filtered.empty else 0
    bajas = int((filtered["estatus"] == "Baja").sum()) if not filtered.empty else 0

    terminales_filtradas = filtered["numero_terminal"].astype(str).tolist() if not filtered.empty else []
    if not hist.empty and terminales_filtradas:
        hist_filtrado = hist[
            hist["terminal_anterior"].astype(str).isin(terminales_filtradas) |
            hist["terminal_nueva"].astype(str).isin(terminales_filtradas)
        ]
    else:
        hist_filtrado = hist.copy() if not hist.empty and filtered.empty and len(df) == 0 else pd.DataFrame(columns=HISTORIAL_COLUMNS)

    cambios_mes = len(hist_filtrado[hist_filtrado["fecha"].astype(str).str.startswith(str(date.today())[:7])]) if not hist_filtrado.empty else 0

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Total filtrado", total)
    c2.metric("Activos", activos)
    c3.metric("Resguardo", resguardo)
    c4.metric("En reparación", reparacion)
    c5.metric("Decomisados/Baja", decomisados + bajas)
    c6.metric("Cambios del mes", cambios_mes)

    st.divider()

    col_a, col_b = st.columns(2)
    with col_a:
        with st.container(border=True):
            st.subheader("Distribución por hotel")
            if not filtered.empty:
                chart = filtered.groupby("hotel").size().reset_index(name="Cantidad").sort_values("Cantidad", ascending=False)
                color_map = palette_for(chart["hotel"].tolist())
                st.altair_chart(
                    colored_bar_chart(chart, "hotel", "Cantidad", color_map, horizontal=True),
                    use_container_width=True
                )
            else:
                st.info("No hay datos con los filtros seleccionados.")

    with col_b:
        with st.container(border=True):
            st.subheader("Distribución por estatus")
            if not filtered.empty:
                chart = filtered.groupby("estatus").size().reset_index(name="Cantidad").sort_values("Cantidad", ascending=False)
                color_map = {status: STATUS_COLORS.get(status, DASHBOARD_PALETTE[idx % len(DASHBOARD_PALETTE)]) for idx, status in enumerate(chart["estatus"].tolist())}
                st.altair_chart(
                    donut_chart(chart, "estatus", "Cantidad", color_map),
                    use_container_width=True
                )
            else:
                st.info("No hay datos con los filtros seleccionados.")

    col_c, col_d = st.columns(2)
    with col_c:
        with st.container(border=True):
            st.subheader("Datafonos por departamento")
            if not filtered.empty:
                dept = filtered.groupby("departamento").size().reset_index(name="Cantidad").sort_values("Cantidad", ascending=False)
                color_map = palette_for(dept["departamento"].tolist())
                st.altair_chart(
                    colored_bar_chart(dept, "departamento", "Cantidad", color_map, horizontal=False),
                    use_container_width=True
                )
            else:
                st.info("Sin datos.")

    with col_d:
        with st.container(border=True):
            st.subheader("Últimos movimientos filtrados")
            if hist_filtrado.empty:
                st.info("No hay movimientos relacionados con el filtro actual.")
            else:
                st.dataframe(hist_filtrado.tail(8).sort_index(ascending=False), use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Detalle filtrado")
    if filtered.empty:
        st.info("No hay datafonos para mostrar.")
    else:
        columnas = [
            "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
            "responsable", "estatus", "fecha_asignacion", "fecha_cambio", "sustituido_por"
        ]
        st.dataframe(filtered[columnas], use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Exportación del dashboard")
    render_excel_export(
        "Preparar Excel del dashboard",
        "Descargar dashboard filtrado en Excel",
        {
            "Dashboard Filtrado": filtered,
            "Historial Filtrado": hist_filtrado
        },
        f"dashboard_datafonos_{date.today()}.xlsx",
        "dashboard"
    )


def inventario():
    header()
    st.subheader("Inventario maestro")

    registro_message = st.session_state.pop("registro_datafono_success", None)
    if registro_message:
        st.success(registro_message)

    if st.button("Registrar nuevo datafono", type="primary"):
        dialog_registrar_datafono()

    df = get_inventory()

    st.markdown("### Datafonos registrados")
    display_columns = [
        "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
        "responsable", "estatus", "fecha_asignacion", "fecha_cambio", "sustituido_por",
        "observacion"
    ]
    display_columns = [col for col in display_columns if col in df.columns]
    inventory_display = df.reset_index(drop=True)
    table_columns = ["id"] + display_columns if "id" in inventory_display.columns else display_columns
    table_df = (inventory_display[table_columns] if table_columns else inventory_display).copy()
    if not table_df.empty:
        table_df.insert(0, ROW_ACTION_COLUMN, ROW_ACTION_PLACEHOLDER)
        table_df[ROW_ACTION_TOKEN_COLUMN] = ""
    export_df = table_df.drop(columns=["id", ROW_ACTION_COLUMN, ROW_ACTION_TOKEN_COLUMN], errors="ignore")

    if inventory_display.empty:
        st.info("No hay datafonos para mostrar.")
    elif AgGrid is not None:
        gb = GridOptionsBuilder.from_dataframe(table_df)
        gb.configure_default_column(
            filter="agSetColumnFilter",
            floatingFilter=False,
            sortable=True,
            resizable=True,
            minWidth=120,
            menuTabs=["filterMenuTab", "generalMenuTab"],
            filterParams={
                "excelMode": "windows",
                "buttons": ["apply", "reset"],
                "closeOnApply": True,
                "suppressSelectAll": False,
            },
        )
        action_column_options = {
            "pinned": "left",
            "width": 58,
            "minWidth": 58,
            "maxWidth": 68,
            "filter": False,
            "sortable": False,
            "resizable": False,
            "suppressMenu": True,
            "suppressHeaderMenuButton": True,
            "suppressHeaderFilterButton": True,
            "suppressMovable": True,
            "menuTabs": [],
            "editable": True,
            "singleClickEdit": True,
            "cellEditor": "agSelectCellEditor",
            "cellEditorPopup": False,
            "cellEditorParams": {
                "values": ROW_ACTION_LABELS,
            },
            "cellStyle": {"textAlign": "center", "fontWeight": "700", "fontSize": "18px", "color": "#334155"},
            "tooltipField": "numero_terminal",
        }
        if JsCode is not None:
            action_column_options["valueSetter"] = get_inventory_action_value_setter()
            action_column_options["onCellClicked"] = get_inventory_action_click_handler()
        gb.configure_column(ROW_ACTION_COLUMN, header_name="", **action_column_options)
        if "id" in table_df.columns:
            gb.configure_column("id", hide=True, suppressColumnsToolPanel=True)
        if ROW_ACTION_TOKEN_COLUMN in table_df.columns:
            gb.configure_column(ROW_ACTION_TOKEN_COLUMN, hide=True, suppressColumnsToolPanel=True)
        gb.configure_column("numero_terminal", header_name="Terminal", pinned="left", minWidth=120)
        gb.configure_column("numero_afiliado", header_name="Afiliado", minWidth=140)
        gb.configure_column("hotel", header_name="Hotel", minWidth=120)
        gb.configure_column("area", header_name="Área", minWidth=120)
        gb.configure_column("departamento", header_name="Departamento", minWidth=140)
        gb.configure_column("responsable", header_name="Responsable", minWidth=160)
        gb.configure_column("estatus", header_name="Estatus", minWidth=120)
        gb.configure_column("fecha_asignacion", header_name="Fecha asignación", minWidth=145)
        gb.configure_column("fecha_cambio", header_name="Fecha cambio", minWidth=130)
        gb.configure_column("sustituido_por", header_name="Sustituido por", minWidth=140)
        gb.configure_column("observacion", header_name="Observación", minWidth=220)
        gb.configure_grid_options(
            enableCellTextSelection=True,
            ensureDomOrder=True,
            rowHeight=34,
            headerHeight=38,
            suppressMenuHide=True,
            stopEditingWhenCellsLoseFocus=True,
        )
        if JsCode is not None:
            gb.configure_grid_options(getRowClass=get_inventory_status_row_class())
        inventory_grid_css = {
            ".ag-cell[col-id='acciones']": {
                "overflow": "visible !important",
                "padding": "4px 8px !important",
                "cursor": "pointer",
                "font-size": "19px !important",
                "font-weight": "900 !important",
                "color": "#334155 !important",
            },
            ".ag-cell[col-id='acciones'] .ag-cell-wrapper": {
                "justify-content": "center",
                "width": "100%",
            },
            ".ag-cell[col-id='acciones'] .ag-cell-value": {
                "display": "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                "width": "30px",
                "height": "24px",
                "border": "1px solid #CBD5E1",
                "border-radius": "6px",
                "background": "#FFFFFF",
                "color": "#334155",
                "font-weight": "800",
                "line-height": "1",
                "cursor": "pointer",
            },
            ".ag-cell[col-id='acciones']:hover .ag-cell-value": {
                "background": "#F8FAFC",
                "border-color": "#94A3B8",
                "color": "#0F172A",
            },
            ".ag-popup-editor": {
                "box-shadow": "0 12px 30px rgba(15, 23, 42, 0.18) !important",
                "border-radius": "8px !important",
            },
            ".status-activo .ag-cell": {
                "background-color": "#F0FDF4 !important",
            },
            ".status-resguardo .ag-cell": {
                "background-color": "#EFF6FF !important",
            },
            ".status-reparacion .ag-cell": {
                "background-color": "#FFF7ED !important",
            },
            ".status-sustituido .ag-cell": {
                "background-color": "#FAF5FF !important",
            },
            ".status-decomisado .ag-cell": {
                "background-color": "#FEF2F2 !important",
            },
            ".status-baja .ag-cell": {
                "background-color": "#F1F5F9 !important",
            },
            ".status-default .ag-cell": {
                "background-color": "#FFFFFF !important",
            },
            ".status-activo.ag-row-hover .ag-cell": {
                "background-color": "#DCFCE7 !important",
            },
            ".status-resguardo.ag-row-hover .ag-cell": {
                "background-color": "#DBEAFE !important",
            },
            ".status-reparacion.ag-row-hover .ag-cell": {
                "background-color": "#FFEDD5 !important",
            },
            ".status-sustituido.ag-row-hover .ag-cell": {
                "background-color": "#F3E8FF !important",
            },
            ".status-decomisado.ag-row-hover .ag-cell": {
                "background-color": "#FEE2E2 !important",
            },
            ".status-baja.ag-row-hover .ag-cell": {
                "background-color": "#E2E8F0 !important",
            },
            ".status-activo .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #16A34A !important",
            },
            ".status-resguardo .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #2563EB !important",
            },
            ".status-reparacion .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #F97316 !important",
            },
            ".status-sustituido .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #7C3AED !important",
            },
            ".status-decomisado .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #DC2626 !important",
            },
            ".status-baja .ag-cell[col-id='acciones']": {
                "border-left": "4px solid #64748B !important",
            },
        }
        grid_response = AgGrid(
            table_df,
            gridOptions=gb.build(),
            height=430,
            fit_columns_on_grid_load=False,
            update_mode=GridUpdateMode.VALUE_CHANGED | GridUpdateMode.FILTERING_CHANGED | GridUpdateMode.SORTING_CHANGED,
            data_return_mode=DataReturnMode.FILTERED_AND_SORTED,
            allow_unsafe_jscode=JsCode is not None,
            enable_enterprise_modules=True,
            server_sync_strategy="server_wins",
            theme="streamlit",
            custom_css=inventory_grid_css,
            show_download_button=False,
            key="inventario_maestro_grid",
        )
        visible_df = get_aggrid_visible_data(grid_response, table_df)
        export_df = visible_df.drop(columns=["id", ROW_ACTION_COLUMN, ROW_ACTION_TOKEN_COLUMN], errors="ignore")
        dispatch_inventory_row_action(get_inventory_row_action(grid_response))
    else:
        st.info("Instala streamlit-aggrid para activar filtros por columna estilo Excel.")
        table_event = st.dataframe(
            export_df,
            use_container_width=True,
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row",
            key="inventario_maestro_table",
            column_config={
                "numero_terminal": st.column_config.TextColumn("Terminal"),
                "numero_afiliado": st.column_config.TextColumn("Afiliado"),
                "hotel": st.column_config.TextColumn("Hotel"),
                "area": st.column_config.TextColumn("Área"),
                "departamento": st.column_config.TextColumn("Departamento"),
                "responsable": st.column_config.TextColumn("Responsable"),
                "estatus": st.column_config.TextColumn("Estatus"),
                "fecha_asignacion": st.column_config.TextColumn("Fecha asignación"),
                "fecha_cambio": st.column_config.TextColumn("Fecha cambio"),
                "sustituido_por": st.column_config.TextColumn("Sustituido por"),
                "observacion": st.column_config.TextColumn("Observación"),
            },
        )
        selected_rows = get_dataframe_selected_rows(table_event)
        if selected_rows and selected_rows[0] < len(inventory_display):
            st.caption("Para editar una fila desde los tres puntos, instala streamlit-aggrid.")

    col1, col2 = st.columns(2)
    if col1.button(
        "Generar resguardo PDF",
        type="primary",
        disabled=export_df.empty,
        use_container_width=True,
        key="abrir_resguardo_filtrado",
    ):
        st.session_state["resguardo_filtrado_df"] = export_df.copy()
        st.session_state.pop("resguardo_filtrado_pdf", None)
        st.session_state.pop("resguardo_filtrado_filename", None)
        dialog_resguardo_filtrado()

    excel_bytes = df_to_excel_bytes({"Inventario": export_df}) if not export_df.empty else None
    with col2:
        st.download_button(
            "Descargar inventario Excel",
            data=excel_bytes or b"",
            file_name=f"inventario_datafonos_{date.today()}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            disabled=not excel_bytes,
            use_container_width=True,
            key="inventario_excel_download",
        )
        if excel_bytes is None and not export_df.empty:
            st.info("Para activar la exportación a Excel, agrega openpyxl al archivo requirements.txt.")



def render_registro_datafono_form(form_key="form_registro"):
    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.form(form_key, clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        numero_terminal = c1.text_input("Número Terminal *", value="")
        numero_afiliado = c2.text_input("Número Afiliado *", value="")
        hotel = c3.selectbox("Hotel *", hoteles, index=None, placeholder="Seleccione hotel")

        c4, c5, c6 = st.columns(3)
        areas = cfg("Areas")
        area = c4.selectbox("Área *", areas, index=None, placeholder="Seleccione área")
        departamento = c5.selectbox("Departamento *", departamentos, index=None, placeholder="Seleccione departamento")
        responsable = c6.text_input("Responsable", value="")

        c7, c8 = st.columns(2)
        estatus = c7.selectbox("Estatus *", estatus_list, index=None, placeholder="Seleccione estatus")
        fecha_asignacion = c8.date_input("Fecha asignación", value=date.today())

        observacion = st.text_area("Observación", value="")
        submitted = st.form_submit_button("Guardar datafono", use_container_width=True)

    if submitted:
        numero_terminal, numero_afiliado, validation_error = validate_terminal_fields(numero_terminal, numero_afiliado)
        if validation_error:
            st.error(validation_error)
            return None
        if not hotel or not area or not departamento or not estatus:
            st.error("Completa los campos obligatorios.")
            return None

        df = get_inventory()
        terminales_existentes = df["numero_terminal"].astype(str).map(normalize_terminal) if not df.empty else pd.Series(dtype=str)
        if numero_terminal in terminales_existentes.values:
            st.error("Ese número de terminal ya existe en el inventario.")
            return None

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_row = {
            "id": str(uuid.uuid4())[:8],
            "numero_terminal": numero_terminal,
            "numero_afiliado": numero_afiliado,
            "hotel": hotel,
            "area": area,
            "departamento": departamento,
            "responsable": responsable,
            "estatus": estatus,
            "fecha_asignacion": str(fecha_asignacion),
            "fecha_cambio": "",
            "sustituido_por": "",
            "observacion": observacion,
            "creado_el": now,
            "actualizado_el": now
        }
        append_sheet_row("Inventario", new_row, INVENTARIO_COLUMNS)
        add_history(numero_terminal, "", hotel, area, departamento, "", estatus, "Registro inicial", responsable, observacion)
        st.success("Datafono registrado correctamente.")
        return numero_terminal

    return None


@st.dialog("Registrar nuevo datafono", width="large")
def dialog_registrar_datafono():
    saved_terminal = render_registro_datafono_form("form_registro_datafono_modal")
    if saved_terminal:
        st.session_state["registro_datafono_success"] = f"Datafono {saved_terminal} registrado correctamente."
        time.sleep(0.6)
        st.rerun()


def registrar_datafono():
    header()
    st.subheader("Registrar nuevo datafono")
    render_registro_datafono_form()


def aplicar_actualizacion_terminal(row_id, nuevo_hotel, nueva_area, nuevo_departamento, nuevo_responsable, nuevo_estatus, fecha_cambio, sustituido_por, motivo, observacion):
    df = get_inventory()
    match = df[df["id"] == row_id]
    if match.empty:
        st.error("No se encontró el datafono seleccionado.")
        return

    idx = match.index[0]
    old = df.loc[idx].copy()

    updated_row = old.to_dict()
    updated_row.update({
        "hotel": nuevo_hotel,
        "area": nueva_area,
        "departamento": nuevo_departamento,
        "responsable": nuevo_responsable,
        "estatus": nuevo_estatus,
        "fecha_cambio": str(fecha_cambio),
        "sustituido_por": sustituido_por,
        "observacion": observacion,
        "actualizado_el": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

    if not update_sheet_row("Inventario", INVENTARIO_COLUMNS, "id", row_id, updated_row):
        st.error("No se pudo actualizar la fila en Google Sheets.")
        return

    add_history(
        terminal_anterior=str(old["numero_terminal"]),
        terminal_nueva=sustituido_por,
        hotel=nuevo_hotel,
        area=nueva_area,
        departamento=nuevo_departamento,
        estatus_anterior=str(old["estatus"]),
        estatus_nuevo=nuevo_estatus,
        motivo=motivo,
        responsable=nuevo_responsable,
        observacion=observacion
    )

    st.success("Datafono actualizado correctamente.")



@st.dialog("Editar datafono", width="large")
def dialog_editar_terminal(row_id):
    df = get_inventory()
    selected_df = df[df["id"].astype(str) == str(row_id)]
    if selected_df.empty:
        st.warning("La terminal seleccionada ya no existe o fue actualizada.")
        if st.button("Cerrar", use_container_width=True):
            st.rerun()
        return

    row = selected_df.iloc[0]
    terminal_sel = str(row["numero_terminal"])
    estatus_list = cfg("Estatus")

    st.markdown(f"### Editar estatus - Terminal {terminal_sel}")
    st.markdown(
        f"""
        **Datos actuales:**  
        Terminal: **{row['numero_terminal']}** | Afiliado: **{row['numero_afiliado']}** | 
        Hotel: **{row['hotel']}** | Estatus: **{row['estatus']}**
        """
    )

    with st.form(f"form_editar_terminal_modal_{row_id}"):
        c1, c2, c3 = st.columns(3)
        nuevo_estatus = c1.selectbox("Estatus", estatus_list, index=estatus_list.index(row["estatus"]) if row["estatus"] in estatus_list else 0)
        fecha_cambio = c2.date_input("Fecha cambio", value=date.today())
        sustituido_por = c3.text_input("Sustituido por", value=row["sustituido_por"])

        motivo = st.text_input("Motivo", value="Actualización de estatus")
        observacion = st.text_area("Observación", value=row["observacion"])

        b1, b2 = st.columns([1, 1])
        guardar = b1.form_submit_button("Guardar estatus", type="primary", use_container_width=True)
        cerrar = b2.form_submit_button("Cerrar", use_container_width=True)

    if cerrar:
        st.rerun()

    if guardar:
        aplicar_actualizacion_terminal(
            row_id=row["id"],
            nuevo_hotel=row["hotel"],
            nueva_area=row["area"],
            nuevo_departamento=row["departamento"],
            nuevo_responsable=row["responsable"],
            nuevo_estatus=nuevo_estatus,
            fecha_cambio=fecha_cambio,
            sustituido_por=sustituido_por,
            motivo=motivo,
            observacion=observacion
        )
        st.success("Cambios guardados correctamente.")
        time.sleep(0.8)
        st.rerun()


@st.dialog("Editar datos del datafono", width="large")
def dialog_editar_datos_terminal(row_id):
    df = get_inventory()
    selected_df = df[df["id"].astype(str) == str(row_id)]
    if selected_df.empty:
        st.warning("La terminal seleccionada ya no existe o fue actualizada.")
        if st.button("Cerrar", use_container_width=True):
            st.rerun()
        return

    row = selected_df.iloc[0]
    terminal_sel = normalize_text(row["numero_terminal"])
    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    areas = cfg("Areas")

    st.markdown(f"### Editar datos - Terminal {terminal_sel}")

    with st.form(f"form_editar_datos_terminal_{row_id}"):
        c1, c2, c3 = st.columns(3)
        numero_terminal = c1.text_input("Número Terminal *", value=row["numero_terminal"])
        numero_afiliado = c2.text_input("Número Afiliado *", value=row["numero_afiliado"])
        hotel = c3.selectbox("Hotel *", hoteles, index=hoteles.index(row["hotel"]) if row["hotel"] in hoteles else 0)

        c4, c5, c6 = st.columns(3)
        area = c4.selectbox("Área *", areas, index=areas.index(row["area"]) if row["area"] in areas else 0)
        departamento = c5.selectbox("Departamento *", departamentos, index=departamentos.index(row["departamento"]) if row["departamento"] in departamentos else 0)
        responsable = c6.text_input("Responsable", value=row["responsable"])

        fecha_asignacion = st.date_input(
            "Fecha asignación",
            value=parse_date_or_today(row["fecha_asignacion"])
        )
        observacion = st.text_area("Observación", value=row["observacion"])

        b1, b2 = st.columns(2)
        guardar = b1.form_submit_button("Guardar datos", type="primary", use_container_width=True)
        cerrar = b2.form_submit_button("Cerrar", use_container_width=True)

    if cerrar:
        st.rerun()

    if guardar:
        numero_terminal, numero_afiliado, validation_error = validate_terminal_fields(numero_terminal, numero_afiliado)
        if validation_error:
            st.error(validation_error)
            return
        if not hotel or not area or not departamento:
            st.error("Completa los campos obligatorios.")
            return

        terminales_existentes = df[df["id"].astype(str) != str(row_id)]["numero_terminal"].astype(str).map(normalize_terminal)
        if numero_terminal in terminales_existentes.values:
            st.error("Ese número de terminal ya existe en el inventario.")
            return

        updated_row = row.to_dict()
        updated_row.update({
            "numero_terminal": numero_terminal,
            "numero_afiliado": numero_afiliado,
            "hotel": hotel,
            "area": area,
            "departamento": departamento,
            "responsable": responsable,
            "fecha_asignacion": str(fecha_asignacion),
            "observacion": observacion,
            "actualizado_el": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

        tracked_fields = [
            "numero_terminal", "numero_afiliado", "hotel", "area",
            "departamento", "responsable", "fecha_asignacion", "observacion"
        ]
        has_changes = any(normalize_text(updated_row[field]) != normalize_text(row[field]) for field in tracked_fields)
        if not has_changes:
            st.info("No hay cambios para guardar.")
            return

        if not update_sheet_row("Inventario", INVENTARIO_COLUMNS, "id", row_id, updated_row):
            st.error("No se pudo actualizar la fila en Google Sheets.")
            return

        add_history(
            terminal_anterior=str(row["numero_terminal"]),
            terminal_nueva=numero_terminal if numero_terminal != normalize_terminal(row["numero_terminal"]) else "",
            hotel=hotel,
            area=area,
            departamento=departamento,
            estatus_anterior=str(row["estatus"]),
            estatus_nuevo=str(row["estatus"]),
            motivo="Edición de datos maestros",
            responsable=responsable,
            observacion=observacion
        )
        st.success("Datos actualizados correctamente.")
        time.sleep(0.8)
        st.rerun()


@st.dialog("Bitácora de cambios", width="large")
def dialog_bitacora_terminal(row_id):
    df = get_inventory()
    selected_df = df[df["id"].astype(str) == str(row_id)]
    if selected_df.empty:
        st.warning("La terminal seleccionada ya no existe o fue actualizada.")
        if st.button("Cerrar", use_container_width=True):
            st.rerun()
        return

    row = selected_df.iloc[0]
    terminal_sel = str(row["numero_terminal"])
    st.markdown(f"### Bitácora — Terminal {terminal_sel}")

    hist = get_history()
    bitacora = hist[(hist["terminal_anterior"] == terminal_sel) | (hist["terminal_nueva"] == terminal_sel)]
    if bitacora.empty:
        st.info("Esta terminal no tiene cambios registrados.")
    else:
        st.dataframe(bitacora.sort_index(ascending=False), use_container_width=True, hide_index=True)

    if st.button("Cerrar", use_container_width=True):
        st.rerun()


@st.dialog("Generar resguardo PDF", width="large")
def dialog_resguardo_filtrado():
    filtered_df = st.session_state.get("resguardo_filtrado_df")
    if not isinstance(filtered_df, pd.DataFrame) or filtered_df.empty:
        st.warning("No hay datafonos filtrados para generar el resguardo.")
        if st.button("Cerrar", use_container_width=True):
            st.rerun()
        return

    filtered_df = filtered_df.drop(columns=["id", ROW_ACTION_COLUMN, ROW_ACTION_TOKEN_COLUMN], errors="ignore").copy()
    filtered_df = filtered_df.fillna("").astype(str)
    signature = dataframe_signature(filtered_df)
    signature_key = "resguardo_filtrado_signature"
    pdf_key = "resguardo_filtrado_pdf"
    filename_key = "resguardo_filtrado_filename"
    if st.session_state.get(signature_key) != signature:
        st.session_state.pop(pdf_key, None)
        st.session_state.pop(filename_key, None)
        st.session_state[signature_key] = signature

    responsables = []
    if "responsable" in filtered_df.columns:
        responsables = [value for value in filtered_df["responsable"].map(normalize_text).unique().tolist() if value]
    responsable_default = responsables[0] if len(responsables) == 1 else ""

    st.markdown("### Resguardo de datafonos filtrados")
    st.caption(f"Fecha del resguardo: {format_spanish_date(date.today())}. Datafonos incluidos: {len(filtered_df)}.")

    preview_columns = [
        col for col in [
            "numero_terminal", "numero_afiliado", "hotel", "area",
            "departamento", "responsable", "estatus"
        ] if col in filtered_df.columns
    ]
    if preview_columns:
        st.dataframe(filtered_df[preview_columns].head(8), use_container_width=True, hide_index=True)

    with st.form("form_resguardo_filtrado"):
        c1, c2 = st.columns(2)
        tipo_documento = c1.selectbox("Documento", ["Cédula", "Pasaporte"])
        numero_documento = c2.text_input("Cédula o pasaporte")

        c3, c4 = st.columns(2)
        nombre_responsable = c3.text_input("Nombre del responsable", value=responsable_default)
        puesto_responsable = c4.text_input("Puesto del responsable")

        observacion_resguardo = st.text_area("Observación del resguardo", value="")

        b1, b2 = st.columns(2)
        generar = b1.form_submit_button("Generar PDF", type="primary", use_container_width=True)
        cerrar = b2.form_submit_button("Cerrar", use_container_width=True)

    if cerrar:
        st.session_state.pop(pdf_key, None)
        st.session_state.pop(filename_key, None)
        st.rerun()

    if generar:
        numero_documento = normalize_text(numero_documento)
        nombre_responsable = normalize_text(nombre_responsable)
        puesto_responsable = normalize_text(puesto_responsable)
        observacion_resguardo = normalize_text(observacion_resguardo)

        if not numero_documento or not nombre_responsable or not puesto_responsable:
            st.error("Completa documento, nombre y puesto del responsable.")
            return

        try:
            pdf_bytes = build_resguardo_filtrado_pdf_bytes(
                filtered_df=filtered_df,
                tipo_documento=tipo_documento,
                numero_documento=numero_documento,
                nombre_responsable=nombre_responsable,
                puesto_responsable=puesto_responsable,
                observacion_resguardo=observacion_resguardo,
            )
        except ModuleNotFoundError:
            st.error("Para generar el PDF, agrega reportlab al archivo requirements.txt e instala las dependencias.")
            return

        st.session_state[pdf_key] = pdf_bytes
        st.session_state[filename_key] = f"resguardo_datafonos_filtrados_{date.today()}.pdf"
        st.success("PDF de resguardo generado correctamente.")

    if st.session_state.get(pdf_key):
        st.download_button(
            "Descargar PDF de resguardo",
            data=st.session_state[pdf_key],
            file_name=st.session_state.get(filename_key, f"resguardo_datafonos_{date.today()}.pdf"),
            mime="application/pdf",
            use_container_width=True,
            key="resguardo_filtrado_download",
        )


@st.dialog("Generar resguardo PDF", width="large")
def dialog_resguardo_terminal(row_id):
    df = get_inventory()
    selected_df = df[df["id"].astype(str) == str(row_id)]
    if selected_df.empty:
        st.warning("La terminal seleccionada ya no existe o fue actualizada.")
        if st.button("Cerrar", use_container_width=True):
            st.rerun()
        return

    row = selected_df.iloc[0]
    terminal_sel = normalize_text(row["numero_terminal"])
    key_prefix = f"resguardo_{row_id}"
    pdf_key = f"{key_prefix}_pdf"
    filename_key = f"{key_prefix}_filename"

    st.markdown(f"### Resguardo - Terminal {terminal_sel}")
    st.caption(f"Fecha del resguardo: {format_spanish_date(date.today())}")

    with st.form(f"form_{key_prefix}"):
        c1, c2 = st.columns(2)
        tipo_documento = c1.selectbox("Documento", ["Cédula", "Pasaporte"])
        numero_documento = c2.text_input("Cédula o pasaporte")

        c3, c4 = st.columns(2)
        nombre_responsable = c3.text_input("Nombre del responsable", value=normalize_text(row["responsable"]))
        puesto_responsable = c4.text_input("Puesto del responsable")

        observacion_resguardo = st.text_area("Observación del resguardo", value="")

        b1, b2 = st.columns(2)
        generar = b1.form_submit_button("Generar PDF", type="primary", use_container_width=True)
        cerrar = b2.form_submit_button("Cerrar", use_container_width=True)

    if cerrar:
        st.session_state.pop(pdf_key, None)
        st.session_state.pop(filename_key, None)
        st.rerun()

    if generar:
        numero_documento = normalize_text(numero_documento)
        nombre_responsable = normalize_text(nombre_responsable)
        puesto_responsable = normalize_text(puesto_responsable)

        if not numero_documento or not nombre_responsable or not puesto_responsable:
            st.error("Completa documento, nombre y puesto del responsable.")
            return

        try:
            pdf_bytes = build_resguardo_pdf_bytes(
                row=row,
                tipo_documento=tipo_documento,
                numero_documento=numero_documento,
                nombre_responsable=nombre_responsable,
                puesto_responsable=puesto_responsable,
                observacion_resguardo=observacion_resguardo,
            )
        except ModuleNotFoundError:
            st.error("Para generar el PDF, agrega reportlab al archivo requirements.txt e instala las dependencias.")
            return

        st.session_state[pdf_key] = pdf_bytes
        st.session_state[filename_key] = f"resguardo_{normalize_filename_part(terminal_sel)}_{date.today()}.pdf"
        st.success("PDF de resguardo generado correctamente.")

    if st.session_state.get(pdf_key):
        st.download_button(
            "Descargar PDF de resguardo",
            data=st.session_state[pdf_key],
            file_name=st.session_state.get(filename_key, f"resguardo_{date.today()}.pdf"),
            mime="application/pdf",
            use_container_width=True,
            key=f"{key_prefix}_download",
        )


def cambios_decomisos():
    df = get_inventory()
    if df.empty:
        header()
        st.info("No hay datafonos registrados.")
        return

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    header()
    st.subheader("Reporte de cambios, resguardos y decomisos")
    filtered = apply_common_filters(df, hoteles, departamentos, estatus_list, prefix="rep")
    st.markdown("### Terminales registradas")

    if filtered.empty:
        st.warning("No hay resultados con los filtros seleccionados.")
        return

    total_rows = len(filtered)
    page_size = st.selectbox("Registros por página", [10, 25, 50, 100], index=1, key="rep_page_size")
    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    page = st.number_input("Página", min_value=1, max_value=total_pages, value=1, step=1, key="rep_page")
    start = (page - 1) * page_size
    end = start + page_size
    page_df = filtered.iloc[start:end]
    st.caption(f"Mostrando {start + 1}-{min(end, total_rows)} de {total_rows} terminales filtradas.")

    with st.container(border=True):
        h1, h2, h3, h4, h5, h6, h7 = st.columns([1.1, 1.1, 1.2, 1.2, 1.1, 1.1, 0.4])
        h1.markdown("<p class='mini-label'><strong>Terminal</strong></p>", unsafe_allow_html=True)
        h2.markdown("<p class='mini-label'><strong>Afiliado</strong></p>", unsafe_allow_html=True)
        h3.markdown("<p class='mini-label'><strong>Hotel</strong></p>", unsafe_allow_html=True)
        h4.markdown("<p class='mini-label'><strong>Área / Depto.</strong></p>", unsafe_allow_html=True)
        h5.markdown("<p class='mini-label'><strong>Responsable</strong></p>", unsafe_allow_html=True)
        h6.markdown("<p class='mini-label'><strong>Estatus</strong></p>", unsafe_allow_html=True)
        h7.markdown("<p class='mini-label'><strong>Acción</strong></p>", unsafe_allow_html=True)

    with st.container(height=390, border=False):
        for _, row in page_df.iterrows():
            row_id = str(row["id"])
            terminal = str(row["numero_terminal"])

            with st.container(border=True):
                c1, c2, c3, c4, c5, c6, c7 = st.columns([1.1, 1.1, 1.2, 1.2, 1.1, 1.1, 0.4])
                c1.markdown(f"<p class='mini-value'>{escape_html(terminal)}</p>", unsafe_allow_html=True)
                c2.markdown(f"<p class='mini-value'>{escape_html(row['numero_afiliado'])}</p>", unsafe_allow_html=True)
                c3.markdown(f"<p class='mini-value'>{escape_html(row['hotel'])}</p>", unsafe_allow_html=True)
                c4.markdown(f"<p class='mini-value'>{escape_html(row['area'])} / {escape_html(row['departamento'])}</p>", unsafe_allow_html=True)
                c5.markdown(f"<p class='mini-value'>{escape_html(row['responsable'])}</p>", unsafe_allow_html=True)
                c6.markdown(status_html(row["estatus"]), unsafe_allow_html=True)

                with c7.popover("...", use_container_width=True):
                    st.markdown(f"**Terminal {terminal}**")
                    if st.button("Editar", key=f"edit_{row_id}", use_container_width=True):
                        dialog_editar_terminal(row_id)
                    if st.button("Bitácora", key=f"hist_{row_id}", use_container_width=True):
                        dialog_bitacora_terminal(row_id)

def historial():
    header()
    st.subheader("Historial de cambios")

    hist = get_history()
    if hist.empty:
        st.info("No hay historial registrado.")
    else:
        with st.container(border=True):
            st.markdown("#### Filtros de bitácora")
            c1, c2, c3 = st.columns(3)
            terminal_buscar = c1.text_input("Buscar terminal")
            responsable_buscar = c2.text_input("Buscar responsable")
            fecha_buscar = c3.text_input("Filtrar por fecha YYYY-MM-DD")

        filtered = hist.copy()
        if terminal_buscar:
            b = terminal_buscar.lower()
            filtered = filtered[
                filtered["terminal_anterior"].str.lower().str.contains(re.escape(b), na=False) |
                filtered["terminal_nueva"].str.lower().str.contains(re.escape(b), na=False)
            ]
        if responsable_buscar:
            b = responsable_buscar.lower()
            filtered = filtered[filtered["responsable"].str.lower().str.contains(re.escape(b), na=False)]
        if fecha_buscar:
            filtered = filtered[filtered["fecha"].astype(str).str.contains(re.escape(fecha_buscar), na=False)]

        st.dataframe(filtered.sort_index(ascending=False), use_container_width=True, hide_index=True)

        c1, c2 = st.columns(2)
        c1.download_button(
            "Descargar historial CSV",
            filtered.to_csv(index=False).encode("utf-8"),
            "historial_cambios.csv",
            "text/csv",
            use_container_width=True
        )
        with c2:
            render_excel_export(
                "Preparar historial Excel",
                "Descargar historial Excel",
                {"Historial": filtered},
                f"historial_cambios_{date.today()}.xlsx",
                "historial"
            )


def administrar_usuarios():
    header()
    st.subheader("Administración de usuarios")

    if st.session_state.get("rol") != "Administrador":
        st.error("Solo el administrador puede acceder a esta sección.")
        return

    roles = cfg("Roles")
    activo_opts = cfg("Activo")
    users = get_users()

    if "usuario_accion" not in st.session_state:
        st.session_state["usuario_accion"] = None
    if "usuario_seleccionado" not in st.session_state:
        st.session_state["usuario_seleccionado"] = None

    st.markdown("### Usuarios registrados")
    st.caption("Cada usuario tiene su menú de tres puntos para editar, activar/inactivar o cambiar contraseña.")

    if users.empty:
        st.info("No hay usuarios registrados.")
    else:
        for _, row in users.iterrows():
            usuario_actual = str(row["usuario"])

            with st.container(border=True):
                c1, c2, c3, c4 = st.columns([1.5, 1.2, 1, 0.35])

                c1.markdown(f"<p class='mini-label'>Usuario</p><p class='mini-value'>{escape_html(usuario_actual)}</p>", unsafe_allow_html=True)
                c2.markdown(f"<p class='mini-label'>Rol</p><p class='mini-value'>{escape_html(row['rol'])}</p>", unsafe_allow_html=True)

                activo = str(row["activo"])
                if activo == "Sí":
                    c3.success("Activo")
                else:
                    c3.error("Inactivo")

                with c4.popover("⋮", use_container_width=True):
                    st.markdown(f"**{usuario_actual}**")

                    if st.button("✏️ Editar usuario", key=f"edit_user_{usuario_actual}", use_container_width=True):
                        st.session_state["usuario_accion"] = "editar"
                        st.session_state["usuario_seleccionado"] = usuario_actual
                        st.rerun()

                    if st.button("🔐 Cambiar contraseña", key=f"pass_user_{usuario_actual}", use_container_width=True):
                        st.session_state["usuario_accion"] = "clave"
                        st.session_state["usuario_seleccionado"] = usuario_actual
                        st.rerun()

                    if st.button("🟢 Activar / 🔴 Inactivar", key=f"status_user_{usuario_actual}", use_container_width=True):
                        st.session_state["usuario_accion"] = "estatus"
                        st.session_state["usuario_seleccionado"] = usuario_actual
                        st.rerun()

    st.divider()

    tab_crear, tab_modificar = st.tabs(["Crear usuario", "Modificar usuario seleccionado"])

    with tab_crear:
        with st.form("form_user_crear", clear_on_submit=True):
            st.markdown("### Crear nuevo usuario")
            c1, c2, c3, c4 = st.columns(4)
            usuario = c1.text_input("Usuario")
            clave = c2.text_input("Contraseña", type="password")
            rol = c3.selectbox("Rol", roles)
            activo = c4.selectbox("Activo", activo_opts)
            submitted = st.form_submit_button("Crear usuario", use_container_width=True, type="primary")

        if submitted:
            usuario = normalize_text(usuario)
            if not usuario or not clave:
                st.error("Debe indicar usuario y contraseña.")
                return
            if len(clave) < 8:
                st.error("La contraseña debe tener al menos 8 caracteres.")
                return

            if usuario in users["usuario"].values:
                st.error("Ese usuario ya existe.")
                return

            new_user = {
                "usuario": usuario,
                "clave": make_password_hash(clave),
                "rol": rol,
                "activo": activo
            }
            append_sheet_row("Usuarios", new_user, USUARIOS_COLUMNS)
            st.success("Usuario creado correctamente.")
            st.rerun()

    with tab_modificar:
        seleccionado = st.session_state.get("usuario_seleccionado")
        accion = st.session_state.get("usuario_accion")

        if not seleccionado:
            st.info("Selecciona los tres puntos de un usuario para modificarlo.")
            return

        selected_df = users[users["usuario"] == seleccionado]

        if selected_df.empty:
            st.warning("El usuario seleccionado no existe o fue actualizado.")
            return

        row = selected_df.iloc[0]
        st.markdown(f"### Usuario seleccionado: **{seleccionado}**")

        if accion == "editar":
            with st.form("form_user_editar"):
                c1, c2, c3 = st.columns(3)
                nuevo_usuario = c1.text_input("Usuario", value=row["usuario"])
                nuevo_rol = c2.selectbox("Rol", roles, index=roles.index(row["rol"]) if row["rol"] in roles else 0)
                nuevo_activo = c3.selectbox("Activo", activo_opts, index=activo_opts.index(row["activo"]) if row["activo"] in activo_opts else 0)

                b1, b2 = st.columns(2)
                guardar = b1.form_submit_button("Guardar cambios", type="primary", use_container_width=True)
                cancelar = b2.form_submit_button("Cancelar", use_container_width=True)

            if cancelar:
                st.session_state["usuario_accion"] = None
                st.session_state["usuario_seleccionado"] = None
                st.rerun()

            if guardar:
                nuevo_usuario = normalize_text(nuevo_usuario)
                if not nuevo_usuario:
                    st.error("El usuario no puede quedar vacío.")
                    return

                if nuevo_usuario != seleccionado and nuevo_usuario in users["usuario"].values:
                    st.error("Ya existe otro usuario con ese nombre.")
                    return

                idx = users[users["usuario"] == seleccionado].index[0]
                updated_user = users.loc[idx].to_dict()
                updated_user.update({
                    "usuario": nuevo_usuario,
                    "rol": nuevo_rol,
                    "activo": nuevo_activo
                })
                if not update_sheet_row("Usuarios", USUARIOS_COLUMNS, "usuario", seleccionado, updated_user):
                    st.error("No se pudo actualizar el usuario en Google Sheets.")
                    return

                st.session_state["usuario_seleccionado"] = nuevo_usuario
                st.success("Usuario actualizado correctamente.")
                st.rerun()

        elif accion == "clave":
            with st.form("form_user_clave"):
                nueva_clave = st.text_input("Nueva contraseña", type="password")
                confirmar_clave = st.text_input("Confirmar contraseña", type="password")

                b1, b2 = st.columns(2)
                guardar = b1.form_submit_button("Cambiar contraseña", type="primary", use_container_width=True)
                cancelar = b2.form_submit_button("Cancelar", use_container_width=True)

            if cancelar:
                st.session_state["usuario_accion"] = None
                st.session_state["usuario_seleccionado"] = None
                st.rerun()

            if guardar:
                if not nueva_clave:
                    st.error("Debe indicar la nueva contraseña.")
                    return
                if len(nueva_clave) < 8:
                    st.error("La contraseña debe tener al menos 8 caracteres.")
                    return

                if nueva_clave != confirmar_clave:
                    st.error("Las contraseñas no coinciden.")
                    return

                idx = users[users["usuario"] == seleccionado].index[0]
                updated_user = users.loc[idx].to_dict()
                updated_user["clave"] = make_password_hash(nueva_clave)
                if not update_sheet_row("Usuarios", USUARIOS_COLUMNS, "usuario", seleccionado, updated_user):
                    st.error("No se pudo actualizar la contraseña en Google Sheets.")
                    return
                st.success("Contraseña actualizada correctamente.")
                st.rerun()

        elif accion == "estatus":
            estado_actual = row["activo"]
            nuevo_estado = "No" if estado_actual == "Sí" else "Sí"

            st.warning(f"El usuario **{seleccionado}** está actualmente en estado **{estado_actual}**.")
            st.write(f"¿Deseas cambiarlo a **{nuevo_estado}**?")

            c1, c2 = st.columns(2)
            if c1.button("Confirmar cambio de estado", type="primary", use_container_width=True):
                idx = users[users["usuario"] == seleccionado].index[0]
                updated_user = users.loc[idx].to_dict()
                updated_user["activo"] = nuevo_estado
                if not update_sheet_row("Usuarios", USUARIOS_COLUMNS, "usuario", seleccionado, updated_user):
                    st.error("No se pudo actualizar el estado en Google Sheets.")
                    return
                st.success("Estado del usuario actualizado correctamente.")
                st.rerun()

            if c2.button("Cancelar", use_container_width=True):
                st.session_state["usuario_accion"] = None
                st.session_state["usuario_seleccionado"] = None
                st.rerun()

def main():
    if "logged" not in st.session_state:
        st.session_state["logged"] = False

    if not st.session_state["logged"]:
        login()
        return

    with st.sidebar:
        session_user = escape_html(st.session_state.get("usuario"))
        session_role = escape_html(st.session_state.get("rol"))
        st.markdown('<div class="sidebar-title">💳 Control Datafonos</div>', unsafe_allow_html=True)
        st.markdown(
            f"""
            <div class="sidebar-user-card">
                <p><strong>Usuario:</strong> {session_user}</p>
                <p><strong>Rol:</strong> {session_role}</p>
            </div>
            """,
            unsafe_allow_html=True
        )

        menu = [
            "Dashboard",
            "Inventario Maestro",
            "Historial de Cambios"
        ]

        if st.session_state.get("rol") == "Administrador":
            menu.append("Usuarios")

        selected = st.radio("Menú principal", menu)

        st.divider()
        st.markdown('<div class="sidebar-footer">Base de datos conectada:<br><strong>Team Audit</strong></div>', unsafe_allow_html=True)
        if st.button("Refrescar datos", use_container_width=True):
            read_sheet_cached.clear()
            read_config_cached.clear()
            df_to_excel_bytes.clear()
            st.rerun()
        if st.button("Cerrar sesión", use_container_width=True):
            st.session_state.clear()
            st.rerun()

    if selected == "Dashboard":
        dashboard()
    elif selected == "Inventario Maestro":
        inventario()
    elif selected == "Historial de Cambios":
        historial()
    elif selected == "Usuarios":
        administrar_usuarios()


if __name__ == "__main__":
    main()
