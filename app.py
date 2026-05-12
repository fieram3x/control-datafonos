
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

CONFIG_DEFAULT = {
    "Hoteles": ["5918-MCB", "5917-MPCB", "5910-PPRL", "5911-ZEL", "5930-PGC", "6034-GOLF Hoyo 10&9", "6254-TENNIS", "6374-CAISNO"],
    "Departamentos": ["Recepción", "Spa", "A&B", "Hoyo 10&9", "Golf", "Tenis", "Casino", "Administración", "Auditoría", "Otro"],
    "Estatus": ["Activo", "Resguardo", "En reparación", "Sustituido", "Decomisado", "Baja"],
    "Roles": ["Administrador", "Usuario"],
    "Activo": ["Sí", "No"]
}

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
    .small-note {color: #64748B; font-size: 0.9rem;}
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


def get_ws(name, columns):
    sh = connect_gsheet()
    try:
        ws = sh.worksheet(name)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=name, rows=1000, cols=max(20, len(columns)))
        ws.update("A1", [columns])
    values = ws.get_all_values()
    if not values:
        ws.update("A1", [columns])
    return ws


def read_sheet(name, columns):
    """Lectura robusta para evitar errores de get_all_records con encabezados vacíos o duplicados."""
    ws = get_ws(name, columns)
    values = ws.get_all_values()

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


def write_sheet(name, df, columns):
    ws = get_ws(name, columns)
    df = df.copy()
    for col in columns:
        if col not in df.columns:
            df[col] = ""
    df = df[columns].fillna("")
    ws.clear()
    ws.update("A1", [columns] + df.values.tolist())


def read_config():
    sh = connect_gsheet()
    try:
        ws = sh.worksheet("Config")
        values = ws.get_all_values()
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
    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.expander("Filtros", expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        f_hotel = c1.multiselect("Hotel", hoteles)
        f_depto = c2.multiselect("Departamento", departamentos)
        f_estatus = c3.multiselect("Estatus", estatus_list)
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

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.form("form_registro", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        numero_terminal = c1.text_input("Número Terminal *")
        numero_afiliado = c2.text_input("Número Afiliado *")
        hotel = c3.selectbox("Hotel *", hoteles)

        c4, c5, c6 = st.columns(3)
        area = c4.text_input("Área *")
        departamento = c5.selectbox("Departamento *", departamentos)
        responsable = c6.text_input("Responsable")

        c7, c8 = st.columns(2)
        estatus = c7.selectbox("Estatus", estatus_list, index=0)
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



def cambios_decomisos():
    header()
    st.subheader("Reporte de cambios, resguardos y decomisos")

    df = get_inventory()
    if df.empty:
        st.info("No hay datafonos registrados.")
        return

    hoteles = cfg("Hoteles")
    departamentos = cfg("Departamentos")
    estatus_list = cfg("Estatus")

    with st.container(border=True):
        st.markdown("#### Filtros del reporte")
        c1, c2, c3, c4 = st.columns(4)
        f_hotel = c1.multiselect("Hotel", hoteles, key="rep_hotel")
        f_depto = c2.multiselect("Departamento", departamentos, key="rep_depto")
        f_estatus = c3.multiselect("Estatus", estatus_list, key="rep_estatus")
        busqueda = c4.text_input("Buscar terminal / afiliado / área", key="rep_buscar")

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

    st.markdown("### Terminales registradas")
    st.caption("Cada fila tiene su propio menú de tres puntos para editar el estatus o consultar la bitácora.")

    # Encabezado tipo reporte
    header_cols = st.columns([1.1, 1.2, 1.1, 1.1, 1.25, 1.2, 1.0, 1.0, 0.45])
    headers = ["Terminal", "Afiliado", "Hotel", "Área", "Departamento", "Responsable", "Estatus", "Fecha", "Acción"]
    for col, title in zip(header_cols, headers):
        col.markdown(f"**{title}**")

    st.divider()

    if "selected_terminal_action" not in st.session_state:
        st.session_state["selected_terminal_action"] = None
    if "selected_terminal_id" not in st.session_state:
        st.session_state["selected_terminal_id"] = None

    for _, row in filtered.iterrows():
        row_id = str(row["id"])
        terminal = str(row["numero_terminal"])

        cols = st.columns([1.1, 1.2, 1.1, 1.1, 1.25, 1.2, 1.0, 1.0, 0.45])

        cols[0].markdown(f"**{terminal}**")
        cols[1].write(row["numero_afiliado"])
        cols[2].write(row["hotel"])
        cols[3].write(row["area"])
        cols[4].write(row["departamento"])
        cols[5].write(row["responsable"])

        status = str(row["estatus"])
        if status == "Activo":
            cols[6].success(status)
        elif status == "Resguardo":
            cols[6].info(status)
        elif status in ["Decomisado", "Baja"]:
            cols[6].error(status)
        elif status == "En reparación":
            cols[6].warning(status)
        else:
            cols[6].write(status)

        cols[7].write(row["fecha_asignacion"])

        with cols[8].popover("⋮", use_container_width=True):
            st.markdown(f"**Terminal {terminal}**")
            if st.button("✏️ Editar estatus", key=f"edit_{row_id}", use_container_width=True):
                st.session_state["selected_terminal_action"] = "editar"
                st.session_state["selected_terminal_id"] = row_id
                st.rerun()
            if st.button("📋 Ver bitácora", key=f"hist_{row_id}", use_container_width=True):
                st.session_state["selected_terminal_action"] = "bitacora"
                st.session_state["selected_terminal_id"] = row_id
                st.rerun()

        st.divider()

    selected_id = st.session_state.get("selected_terminal_id")
    selected_action = st.session_state.get("selected_terminal_action")

    if not selected_id:
        st.info("Selecciona los tres puntos de una terminal para editar o ver su bitácora.")
        return

    selected_df = df[df["id"] == selected_id]
    if selected_df.empty:
        st.warning("La terminal seleccionada ya no existe o fue actualizada.")
        return

    row = selected_df.iloc[0]
    terminal_sel = str(row["numero_terminal"])

    if selected_action == "bitacora":
        st.markdown(f"### Bitácora de cambios — Terminal {terminal_sel}")
        hist = get_history()
        bitacora = hist[
            (hist["terminal_anterior"] == terminal_sel) |
            (hist["terminal_nueva"] == terminal_sel)
        ]
        if bitacora.empty:
            st.info("Esta terminal no tiene cambios registrados.")
        else:
            st.dataframe(bitacora.sort_index(ascending=False), use_container_width=True, hide_index=True)

    if selected_action == "editar":
        st.markdown(f"### Editar estatus / ubicación — Terminal {terminal_sel}")

        with st.container(border=True):
            st.markdown(
                f"""
                **Datos actuales:**  
                Terminal: **{row['numero_terminal']}** | Afiliado: **{row['numero_afiliado']}** | 
                Hotel: **{row['hotel']}** | Estatus: **{row['estatus']}**
                """
            )

            with st.form("form_editar_terminal"):
                c1, c2, c3 = st.columns(3)
                nuevo_hotel = c1.selectbox("Hotel", hoteles, index=hoteles.index(row["hotel"]) if row["hotel"] in hoteles else 0)
                nueva_area = c2.text_input("Área", value=row["area"])
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
                cancelar = b2.form_submit_button("Cancelar", use_container_width=True)

            if cancelar:
                st.session_state["selected_terminal_action"] = None
                st.session_state["selected_terminal_id"] = None
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
                st.session_state["selected_terminal_action"] = "bitacora"
                st.rerun()


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

    roles = cfg("Roles")
    activo_opts = cfg("Activo")

    users = get_users()
    st.dataframe(users.drop(columns=["clave"], errors="ignore"), use_container_width=True, hide_index=True)

    with st.form("form_user", clear_on_submit=True):
        st.markdown("### Crear usuario")
        c1, c2, c3, c4 = st.columns(4)
        usuario = c1.text_input("Usuario")
        clave = c2.text_input("Contraseña", type="password")
        rol = c3.selectbox("Rol", roles)
        activo = c4.selectbox("Activo", activo_opts)
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
        cambios_decomisos()
    elif selected == "Historial de Cambios":
        historial()
    elif selected == "Usuarios":
        administrar_usuarios()


if __name__ == "__main__":
    main()
