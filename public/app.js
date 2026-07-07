const INVENTORY_COLUMNS = [
  ["numero_terminal", "Terminal"],
  ["numero_afiliado", "Afiliado"],
  ["hotel", "Hotel"],
  ["area", "Área"],
  ["departamento", "Departamento"],
  ["responsable", "Responsable"],
  ["estatus", "Estatus"],
  ["fecha_asignacion", "Fecha asignación"],
  ["fecha_cambio", "Fecha cambio"],
  ["sustituido_por", "Sustituido por"],
  ["observacion", "Observación"]
];

const HISTORY_COLUMNS = [
  ["fecha", "Fecha"],
  ["terminal_anterior", "Terminal anterior"],
  ["terminal_nueva", "Terminal nueva"],
  ["hotel", "Hotel"],
  ["area", "Área"],
  ["departamento", "Departamento"],
  ["estatus_anterior", "Estatus anterior"],
  ["estatus_nuevo", "Estatus nuevo"],
  ["motivo", "Motivo"],
  ["responsable", "Responsable"],
  ["observacion", "Observación"]
];

const STATUS_CLASS = {
  "Activo": "status-activo",
  "Resguardo": "status-resguardo",
  "En reparación": "status-reparacion",
  "Sustituido": "status-sustituido",
  "Decomisado": "status-decomisado",
  "Baja": "status-baja"
};

const STATUS_PILL = {
  "Activo": "pill-activo",
  "Resguardo": "pill-resguardo",
  "En reparación": "pill-reparacion",
  "Sustituido": "pill-sustituido",
  "Decomisado": "pill-decomisado",
  "Baja": "pill-baja"
};

const LABELS = Object.fromEntries([...INVENTORY_COLUMNS, ...HISTORY_COLUMNS]);

const state = {
  session: null,
  config: {},
  inventory: [],
  history: [],
  users: [],
  view: "dashboard",
  inventoryFilters: {},
  inventorySort: null,
  historySearch: "",
  actionMenu: null,
  filterMenu: null,
  filterSearch: "",
  modal: null,
  toast: null,
  loading: false
};

const app = document.getElementById("app");

init();

async function init() {
  bindEvents();
  await checkSession();
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.actionMenu = null;
      state.filterMenu = null;
      if (state.modal) state.modal = null;
      render();
    }
  });
}

async function checkSession() {
  try {
    const { session } = await api("/api/session");
    state.session = session;
    if (session) {
      await loadBootstrap();
    } else {
      render();
    }
  } catch (error) {
    showToast(error.message, "error");
    render();
  }
}

async function loadBootstrap() {
  state.loading = true;
  render();
  try {
    const data = await api("/api/bootstrap");
    state.session = data.session;
    state.config = data.config || {};
    state.inventory = data.inventory || [];
    state.history = data.history || [];
    state.users = data.users || [];
  } catch (error) {
    if (error.status === 401) state.session = null;
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No fue posible completar la operación.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function render() {
  if (!state.session) {
    app.innerHTML = renderLogin();
    renderToast();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        <section class="title-card"><h1>Control de Datafonos</h1></section>
        ${state.loading ? `<div class="panel">Cargando datos...</div>` : renderView()}
      </main>
    </div>
    ${state.actionMenu ? renderActionMenu() : ""}
    ${state.filterMenu ? renderFilterMenu() : ""}
    ${state.modal ? renderModal() : ""}
  `;
  renderToast();
}

function renderLogin() {
  return `
    <main class="login-shell">
      <form class="login-card" data-form="login">
        <h1>Iniciar sesión</h1>
        <p>Ingresa tus credenciales para continuar.</p>
        <div class="field">
          <label>Usuario</label>
          <input name="usuario" autocomplete="username" required />
        </div>
        <div class="field" style="margin-top:14px">
          <label>Contraseña</label>
          <input name="clave" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Entrar</button>
      </form>
    </main>
  `;
}

function renderSidebar() {
  const menu = [
    ["dashboard", "Dashboard"],
    ["inventory", "Inventario Maestro"],
    ["history", "Historial de Cambios"]
  ];
  if (state.session.rol === "Administrador") menu.push(["users", "Usuarios"]);

  return `
    <aside class="sidebar">
      <div class="sidebar-title">💳 Control Datafonos</div>
      <div class="user-card">
        <div><strong>Usuario:</strong> ${escapeHtml(state.session.usuario)}</div>
        <div><strong>Rol:</strong> ${escapeHtml(state.session.rol)}</div>
      </div>
      <nav class="nav">
        ${menu.map(([view, label]) => `
          <button class="${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">
            <span>${state.view === view ? "●" : "○"}</span>${label}
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-actions">
        <div class="sidebar-footer">Base de datos conectada:<br><strong>Google Sheets</strong></div>
        <button class="btn" data-action="refresh">Refrescar datos</button>
        <button class="btn" data-action="logout">Cerrar sesión</button>
      </div>
    </aside>
  `;
}

function renderView() {
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "inventory") return renderInventory();
  if (state.view === "history") return renderHistory();
  if (state.view === "users") return renderUsers();
  return renderDashboard();
}

function renderDashboard() {
  const inventory = state.inventory;
  const metrics = {
    total: inventory.length,
    activos: countByStatus("Activo"),
    resguardo: countByStatus("Resguardo"),
    reparacion: countByStatus("En reparación"),
    decomisadosBaja: countByStatus("Decomisado") + countByStatus("Baja"),
    cambiosMes: state.history.filter((item) => String(item.fecha || "").startsWith(todayIso().slice(0, 7))).length
  };
  const hotelCounts = countBy(inventory, "hotel");
  const statusCounts = countBy(inventory, "estatus");

  return `
    <div class="section-head"><h2>Dashboard</h2></div>
    <section class="metrics">
      ${metric("Total", metrics.total)}
      ${metric("Activos", metrics.activos)}
      ${metric("Resguardo", metrics.resguardo)}
      ${metric("En reparación", metrics.reparacion)}
      ${metric("Decomisados/Baja", metrics.decomisadosBaja)}
      ${metric("Cambios del mes", metrics.cambiosMes)}
    </section>
    <div class="grid-2" style="margin-top:16px">
      <div class="panel">
        <h3>Distribución por hotel</h3>
        ${renderBars(hotelCounts)}
      </div>
      <div class="panel">
        <h3>Distribución por estatus</h3>
        ${renderBars(statusCounts)}
      </div>
    </div>
  `;
}

function renderInventory() {
  const rows = getFilteredInventory();
  return `
    <div class="section-head">
      <h2>Inventario maestro</h2>
      <button class="btn primary" data-action="open-modal" data-modal="register">Registrar nuevo datafono</button>
    </div>
    <div class="section-head">
      <h3>Datafonos registrados</h3>
    </div>
    ${renderInventoryTable(rows)}
    <div class="table-actions">
      <button class="btn primary" data-action="open-modal" data-modal="resguardo" ${rows.length ? "" : "disabled"}>Generar resguardo PDF</button>
      <button class="btn" data-action="export-excel" ${rows.length ? "" : "disabled"}>Descargar inventario Excel</button>
    </div>
  `;
}

function renderInventoryTable(rows) {
  return `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th class="actions-head"></th>
            ${INVENTORY_COLUMNS.map(([key, label]) => `
              <th>
                <div class="th-content">
                  <span>${label}</span>
                  <button class="filter-btn ${isFilterActive(key) ? "active" : ""}" data-action="open-filter" data-column="${key}" title="Filtrar" aria-label="Filtrar ${escapeAttr(label)}">
                    <span class="filter-icon" aria-hidden="true"></span>
                  </button>
                </div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(renderInventoryRow).join("") : `<tr><td colspan="${INVENTORY_COLUMNS.length + 1}" class="empty">No hay datafonos para mostrar.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderInventoryRow(row) {
  const statusClass = STATUS_CLASS[row.estatus] || "";
  return `
    <tr class="${statusClass}">
      <td class="actions-cell">
        <button class="btn icon kebab-btn" data-action="row-menu" data-id="${escapeAttr(row.id)}" title="Acciones" aria-label="Acciones de terminal ${escapeAttr(row.numero_terminal)}">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </td>
      ${INVENTORY_COLUMNS.map(([key]) => `<td>${key === "estatus" ? statusPill(row[key]) : escapeHtml(row[key])}</td>`).join("")}
    </tr>
  `;
}

function renderActionMenu() {
  const { x, y, id } = state.actionMenu;
  return `
    <div class="action-menu" style="left:${x}px;top:${y}px">
      <button data-action="row-action" data-row-action="status" data-id="${escapeAttr(id)}">Editar estatus</button>
      <button data-action="row-action" data-row-action="data" data-id="${escapeAttr(id)}">Editar datos</button>
      <button data-action="row-action" data-row-action="history" data-id="${escapeAttr(id)}">Ver bitácora</button>
    </div>
  `;
}

function renderFilterMenu() {
  const { column, x, y } = state.filterMenu;
  const values = uniqueValues(state.inventory, column)
    .filter((value) => value.toLowerCase().includes(state.filterSearch.toLowerCase()));
  const selected = state.inventoryFilters[column] || [];
  const allSelected = !selected.length;

  return `
    <div class="filter-menu" style="left:${x}px;top:${y}px">
      <button data-action="sort-filter" data-column="${column}" data-dir="asc">Ordenar de A a Z</button>
      <button data-action="sort-filter" data-column="${column}" data-dir="desc">Ordenar de Z a A</button>
      <button data-action="clear-filter" data-column="${column}">Borrar filtro</button>
      <input type="search" data-action="filter-search" placeholder="Buscar" value="${escapeAttr(state.filterSearch)}" />
      <label class="check-row">
        <input type="checkbox" data-action="toggle-filter-all" data-column="${column}" ${allSelected ? "checked" : ""} />
        <span>(Seleccionar todo)</span>
      </label>
      <div class="filter-list">
        ${values.map((value) => `
          <label class="check-row">
            <input type="checkbox" data-action="toggle-filter-value" data-column="${column}" value="${escapeAttr(value)}" ${allSelected || selected.includes(value) ? "checked" : ""} />
            <span>${escapeHtml(value || "(vacío)")}</span>
          </label>
        `).join("")}
      </div>
      <div class="filter-actions">
        <button class="btn primary" data-action="close-popups">Aceptar</button>
        <button class="btn" data-action="close-popups">Cancelar</button>
      </div>
    </div>
  `;
}

function renderHistory() {
  const rows = getFilteredHistory();
  return `
    <div class="section-head">
      <h2>Historial de cambios</h2>
      <div class="toolbar">
        <input class="btn" data-action="history-search" placeholder="Buscar" value="${escapeAttr(state.historySearch)}" />
        <button class="btn" data-action="export-history" ${rows.length ? "" : "disabled"}>Descargar historial Excel</button>
      </div>
    </div>
    <div class="table-shell">
      <table class="data-table">
        <thead><tr>${HISTORY_COLUMNS.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((row) => `<tr>${HISTORY_COLUMNS.map(([key]) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty" colspan="${HISTORY_COLUMNS.length}">No hay movimientos para mostrar.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsers() {
  if (state.session.rol !== "Administrador") return `<div class="panel">No tienes permiso para ver usuarios.</div>`;
  return `
    <div class="section-head">
      <h2>Usuarios</h2>
      <button class="btn primary" data-action="open-modal" data-modal="user-create">Nuevo usuario</button>
    </div>
    <div class="table-shell">
      <table class="data-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead>
        <tbody>
          ${state.users.map((user) => `
            <tr>
              <td>${escapeHtml(user.usuario)}</td>
              <td>${escapeHtml(user.rol)}</td>
              <td>${escapeHtml(user.activo)}</td>
              <td>
                <button class="btn" data-action="open-modal" data-modal="user-edit" data-id="${escapeAttr(user.usuario)}">Editar</button>
                <button class="btn" data-action="open-modal" data-modal="user-password" data-id="${escapeAttr(user.usuario)}">Clave</button>
                <button class="btn" data-action="toggle-user-status" data-id="${escapeAttr(user.usuario)}">${user.activo === "Sí" ? "Desactivar" : "Activar"}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderModal() {
  const modal = state.modal;
  if (modal.type === "register") return modalShell("Registrar datafono", renderRegisterForm());
  if (modal.type === "status") return modalShell("Editar datafono", renderStatusForm(modal.row), "wide");
  if (modal.type === "data") return modalShell("Editar datos del datafono", renderDataForm(modal.row), "wide");
  if (modal.type === "history") return modalShell("Bitácora de cambios", renderBitacora(modal.row), "wide");
  if (modal.type === "resguardo") return modalShell("Generar resguardo PDF", renderResguardoForm(), "wide");
  if (modal.type === "user-create") return modalShell("Nuevo usuario", renderUserCreateForm());
  if (modal.type === "user-edit") return modalShell("Editar usuario", renderUserEditForm(modal.user));
  if (modal.type === "user-password") return modalShell("Cambiar contraseña", renderUserPasswordForm(modal.user));
  return "";
}

function modalShell(title, body, extraClass = "") {
  return `
    <div class="modal-backdrop">
      <section class="modal ${extraClass}">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="close-btn" data-action="close-modal">×</button>
        </div>
        ${body}
      </section>
    </div>
  `;
}

function renderRegisterForm() {
  return `
    <form data-form="register">
      <div class="grid-3">
        ${field("numero_terminal", "Número Terminal *")}
        ${field("numero_afiliado", "Número Afiliado *")}
        ${selectField("hotel", "Hotel *", state.config.Hoteles)}
        ${selectField("area", "Área *", state.config.Areas)}
        ${selectField("departamento", "Departamento *", state.config.Departamentos)}
        ${field("responsable", "Responsable")}
        ${selectField("estatus", "Estatus *", state.config.Estatus)}
        ${field("fecha_asignacion", "Fecha asignación", todayIso(), "date")}
      </div>
      ${textareaField("observacion", "Observación")}
      ${modalButtons("Guardar datafono")}
    </form>
  `;
}

function renderStatusForm(row) {
  return `
    <form data-form="status" data-id="${escapeAttr(row.id)}">
      <p><strong>Terminal:</strong> ${escapeHtml(row.numero_terminal)} | <strong>Afiliado:</strong> ${escapeHtml(row.numero_afiliado)} | <strong>Hotel:</strong> ${escapeHtml(row.hotel)} | <strong>Estatus:</strong> ${escapeHtml(row.estatus)}</p>
      <div class="grid-3">
        ${selectField("estatus", "Estatus", state.config.Estatus, row.estatus)}
        ${field("fecha_cambio", "Fecha cambio", todayIso(), "date")}
        ${field("sustituido_por", "Sustituido por", row.sustituido_por)}
      </div>
      ${field("motivo", "Motivo", "Actualización de estatus")}
      ${textareaField("observacion", "Observación", row.observacion)}
      ${modalButtons("Guardar estatus")}
    </form>
  `;
}

function renderDataForm(row) {
  return `
    <form data-form="data" data-id="${escapeAttr(row.id)}">
      <div class="grid-3">
        ${field("numero_terminal", "Número Terminal *", row.numero_terminal)}
        ${field("numero_afiliado", "Número Afiliado *", row.numero_afiliado)}
        ${selectField("hotel", "Hotel *", state.config.Hoteles, row.hotel)}
        ${selectField("area", "Área *", state.config.Areas, row.area)}
        ${selectField("departamento", "Departamento *", state.config.Departamentos, row.departamento)}
        ${field("responsable", "Responsable", row.responsable)}
        ${field("fecha_asignacion", "Fecha asignación", row.fecha_asignacion || todayIso(), "date")}
      </div>
      ${textareaField("observacion", "Observación", row.observacion)}
      ${modalButtons("Guardar datos")}
    </form>
  `;
}

function renderBitacora(row) {
  const terminal = row.numero_terminal;
  const items = state.history
    .filter((item) => item.terminal_anterior === terminal || item.terminal_nueva === terminal)
    .slice()
    .reverse();
  return `
    <p><strong>Terminal:</strong> ${escapeHtml(terminal)}</p>
    <div class="table-shell" style="max-height:360px">
      <table class="data-table">
        <thead><tr>${HISTORY_COLUMNS.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead>
        <tbody>
          ${items.length ? items.map((item) => `<tr>${HISTORY_COLUMNS.map(([key]) => `<td>${escapeHtml(item[key])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${HISTORY_COLUMNS.length}" class="empty">Esta terminal no tiene cambios registrados.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderResguardoForm() {
  const rows = getFilteredInventory();
  const responsables = uniqueValues(rows, "responsable").filter(Boolean);
  const responsableDefault = responsables.length === 1 ? responsables[0] : "";
  return `
    <form data-form="resguardo">
      <p class="muted">Se generará con los ${rows.length} datafonos filtrados/visibles. Fecha: ${formatDate(todayIso())}.</p>
      <div class="grid-2">
        ${selectField("tipo_documento", "Documento", ["Cédula", "Pasaporte"], "Cédula")}
        ${field("numero_documento", "Cédula o pasaporte")}
        ${field("nombre_responsable", "Nombre del responsable", responsableDefault)}
        ${field("puesto_responsable", "Puesto del responsable")}
      </div>
      ${textareaField("observacion_resguardo", "Observación del resguardo")}
      ${modalButtons("Generar PDF")}
    </form>
  `;
}

function renderUserCreateForm() {
  return `
    <form data-form="user-create">
      ${field("usuario", "Usuario")}
      ${field("clave", "Contraseña", "", "password")}
      ${selectField("rol", "Rol", state.config.Roles, "Usuario")}
      ${selectField("activo", "Activo", state.config.Activo, "Sí")}
      ${modalButtons("Crear usuario")}
    </form>
  `;
}

function renderUserEditForm(user) {
  return `
    <form data-form="user-edit" data-id="${escapeAttr(user.usuario)}">
      ${field("usuario", "Usuario", user.usuario)}
      ${selectField("rol", "Rol", state.config.Roles, user.rol)}
      ${selectField("activo", "Activo", state.config.Activo, user.activo)}
      ${modalButtons("Guardar usuario")}
    </form>
  `;
}

function renderUserPasswordForm(user) {
  return `
    <form data-form="user-password" data-id="${escapeAttr(user.usuario)}">
      <p>Cambiar contraseña de <strong>${escapeHtml(user.usuario)}</strong>.</p>
      ${field("clave", "Nueva contraseña", "", "password")}
      ${modalButtons("Guardar contraseña")}
    </form>
  `;
}

function field(name, label, value = "", type = "text") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${escapeAttr(value)}" /></div>`;
}

function selectField(name, label, options = [], value = "") {
  return `
    <div class="field">
      <label>${label}</label>
      <select name="${name}">
        <option value="">Seleccione</option>
        ${(options || []).map((option) => `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </div>
  `;
}

function textareaField(name, label, value = "") {
  return `<div class="field" style="margin-top:14px"><label>${label}</label><textarea name="${name}">${escapeHtml(value)}</textarea></div>`;
}

function modalButtons(primaryText) {
  return `
    <div class="grid-2" style="margin-top:16px">
      <button class="btn primary" type="submit">${primaryText}</button>
      <button class="btn" type="button" data-action="close-modal">Cerrar</button>
    </div>
  `;
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    const hadPopup = Boolean(state.actionMenu || state.filterMenu);
    state.actionMenu = null;
    state.filterMenu = null;
    if (hadPopup) render();
    return;
  }

  const action = button.dataset.action;
  if (action === "nav") {
    state.view = button.dataset.view;
    state.actionMenu = null;
    state.filterMenu = null;
    render();
  } else if (action === "refresh") {
    await loadBootstrap();
  } else if (action === "logout") {
    await api("/api/logout", { method: "POST" });
    state.session = null;
    render();
  } else if (action === "open-modal") {
    openModal(button.dataset.modal, button.dataset.id);
  } else if (action === "close-modal") {
    state.modal = null;
    render();
  } else if (action === "row-menu") {
    const rect = button.getBoundingClientRect();
    state.actionMenu = {
      id: button.dataset.id,
      x: Math.min(rect.left, window.innerWidth - 190),
      y: Math.min(rect.bottom + 4, window.innerHeight - 130)
    };
    state.filterMenu = null;
    render();
  } else if (action === "row-action") {
    const row = state.inventory.find((item) => item.id === button.dataset.id);
    state.actionMenu = null;
    if (button.dataset.rowAction === "status") state.modal = { type: "status", row };
    if (button.dataset.rowAction === "data") state.modal = { type: "data", row };
    if (button.dataset.rowAction === "history") state.modal = { type: "history", row };
    render();
  } else if (action === "open-filter") {
    const rect = button.getBoundingClientRect();
    state.filterMenu = {
      column: button.dataset.column,
      x: Math.min(rect.left, window.innerWidth - 285),
      y: Math.min(rect.bottom + 4, window.innerHeight - 360)
    };
    state.filterSearch = "";
    state.actionMenu = null;
    render();
  } else if (action === "sort-filter") {
    state.inventorySort = { column: button.dataset.column, dir: button.dataset.dir };
    render();
  } else if (action === "clear-filter") {
    delete state.inventoryFilters[button.dataset.column];
    if (state.inventorySort?.column === button.dataset.column) state.inventorySort = null;
    render();
  } else if (action === "close-popups") {
    state.actionMenu = null;
    state.filterMenu = null;
    render();
  } else if (action === "export-excel") {
    exportExcel("inventario_datafonos", getFilteredInventory(), INVENTORY_COLUMNS);
  } else if (action === "export-history") {
    exportExcel("historial_datafonos", getFilteredHistory(), HISTORY_COLUMNS);
  } else if (action === "toggle-user-status") {
    await submitApi(`/api/users/${encodeURIComponent(button.dataset.id)}/status`, { method: "PUT" }, "Estado actualizado.");
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;

  try {
    if (type === "login") {
      const response = await api("/api/login", { method: "POST", body: JSON.stringify(data) });
      state.session = response.session;
      await loadBootstrap();
      return;
    }
    if (type === "register") {
      await submitApi("/api/inventory", { method: "POST", body: JSON.stringify(data) }, "Datafono registrado.");
    } else if (type === "status") {
      await submitApi(`/api/inventory/${encodeURIComponent(form.dataset.id)}/status`, { method: "PUT", body: JSON.stringify(data) }, "Estatus actualizado.");
    } else if (type === "data") {
      await submitApi(`/api/inventory/${encodeURIComponent(form.dataset.id)}`, { method: "PUT", body: JSON.stringify(data) }, "Datos actualizados.");
    } else if (type === "resguardo") {
      generateResguardoPdf(data, getFilteredInventory());
      state.modal = null;
      render();
      showToast("PDF generado.", "success");
    } else if (type === "user-create") {
      await submitApi("/api/users", { method: "POST", body: JSON.stringify(data) }, "Usuario creado.");
    } else if (type === "user-edit") {
      await submitApi(`/api/users/${encodeURIComponent(form.dataset.id)}`, { method: "PUT", body: JSON.stringify(data) }, "Usuario actualizado.");
    } else if (type === "user-password") {
      await submitApi(`/api/users/${encodeURIComponent(form.dataset.id)}/password`, { method: "PUT", body: JSON.stringify(data) }, "Contraseña actualizada.");
    }
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function submitApi(path, options, message) {
  await api(path, options);
  state.modal = null;
  await loadBootstrap();
  showToast(message, "success");
}

function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (action === "toggle-filter-all") {
    if (target.checked) delete state.inventoryFilters[target.dataset.column];
    else state.inventoryFilters[target.dataset.column] = [];
    render();
  } else if (action === "toggle-filter-value") {
    const column = target.dataset.column;
    const selected = new Set(state.inventoryFilters[column] || []);
    if (!state.inventoryFilters[column]) {
      uniqueValues(state.inventory, column).forEach((value) => selected.add(value));
    }
    if (target.checked) selected.add(target.value);
    else selected.delete(target.value);
    const all = uniqueValues(state.inventory, column);
    if (selected.size === all.length) delete state.inventoryFilters[column];
    else state.inventoryFilters[column] = Array.from(selected);
    render();
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === "filter-search") {
    state.filterSearch = target.value;
    render();
  } else if (target.dataset.action === "history-search") {
    state.historySearch = target.value;
    render();
  }
}

function openModal(type, id) {
  if (type === "register" || type === "resguardo" || type === "user-create") {
    state.modal = { type };
  } else if (type === "user-edit" || type === "user-password") {
    const user = state.users.find((item) => item.usuario === id);
    state.modal = user ? { type, user } : null;
  }
  state.actionMenu = null;
  state.filterMenu = null;
  render();
}

function getFilteredInventory() {
  let rows = [...state.inventory];
  for (const [column, selected] of Object.entries(state.inventoryFilters)) {
    if (selected.length) rows = rows.filter((row) => selected.includes(String(row[column] || "")));
  }
  if (state.inventorySort) {
    const { column, dir } = state.inventorySort;
    rows.sort((a, b) => String(a[column] || "").localeCompare(String(b[column] || ""), "es", { numeric: true }) * (dir === "desc" ? -1 : 1));
  }
  return rows;
}

function getFilteredHistory() {
  const term = state.historySearch.trim().toLowerCase();
  let rows = [...state.history].reverse();
  if (term) {
    rows = rows.filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(term)));
  }
  return rows;
}

function isFilterActive(column) {
  return Boolean((state.inventoryFilters[column] || []).length) || state.inventorySort?.column === column;
}

function uniqueValues(rows, column) {
  return Array.from(new Set(rows.map((row) => String(row[column] || "").trim()))).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function countByStatus(status) {
  return state.inventory.filter((row) => row.estatus === status).length;
}

function countBy(rows, key) {
  const counts = {};
  rows.forEach((row) => {
    const value = row[key] || "Sin valor";
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function renderBars(items) {
  if (!items.length) return `<p class="muted">Sin datos.</p>`;
  const max = Math.max(...items.map(([, value]) => value));
  return `<div class="chart-list">${items.slice(0, 10).map(([label, value]) => `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar"><span style="width:${Math.max(4, (value / max) * 100)}%"></span></div>
      <strong>${value}</strong>
    </div>
  `).join("")}</div>`;
}

function statusPill(status) {
  const clean = String(status || "").trim();
  return `<span class="status-pill ${STATUS_PILL[clean] || "pill-default"}">${escapeHtml(clean)}</span>`;
}

function showToast(message, type = "success") {
  state.toast = { message, type };
  renderToast();
  setTimeout(() => {
    state.toast = null;
    renderToast();
  }, 3200);
}

function renderToast() {
  document.querySelector(".toast")?.remove();
  if (!state.toast) return;
  const toast = document.createElement("div");
  toast.className = `toast ${state.toast.type}`;
  toast.textContent = state.toast.message;
  document.body.appendChild(toast);
}

function exportExcel(name, rows, columns) {
  const html = `
    <html><head><meta charset="utf-8"></head><body>
      <table>
        <thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </body></html>
  `;
  downloadBlob(`${name}_${todayIso()}.xls`, new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

function generateResguardoPdf(form, rows) {
  if (!rows.length) {
    showToast("No hay datafonos filtrados para generar el resguardo.", "error");
    return;
  }
  const pdf = new SimplePdf();
  const title = "CARTA DE RESGUARDO DE DATAFONOS";
  const dateText = formatDate(todayIso());
  const startPage = () => {
    pdf.addPage();
    pdf.text(title, 396, 558, 14, "bold", "center");
    pdf.text(`Santo Domingo, ${dateText}`, 720, 528, 9, "normal", "right");
    pdf.wrapText("Por medio de la presente se deja constancia de la entrega en calidad de resguardo de los datafonos detallados en este documento. La persona responsable declara recibir los equipos para uso operativo, comprometiéndose a custodiarlos, utilizarlos de forma adecuada y reportar oportunamente cualquier cambio, pérdida, daño o devolución.", 50, 500, 690, 9, 12);
  };
  startPage();
  let y = 440;
  pdf.text(`Cantidad de datafonos incluidos: ${rows.length}`, 50, y, 10, "bold");
  y -= 24;
  pdf.text(`Documento: ${form.tipo_documento} ${form.numero_documento}`, 50, y, 9);
  pdf.text(`Responsable: ${form.nombre_responsable}`, 330, y, 9);
  y -= 16;
  pdf.text(`Puesto: ${form.puesto_responsable}`, 50, y, 9);
  if (form.observacion_resguardo) pdf.wrapText(`Observación: ${form.observacion_resguardo}`, 330, y, 390, 9, 11);
  y -= 30;
  const headers = ["Terminal", "Afiliado", "Hotel", "Área", "Depto.", "Estatus", "Fecha"];
  const widths = [78, 100, 82, 82, 108, 84, 88];
  const rowHeight = 18;
  const drawHeader = () => {
    let x = 50;
    headers.forEach((header, index) => {
      pdf.rect(x, y - 4, widths[index], rowHeight, true);
      pdf.text(header, x + 4, y + 2, 7, "bold");
      x += widths[index];
    });
    y -= rowHeight;
  };
  drawHeader();
  rows.forEach((row) => {
    if (y < 92) {
      startPage();
      y = 430;
      drawHeader();
    }
    let x = 50;
    const values = [row.numero_terminal, row.numero_afiliado, row.hotel, row.area, row.departamento, row.estatus, row.fecha_asignacion];
    values.forEach((value, index) => {
      pdf.strokeRect(x, y - 4, widths[index], rowHeight);
      pdf.text(truncate(value, index === 4 ? 18 : 14), x + 4, y + 2, 7);
      x += widths[index];
    });
    y -= rowHeight;
  });
  if (y < 120) {
    pdf.addPage();
    y = 470;
  }
  y -= 28;
  pdf.text("Firmas", 396, y, 13, "bold", "center");
  y -= 48;
  pdf.text("______________________________", 185, y, 10, "normal", "center");
  pdf.text("______________________________", 396, y, 10, "normal", "center");
  pdf.text("______________________________", 607, y, 10, "normal", "center");
  y -= 14;
  pdf.text("Responsable", 185, y, 9, "normal", "center");
  pdf.text("Entregado por", 396, y, 9, "normal", "center");
  pdf.text("Auditoría / Administración", 607, y, 9, "normal", "center");
  y -= 13;
  pdf.text(form.nombre_responsable || "Nombre y firma", 185, y, 8, "normal", "center");
  pdf.text("Nombre y firma", 396, y, 8, "normal", "center");
  pdf.text("Nombre y firma", 607, y, 8, "normal", "center");
  downloadBlob(`resguardo_datafonos_filtrados_${todayIso()}.pdf`, pdf.blob());
}

class SimplePdf {
  constructor() {
    this.pages = [];
    this.current = null;
  }
  addPage() {
    this.current = [];
    this.pages.push(this.current);
  }
  fontName(weight) {
    return weight === "bold" ? "F2" : "F1";
  }
  text(value, x, y, size = 10, weight = "normal", align = "left") {
    const safe = String(value ?? "");
    const approxWidth = safe.length * size * 0.45;
    const drawX = align === "center" ? x - approxWidth / 2 : align === "right" ? x - approxWidth : x;
    this.current.push(`BT /${this.fontName(weight)} ${size} Tf 1 0 0 1 ${round(drawX)} ${round(y)} Tm <${utf16Hex(safe)}> Tj ET`);
  }
  wrapText(value, x, y, width, size = 10, leading = 12) {
    const words = String(value || "").split(/\s+/);
    let line = "";
    const maxChars = Math.max(20, Math.floor(width / (size * 0.48)));
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars) {
        this.text(line, x, y, size);
        y -= leading;
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) this.text(line, x, y, size);
  }
  rect(x, y, w, h, fill = false) {
    this.current.push(`0.07 0.09 0.16 rg ${round(x)} ${round(y)} ${round(w)} ${round(h)} re ${fill ? "f" : "S"}`);
    if (fill) this.current.push("0 0 0 rg");
  }
  strokeRect(x, y, w, h) {
    this.current.push(`0.8 0.84 0.9 RG ${round(x)} ${round(y)} ${round(w)} ${round(h)} re S 0 0 0 RG`);
  }
  blob() {
    const objects = [];
    const add = (content) => {
      objects.push(content);
      return objects.length;
    };
    const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesPlaceholderId = add("");
    const font1Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const font2Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds = [];
    this.pages.forEach((commands) => {
      const stream = commands.join("\n");
      const contentId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent ${pagesPlaceholderId} 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    });
    objects[pagesPlaceholderId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((content, index) => {
      offsets.push(new TextEncoder().encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
    });
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }
}

function utf16Hex(value) {
  const bytes = [0xfe, 0xff];
  for (const char of String(value || "")) {
    const code = char.charCodeAt(0);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function round(value) {
  return Number(value).toFixed(2);
}
