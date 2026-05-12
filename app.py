
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
    "Hoteles": ["5918-MCB", "5917-MPCB", "5910-PPRL", "5911-ZEL", "5930-PGC"],
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
            if not header:
                continue
            items = []
            for row in values[1:]:
                if col_idx < len(row):
                    value = str(row[col_idx]).strip()
                    if value:
                        items.append(value)
            config[header.strip()] = items
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

    with st.expander("Filtros del reporte", expanded=True):
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

    st.caption("Edita directamente el reporte y luego presiona **Actualizar reporte**. Los cambios quedan guardados en Google Sheets y se registra el historial.")

    editor_columns = [
        "id", "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
        "responsable", "estatus", "fecha_asignacion", "fecha_cambio", "sustituido_por", "observacion"
    ]

    edited = st.data_editor(
        filtered[editor_columns],
        use_container_width=True,
        hide_index=True,
        num_rows="fixed",
        disabled=["id", "numero_terminal", "numero_afiliado", "fecha_asignacion"],
        column_config={
            "id": st.column_config.TextColumn("ID"),
            "numero_terminal": st.column_config.TextColumn("Terminal"),
            "numero_afiliado": st.column_config.TextColumn("Afiliado"),
            "hotel": st.column_config.SelectboxColumn("Hotel", options=hoteles),
            "area": st.column_config.TextColumn("Área"),
            "departamento": st.column_config.SelectboxColumn("Departamento", options=departamentos),
            "responsable": st.column_config.TextColumn("Responsable"),
            "estatus": st.column_config.SelectboxColumn("Estatus", options=estatus_list),
            "fecha_asignacion": st.column_config.TextColumn("Fecha asignación"),
            "fecha_cambio": st.column_config.TextColumn("Fecha cambio"),
            "sustituido_por": st.column_config.TextColumn("Sustituido por"),
            "observacion": st.column_config.TextColumn("Observación")
        },
        key="editor_cambios"
    )

    col_btn1, col_btn2 = st.columns([1, 3])
    actualizar = col_btn1.button("Actualizar reporte", type="primary", use_container_width=True)
    recargar = col_btn2.button("Recargar datos", use_container_width=True)

    if recargar:
        st.rerun()

    if actualizar:
        original = get_inventory()
        updated = original.copy()
        cambios = 0

        for _, edited_row in edited.iterrows():
            row_id = str(edited_row["id"])
            match = updated[updated["id"] == row_id]
            if match.empty:
                continue

            idx = match.index[0]
            old_row = updated.loc[idx].copy()

            fields_to_check = ["hotel", "area", "departamento", "responsable", "estatus", "fecha_cambio", "sustituido_por", "observacion"]
            changed_fields = []

            for field in fields_to_check:
                new_value = str(edited_row.get(field, "")).strip()
                old_value = str(old_row.get(field, "")).strip()
                if new_value != old_value:
                    updated.loc[idx, field] = new_value
                    changed_fields.append(field)

            if changed_fields:
                updated.loc[idx, "actualizado_el"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                motivo = "Actualización desde reporte: " + ", ".join(changed_fields)
                add_history(
                    terminal_anterior=str(old_row["numero_terminal"]),
                    terminal_nueva=str(edited_row.get("sustituido_por", "")),
                    hotel=str(edited_row.get("hotel", "")),
                    area=str(edited_row.get("area", "")),
                    departamento=str(edited_row.get("departamento", "")),
                    estatus_anterior=str(old_row.get("estatus", "")),
                    estatus_nuevo=str(edited_row.get("estatus", "")),
                    motivo=motivo,
                    responsable=str(edited_row.get("responsable", "")),
                    observacion=str(edited_row.get("observacion", ""))
                )
                cambios += 1

        if cambios > 0:
            save_inventory(updated)
            st.success(f"Reporte actualizado correctamente. Filas modificadas: {cambios}")
            st.rerun()
        else:
            st.info("No se detectaron cambios para actualizar.")


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
