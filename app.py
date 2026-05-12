
import streamlit as st
import pandas as pd
from datetime import date, datetime
import uuid
import gspread
from google.oauth2.service_account import Credentials

st.set_page_config(
    page_title="Control de Datafonos",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="expanded"
)

HOTELES = ["MCB", "MPCB", "PPRL", "ZEL", "PGC"]
DEPARTAMENTOS = ["Recepción", "Spa", "A&B", "Golf", "Casino", "Administración", "Auditoría", "Otro"]
ESTATUS = ["Activo", "Resguardo", "En reparación", "Sustituido", "Decomisado", "Baja"]

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

CUSTOM_CSS = """
<style>
    .main {background-color: #F7FAFC;}
    [data-testid="stSidebar"] {background-color: #FFFFFF;}
    .block-container {padding-top: 1.5rem;}
    .title-card {
        background: linear-gradient(135deg, #EAF6FF 0%, #FFFFFF 72%);
        border: 1px solid #D7ECFF;
        padding: 24px 28px;
        border-radius: 24px;
        margin-bottom: 18px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }
    .title-card h1 {
        margin: 0;
        color: #0F172A;
        font-size: 2rem;
        font-weight: 800;
    }
    .title-card p {
        color: #475569;
        margin: 7px 0 0 0;
        font-size: 1rem;
    }
    div[data-testid="stMetric"] {
        background: white;
        border: 1px solid #E5E7EB;
        padding: 16px;
        border-radius: 18px;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
    }
    .small-note {
        color: #64748B;
        font-size: 0.9rem;
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
        st.error("No fue posible conectar con Google Sheets. Verifica los Secrets de Streamlit y que el Google Sheet esté compartido con el client_email del JSON.")
        st.exception(e)
        st.stop()


def get_ws(name, columns):
    sh = connect_gsheet()
    try:
        ws = sh.worksheet(name)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=name, rows=1000, cols=max(20, len(columns)))
        ws.update([columns])
    values = ws.get_all_values()
    if not values:
        ws.update([columns])
    elif values[0] != columns:
        # Mantiene datos existentes, pero corrige encabezados si faltan columnas
        existing_headers = values[0]
        new_headers = existing_headers[:]
        for col in columns:
            if col not in new_headers:
                new_headers.append(col)
        ws.update("A1", [new_headers])
    return ws


def read_sheet(name, columns):
    ws = get_ws(name, columns)
    records = ws.get_all_records()
    df = pd.DataFrame(records)
    for col in columns:
        if col not in df.columns:
            df[col] = ""
    if df.empty:
        return pd.DataFrame(columns=columns)
    return df[columns].astype(str).fillna("")


def write_sheet(name, df, columns):
    ws = get_ws(name, columns)
    df = df.copy()
    for col in columns:
        if col not in df.columns:
            df[col] = ""
    df = df[columns].fillna("")
    ws.clear()
    ws.update([columns] + df.values.tolist())


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


def header():
    st.markdown("""
    <div class="title-card">
        <h1>Control de Datafonos</h1>
        <p>Inventario profesional conectado a Google Sheets: terminales, afiliados, áreas, resguardos, cambios y decomisos.</p>
    </div>
    """, unsafe_allow_html=True)


def login():
    st.markdown("""
    <div class="title-card">
        <h1>Control de Datafonos</h1>
        <p>Acceso seguro al panel de control.</p>
    </div>
    """, unsafe_allow_html=True)

    col1, col2, col3 = st.columns([1, 1.05, 1])
    with col2:
        st.subheader("Iniciar sesión")
        usuario = st.text_input("Usuario")
        clave = st.text_input("Contraseña", type="password")
        if st.button("Entrar", use_container_width=True):
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

    total = len(df)
    activos = int((df["estatus"] == "Activo").sum()) if not df.empty else 0
    resguardo = int((df["estatus"] == "Resguardo").sum()) if not df.empty else 0
    reparacion = int((df["estatus"] == "En reparación").sum()) if not df.empty else 0
    decomisados = int((df["estatus"] == "Decomisado").sum()) if not df.empty else 0

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total", total)
    c2.metric("Activos", activos)
    c3.metric("Resguardo", resguardo)
    c4.metric("En reparación", reparacion)
    c5.metric("Decomisados", decomisados)

    st.divider()

    col_a, col_b = st.columns(2)
    with col_a:
        st.subheader("Datafonos por hotel")
        if not df.empty:
            chart = df.groupby("hotel").size().reset_index(name="Cantidad")
            st.bar_chart(chart, x="hotel", y="Cantidad", use_container_width=True)
        else:
            st.info("Aún no hay datafonos registrados.")

    with col_b:
        st.subheader("Datafonos por estatus")
        if not df.empty:
            chart = df.groupby("estatus").size().reset_index(name="Cantidad")
            st.bar_chart(chart, x="estatus", y="Cantidad", use_container_width=True)
        else:
            st.info("Aún no hay datafonos registrados.")

    st.subheader("Últimos movimientos")
    hist = get_history()
    if hist.empty:
        st.info("No hay movimientos registrados.")
    else:
        st.dataframe(hist.tail(10).sort_index(ascending=False), use_container_width=True, hide_index=True)


def inventario():
    header()
    st.subheader("Inventario maestro")

    df = get_inventory()

    with st.expander("Filtros", expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        f_hotel = c1.multiselect("Hotel", HOTELES)
        f_depto = c2.multiselect("Departamento", DEPARTAMENTOS)
        f_estatus = c3.multiselect("Estatus", ESTATUS)
        busqueda = c4.text_input("Buscar")

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

    st.dataframe(filtered, use_container_width=True, hide_index=True)
    st.download_button(
        "Descargar inventario CSV",
        filtered.to_csv(index=False).encode("utf-8"),
        "inventario_datafonos.csv",
        "text/csv",
        use_container_width=True
    )


def registrar_datafono():
    header()
    st.subheader("Registrar nuevo datafono")

    with st.form("form_registro", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        numero_terminal = c1.text_input("Número Terminal *")
        numero_afiliado = c2.text_input("Número Afiliado *")
        hotel = c3.selectbox("Hotel *", HOTELES)

        c4, c5, c6 = st.columns(3)
        area = c4.text_input("Área *")
        departamento = c5.selectbox("Departamento *", DEPARTAMENTOS)
        responsable = c6.text_input("Responsable")

        c7, c8 = st.columns(2)
        estatus = c7.selectbox("Estatus", ESTATUS, index=0)
        fecha_asignacion = c8.date_input("Fecha asignación", value=date.today())

        observacion = st.text_area("Observación")
        submitted = st.form_submit_button("Guardar datafono", use_container_width=True)

    if submitted:
        if not numero_terminal or not numero_afiliado or not area:
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


def cambiar_estatus():
    header()
    st.subheader("Cambio, resguardo o decomiso")

    df = get_inventory()
    if df.empty:
        st.info("No hay datafonos registrados.")
        return

    terminales = df["numero_terminal"].tolist()
    terminal = st.selectbox("Seleccione el terminal", terminales)
    row = df[df["numero_terminal"] == terminal].iloc[0]

    st.info(f"Terminal: {row['numero_terminal']} | Hotel: {row['hotel']} | Área: {row['area']} | Estatus actual: {row['estatus']}")

    with st.form("form_cambio"):
        c1, c2, c3 = st.columns(3)
        nuevo_estatus = c1.selectbox("Nuevo estatus", ESTATUS, index=ESTATUS.index(row["estatus"]) if row["estatus"] in ESTATUS else 0)
        terminal_nueva = c2.text_input("Sustituido por / Terminal nueva")
        fecha_cambio = c3.date_input("Fecha cambio", value=date.today())

        c4, c5, c6 = st.columns(3)
        nuevo_hotel = c4.selectbox("Hotel", HOTELES, index=HOTELES.index(row["hotel"]) if row["hotel"] in HOTELES else 0)
        nueva_area = c5.text_input("Área", value=row["area"])
        nuevo_departamento = c6.selectbox("Departamento", DEPARTAMENTOS, index=DEPARTAMENTOS.index(row["departamento"]) if row["departamento"] in DEPARTAMENTOS else 0)

        responsable = st.text_input("Responsable del movimiento", value=row["responsable"])
        motivo = st.text_area("Motivo")
        observacion = st.text_area("Observación adicional")

        submitted = st.form_submit_button("Aplicar movimiento", use_container_width=True)

    if submitted:
        idx = df[df["numero_terminal"] == terminal].index[0]
        estatus_anterior = df.loc[idx, "estatus"]

        df.loc[idx, "estatus"] = nuevo_estatus
        df.loc[idx, "hotel"] = nuevo_hotel
        df.loc[idx, "area"] = nueva_area
        df.loc[idx, "departamento"] = nuevo_departamento
        df.loc[idx, "responsable"] = responsable
        df.loc[idx, "fecha_cambio"] = str(fecha_cambio)
        df.loc[idx, "sustituido_por"] = terminal_nueva
        df.loc[idx, "observacion"] = observacion
        df.loc[idx, "actualizado_el"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        save_inventory(df)
        add_history(terminal, terminal_nueva, nuevo_hotel, nueva_area, nuevo_departamento, estatus_anterior, nuevo_estatus, motivo, responsable, observacion)

        if terminal_nueva:
            st.warning("Recuerda registrar la terminal nueva si aún no existe en el inventario.")
        st.success("Movimiento aplicado correctamente.")


def historial():
    header()
    st.subheader("Historial de cambios")

    hist = get_history()
    if hist.empty:
        st.info("No hay historial registrado.")
    else:
        st.dataframe(hist.sort_index(ascending=False), use_container_width=True, hide_index=True)
        st.download_button(
            "Descargar historial CSV",
            hist.to_csv(index=False).encode("utf-8"),
            "historial_cambios.csv",
            "text/csv",
            use_container_width=True
        )


def administrar_usuarios():
    header()
    st.subheader("Administración de usuarios")

    if st.session_state.get("rol") != "Administrador":
        st.error("Solo el administrador puede acceder a esta sección.")
        return

    users = get_users()
    st.dataframe(users.drop(columns=["clave"], errors="ignore"), use_container_width=True, hide_index=True)

    with st.form("form_user", clear_on_submit=True):
        st.markdown("### Crear usuario")
        c1, c2, c3, c4 = st.columns(4)
        usuario = c1.text_input("Usuario")
        clave = c2.text_input("Contraseña", type="password")
        rol = c3.selectbox("Rol", ["Administrador", "Usuario"])
        activo = c4.selectbox("Activo", ["Sí", "No"])
        submitted = st.form_submit_button("Crear usuario", use_container_width=True)

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


def main():
    if "logged" not in st.session_state:
        st.session_state["logged"] = False

    if not st.session_state["logged"]:
        login()
        return

    with st.sidebar:
        st.markdown("## 💳 Control Datafonos")
        st.caption(f"Usuario: {st.session_state.get('usuario')}")
        st.caption(f"Rol: {st.session_state.get('rol')}")

        menu = [
            "Dashboard",
            "Inventario Maestro",
            "Registrar Datafono",
            "Cambios / Decomisos",
            "Historial de Cambios"
        ]

        if st.session_state.get("rol") == "Administrador":
            menu.append("Usuarios")

        selected = st.radio("Menú", menu)

        st.divider()
        st.markdown('<p class="small-note">Base de datos: Google Sheets</p>', unsafe_allow_html=True)
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
        cambiar_estatus()
    elif selected == "Historial de Cambios":
        historial()
    elif selected == "Usuarios":
        administrar_usuarios()


if __name__ == "__main__":
    main()
