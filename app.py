
import streamlit as st
import pandas as pd
import altair as alt
from datetime import date, datetime
import uuid
import time
from io import BytesIO
import gspread
from google.oauth2.service_account import Credentials

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

DASHBOARD_PALETTE = [
    "#2563EB", "#16A34A", "#F97316", "#DC2626", "#7C3AED",
    "#0891B2", "#CA8A04", "#DB2777", "#475569", "#65A30D"
]

STATUS_COLORS = {
    "Activo": "#16A34A",
    "Resguardo": "#2563EB",
    "En reparaciÃ³n": "#F97316",
    "Sustituido": "#7C3AED",
    "Decomisado": "#DC2626",
    "Baja": "#64748B",
}

CONFIG_DEFAULT = {
    "Hoteles": ["5918-MCB", "5917-MPCB", "5910-PPRL", "5911-ZEL", "5930-PGC", "6034-GOLF Hoyo 10&9", "6254-TENNIS", "6374-CAISNO"],
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


def get_ws(name, columns):
    sh = connect_gsheet()

    def open_or_create():
        try:
            return sh.worksheet(name)
        except gspread.WorksheetNotFound:
            ws_new = sh.add_worksheet(title=name, rows=1000, cols=max(20, len(columns)))
            ws_new.update("A1", [columns])
            return ws_new

    ws = retry_gspread(open_or_create)

    def get_values():
        return ws.get_all_values()

    values = retry_gspread(get_values)

    if not values:
        retry_gspread(lambda: ws.update("A1", [columns]))

    return ws


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
    df = df.copy()
    for col in columns:
        if col not in df.columns:
            df[col] = ""
    df = df[columns].fillna("")

    def do_write():
        ws.clear()
        ws.update("A1", [columns] + df.values.tolist())

    retry_gspread(do_write)
    read_sheet_cached.clear()
    read_config_cached.clear()


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
        users = pd.DataFrame([{
            "usuario": "admin",
            "clave": "admin123",
            "rol": "Administrador",
            "activo": "Sí"
        }])
        write_sheet("Usuarios", users, USUARIOS_COLUMNS)
    return users


def save_users(df):
    write_sheet("Usuarios", df, USUARIOS_COLUMNS)


def add_history(terminal_anterior, terminal_nueva, hotel, area, departamento, estatus_anterior, estatus_nuevo, motivo, responsable, observacion):
    hist = get_history()
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
    hist = pd.concat([hist, pd.DataFrame([new_row])], ignore_index=True)
    save_history(hist)


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
    return f'<span class="status-pill {css_class}">{status_clean}</span>'


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


def df_to_excel_bytes(sheets):
    output = BytesIO()
    try:
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            for sheet_name, df in sheets.items():
                df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
        return output.getvalue()
    except ModuleNotFoundError:
        return None


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
        filtered = filtered[filtered.apply(lambda row: b in " ".join(row.astype(str)).lower(), axis=1)]

    return filtered


def header():
    st.markdown("""
    <div class="title-card">
        <h1>Control de Datafonos</h1>
    </div>
    """, unsafe_allow_html=True)

def login():
    st.markdown("""
    <div class="title-card" style="text-align:center;">
        <div style="font-size:48px;">💳</div>
        <h1>Control de Datafonos</h1>
        <p>Acceso seguro al panel profesional de control, resguardo, cambios y decomisos.</p>
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

        with st.container(border=True):
            usuario = st.text_input("Usuario", placeholder="Digite su usuario")
            clave = st.text_input("Contraseña", type="password", placeholder="Digite su contraseña")
            entrar = st.button("Entrar al sistema", use_container_width=True, type="primary")

        if entrar:
            users = get_users()
            match = users[
                (users["usuario"] == usuario) &
                (users["clave"] == clave) &
                (users["activo"] == "Sí")
            ]
            if not match.empty:
                st.session_state["logged"] = True
                st.session_state["usuario"] = usuario
                st.session_state["rol"] = match.iloc[0]["rol"]
                st.rerun()
            else:
                st.error("Usuario o contraseña incorrectos.")



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

    export_bytes = df_to_excel_bytes({
        "Dashboard Filtrado": filtered,
        "Historial Filtrado": hist_filtrado
    })

    if export_bytes:
        st.download_button(
            "Descargar dashboard filtrado en Excel",
            data=export_bytes,
            file_name=f"dashboard_datafonos_{date.today()}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
    else:
        st.info("Para activar la exportación a Excel, agrega openpyxl al archivo requirements.txt.")


def inventario():
    header()
    st.subheader("Inventario maestro")

    df = get_inventory()
    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    filtered = apply_common_filters(df, hoteles, departamentos, estatus_list, prefix="inv")

    st.markdown("### Resultado")
    st.dataframe(filtered, use_container_width=True, hide_index=True)

    col1, col2 = st.columns(2)
    col1.download_button(
        "Descargar inventario CSV",
        filtered.to_csv(index=False).encode("utf-8"),
        "inventario_datafonos.csv",
        "text/csv",
        use_container_width=True
    )
    excel_bytes = df_to_excel_bytes({"Inventario": filtered})
    if excel_bytes:
        col2.download_button(
            "Descargar inventario Excel",
            data=excel_bytes,
            file_name=f"inventario_datafonos_{date.today()}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
    else:
        col2.info("Agrega openpyxl a requirements.txt para exportar Excel.")



def registrar_datafono():
    header()
    st.subheader("Registrar nuevo datafono")

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.form("form_registro", clear_on_submit=True):
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
        if not numero_terminal or not numero_afiliado or not hotel or not area or not departamento or not estatus:
            st.error("Completa los campos obligatorios.")
            return

        df = get_inventory()
        if numero_terminal in df["numero_terminal"].values:
            st.error("Ese número de terminal ya existe en el inventario.")
            return

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
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        save_inventory(df)
        add_history(numero_terminal, "", hotel, area, departamento, "", estatus, "Registro inicial", responsable, observacion)
        st.success("Datafono registrado correctamente.")


def aplicar_actualizacion_terminal(row_id, nuevo_hotel, nueva_area, nuevo_departamento, nuevo_responsable, nuevo_estatus, fecha_cambio, sustituido_por, motivo, observacion):
    df = get_inventory()
    match = df[df["id"] == row_id]
    if match.empty:
        st.error("No se encontró el datafono seleccionado.")
        return

    idx = match.index[0]
    old = df.loc[idx].copy()

    df.loc[idx, "hotel"] = nuevo_hotel
    df.loc[idx, "area"] = nueva_area
    df.loc[idx, "departamento"] = nuevo_departamento
    df.loc[idx, "responsable"] = nuevo_responsable
    df.loc[idx, "estatus"] = nuevo_estatus
    df.loc[idx, "fecha_cambio"] = str(fecha_cambio)
    df.loc[idx, "sustituido_por"] = sustituido_por
    df.loc[idx, "observacion"] = observacion
    df.loc[idx, "actualizado_el"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    save_inventory(df)

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
    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")
    areas = cfg("Areas")

    st.markdown(f"### Editar estatus / ubicación — Terminal {terminal_sel}")
    st.markdown(
        f"""
        **Datos actuales:**  
        Terminal: **{row['numero_terminal']}** | Afiliado: **{row['numero_afiliado']}** | 
        Hotel: **{row['hotel']}** | Estatus: **{row['estatus']}**
        """
    )

    with st.form(f"form_editar_terminal_modal_{row_id}"):
        c1, c2, c3 = st.columns(3)
        nuevo_hotel = c1.selectbox("Hotel", hoteles, index=hoteles.index(row["hotel"]) if row["hotel"] in hoteles else 0)
        nueva_area = c2.selectbox("Área", areas, index=areas.index(row["area"]) if row["area"] in areas else None, placeholder="Seleccione área")
        nuevo_departamento = c3.selectbox("Departamento", departamentos, index=departamentos.index(row["departamento"]) if row["departamento"] in departamentos else 0)

        c4, c5, c6 = st.columns(3)
        nuevo_responsable = c4.text_input("Responsable", value=row["responsable"])
        nuevo_estatus = c5.selectbox("Estatus", estatus_list, index=estatus_list.index(row["estatus"]) if row["estatus"] in estatus_list else 0)
        fecha_cambio = c6.date_input("Fecha cambio", value=date.today())

        c7, c8 = st.columns(2)
        sustituido_por = c7.text_input("Sustituido por", value=row["sustituido_por"])
        motivo = c8.text_input("Motivo", value="Actualización de estatus / ubicación")
        observacion = st.text_area("Observación", value=row["observacion"])

        b1, b2 = st.columns([1, 1])
        guardar = b1.form_submit_button("Guardar cambios", type="primary", use_container_width=True)
        cerrar = b2.form_submit_button("Cerrar", use_container_width=True)

    if cerrar:
        st.rerun()

    if guardar:
        aplicar_actualizacion_terminal(
            row_id=row["id"],
            nuevo_hotel=nuevo_hotel,
            nueva_area=nueva_area,
            nuevo_departamento=nuevo_departamento,
            nuevo_responsable=nuevo_responsable,
            nuevo_estatus=nuevo_estatus,
            fecha_cambio=fecha_cambio,
            sustituido_por=sustituido_por,
            motivo=motivo,
            observacion=observacion
        )
        st.success("Cambios guardados correctamente.")
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


def cambios_decomisos():
    df = get_inventory()
    if df.empty:
        header()
        st.info("No hay datafonos registrados.")
        return

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.container(key="sticky_cambios_header"):
        st.markdown("<span class='sticky-cambios-marker'></span>", unsafe_allow_html=True)
        header()
        st.subheader("Reporte de cambios, resguardos y decomisos")
        filtered = apply_common_filters(df, hoteles, departamentos, estatus_list, prefix="rep")
        st.markdown("### Terminales registradas")

        if not filtered.empty:
            with st.container(border=True):
                h1, h2, h3, h4, h5, h6, h7 = st.columns([1.1, 1.1, 1.2, 1.2, 1.1, 1.1, 0.4])
                h1.markdown("<p class='mini-label'><strong>Terminal</strong></p>", unsafe_allow_html=True)
                h2.markdown("<p class='mini-label'><strong>Afiliado</strong></p>", unsafe_allow_html=True)
                h3.markdown("<p class='mini-label'><strong>Hotel</strong></p>", unsafe_allow_html=True)
                h4.markdown("<p class='mini-label'><strong>Area / Depto.</strong></p>", unsafe_allow_html=True)
                h5.markdown("<p class='mini-label'><strong>Responsable</strong></p>", unsafe_allow_html=True)
                h6.markdown("<p class='mini-label'><strong>Estatus</strong></p>", unsafe_allow_html=True)
                h7.markdown("<p class='mini-label'><strong>Accion</strong></p>", unsafe_allow_html=True)

    if filtered.empty:
        st.warning("No hay resultados con los filtros seleccionados.")
        return

    for _, row in filtered.iterrows():
        row_id = str(row["id"])
        terminal = str(row["numero_terminal"])

        with st.container(border=True):
            c1, c2, c3, c4, c5, c6, c7 = st.columns([1.1, 1.1, 1.2, 1.2, 1.1, 1.1, 0.4])
            c1.markdown(f"<p class='mini-value'>{terminal}</p>", unsafe_allow_html=True)
            c2.markdown(f"<p class='mini-value'>{row['numero_afiliado']}</p>", unsafe_allow_html=True)
            c3.markdown(f"<p class='mini-value'>{row['hotel']}</p>", unsafe_allow_html=True)
            c4.markdown(f"<p class='mini-value'>{row['area']} / {row['departamento']}</p>", unsafe_allow_html=True)
            c5.markdown(f"<p class='mini-value'>{row['responsable']}</p>", unsafe_allow_html=True)
            c6.markdown(status_html(row["estatus"]), unsafe_allow_html=True)

            with c7.popover("⋮", use_container_width=True):
                st.markdown(f"**Terminal {terminal}**")
                if st.button("✏️ Editar", key=f"edit_{row_id}", use_container_width=True):
                    dialog_editar_terminal(row_id)
                if st.button("📋 Bitácora", key=f"hist_{row_id}", use_container_width=True):
                    dialog_bitacora_terminal(row_id)

    st.info("Selecciona los tres puntos de una terminal para editar o ver su bitácora.")


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
                filtered["terminal_anterior"].str.lower().str.contains(b, na=False) |
                filtered["terminal_nueva"].str.lower().str.contains(b, na=False)
            ]
        if responsable_buscar:
            b = responsable_buscar.lower()
            filtered = filtered[filtered["responsable"].str.lower().str.contains(b, na=False)]
        if fecha_buscar:
            filtered = filtered[filtered["fecha"].astype(str).str.contains(fecha_buscar, na=False)]

        st.dataframe(filtered.sort_index(ascending=False), use_container_width=True, hide_index=True)

        c1, c2 = st.columns(2)
        c1.download_button(
            "Descargar historial CSV",
            filtered.to_csv(index=False).encode("utf-8"),
            "historial_cambios.csv",
            "text/csv",
            use_container_width=True
        )
        excel_bytes = df_to_excel_bytes({"Historial": filtered})
        if excel_bytes:
            c2.download_button(
                "Descargar historial Excel",
                data=excel_bytes,
                file_name=f"historial_cambios_{date.today()}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
        else:
            c2.info("Agrega openpyxl a requirements.txt para exportar Excel.")


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

                c1.markdown(f"<p class='mini-label'>Usuario</p><p class='mini-value'>{usuario_actual}</p>", unsafe_allow_html=True)
                c2.markdown(f"<p class='mini-label'>Rol</p><p class='mini-value'>{row['rol']}</p>", unsafe_allow_html=True)

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
            if not usuario or not clave:
                st.error("Debe indicar usuario y contraseña.")
                return

            if usuario in users["usuario"].values:
                st.error("Ese usuario ya existe.")
                return

            new_user = pd.DataFrame([{
                "usuario": usuario,
                "clave": clave,
                "rol": rol,
                "activo": activo
            }])
            users = pd.concat([users, new_user], ignore_index=True)
            save_users(users)
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
                if not nuevo_usuario:
                    st.error("El usuario no puede quedar vacío.")
                    return

                if nuevo_usuario != seleccionado and nuevo_usuario in users["usuario"].values:
                    st.error("Ya existe otro usuario con ese nombre.")
                    return

                idx = users[users["usuario"] == seleccionado].index[0]
                users.loc[idx, "usuario"] = nuevo_usuario
                users.loc[idx, "rol"] = nuevo_rol
                users.loc[idx, "activo"] = nuevo_activo
                save_users(users)

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

                if nueva_clave != confirmar_clave:
                    st.error("Las contraseñas no coinciden.")
                    return

                idx = users[users["usuario"] == seleccionado].index[0]
                users.loc[idx, "clave"] = nueva_clave
                save_users(users)
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
                users.loc[idx, "activo"] = nuevo_estado
                save_users(users)
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
        st.markdown('<div class="sidebar-title">💳 Control Datafonos</div>', unsafe_allow_html=True)
        st.markdown(
            f"""
            <div class="sidebar-user-card">
                <p><strong>Usuario:</strong> {st.session_state.get('usuario')}</p>
                <p><strong>Rol:</strong> {st.session_state.get('rol')}</p>
            </div>
            """,
            unsafe_allow_html=True
        )

        menu = [
            "Dashboard",
            "Inventario Maestro",
            "Registrar Datafono",
            "Cambios / Decomisos",
            "Historial de Cambios"
        ]

        if st.session_state.get("rol") == "Administrador":
            menu.append("Usuarios")

        selected = st.radio("Menú principal", menu)

        st.divider()
        st.markdown('<div class="sidebar-footer">Base de datos conectada:<br><strong>Team Audit</strong></div>', unsafe_allow_html=True)
        if st.button("Cerrar sesión", use_container_width=True):
            st.session_state.clear()
            st.rerun()

    if selected == "Dashboard":
        dashboard()
    elif selected == "Inventario Maestro":
        inventario()
    elif selected == "Registrar Datafono":
        registrar_datafono()
    elif selected == "Cambios / Decomisos":
        cambios_decomisos()
    elif selected == "Historial de Cambios":
        historial()
    elif selected == "Usuarios":
        administrar_usuarios()


if __name__ == "__main__":
    main()
