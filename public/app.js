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

const INVENTORY_TABLE_COLUMNS = INVENTORY_COLUMNS.filter(([key]) => key !== "observacion");
const DATE_FILTER_COLUMNS = new Set(["fecha_asignacion", "fecha_cambio"]);
const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
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
        <section class="title-card"><h1>${creditCardIcon()}Control de Datafonos</h1></section>
        ${state.loading ? `<div class="panel">Cargando datos...</div>` : renderView()}
      </main>
    </div>
    ${state.actionMenu ? renderActionMenu() : ""}
    ${state.filterMenu ? renderFilterMenu() : ""}
    ${state.modal ? renderModal() : ""}
  `;
  syncFilterMenuControls();
  renderToast();
}

function renderLogin() {
  return `
    <main class="login-shell">
      <form class="login-card" data-form="login">
        <h1>${creditCardIcon()}Iniciar sesión</h1>
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
      <div class="sidebar-title">${creditCardIcon()}Control Datafonos</div>
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
  const currentMonth = todayIso().slice(0, 7);
  const metrics = {
    total: inventory.length,
    activos: countByStatus("Activo"),
    resguardo: countByStatus("Resguardo"),
    reparacion: countByStatus("En reparación"),
    sustituidos: countByStatus("Sustituido"),
    decomisadosBaja: countByStatus("Decomisado") + countByStatus("Baja"),
    cambiosMes: state.history.filter((item) => String(item.fecha || "").startsWith(currentMonth)).length
  };
  const hotelCounts = countBy(inventory, "hotel");
  const departmentCounts = countBy(inventory, "departamento");
  const statusCounts = countBy(inventory, "estatus");
  const activeRate = metrics.total ? Math.round((metrics.activos / metrics.total) * 100) : 0;
  const custodyRate = metrics.total ? Math.round((metrics.resguardo / metrics.total) * 100) : 0;
  const recentChanges = [...state.history].reverse().slice(0, 8);
  const alerts = [
    ["En reparación", metrics.reparacion, "Equipos que requieren seguimiento"],
    ["Sustituidos", metrics.sustituidos, "Equipos con cambio operativo"],
    ["Decomisados/Baja", metrics.decomisadosBaja, "Equipos fuera de operación"]
  ];

  return `
    <div class="section-head dashboard-head">
      <div>
        <h2>Dashboard</h2>
        <p class="muted">Resumen operativo del inventario conectado a Google Sheets.</p>
      </div>
      <button class="btn" data-action="refresh">Actualizar</button>
    </div>
    <section class="dashboard-hero">
      <div>
        <span class="eyebrow">Inventario general</span>
        <strong>${metrics.total}</strong>
        <p>Datafonos registrados en la base de datos.</p>
      </div>
      <div class="hero-stats">
        ${miniStat("Activos", `${activeRate}%`, metrics.activos)}
        ${miniStat("Resguardo", `${custodyRate}%`, metrics.resguardo)}
        ${miniStat("Cambios del mes", metrics.cambiosMes, "movimientos")}
      </div>
    </section>
    <section class="metrics dashboard-metrics">
      ${metric("Activos", metrics.activos, "Disponibles para operación")}
      ${metric("Resguardo", metrics.resguardo, "Asignados bajo responsabilidad")}
      ${metric("En reparación", metrics.reparacion, "Pendientes de seguimiento")}
      ${metric("Sustituidos", metrics.sustituidos, "Con terminal reemplazante")}
      ${metric("Decomisados/Baja", metrics.decomisadosBaja, "Fuera de operación")}
      ${metric("Cambios del mes", metrics.cambiosMes, currentMonth)}
    </section>
    <section class="dashboard-layout">
      <div class="panel status-panel">
        <div class="panel-head">
          <h3>Distribución por estatus</h3>
          <span>${metrics.total} equipos</span>
        </div>
        ${renderStatusOverview(statusCounts, metrics.total)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Alertas operativas</h3>
          <span>Seguimiento</span>
        </div>
        ${renderAlertList(alerts)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Top hoteles</h3>
          <span>${hotelCounts.length} hoteles</span>
        </div>
        ${renderBars(hotelCounts)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Top departamentos</h3>
          <span>${departmentCounts.length} áreas</span>
        </div>
        ${renderBars(departmentCounts)}
      </div>
      <div class="panel span-2">
        <div class="panel-head">
          <h3>Últimos movimientos</h3>
          <span>${recentChanges.length} recientes</span>
        </div>
        ${renderRecentChanges(recentChanges)}
      </div>
    </section>
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
            ${INVENTORY_TABLE_COLUMNS.map(([key, label]) => `
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
          ${rows.length ? rows.map(renderInventoryRow).join("") : `<tr><td colspan="${INVENTORY_TABLE_COLUMNS.length + 1}" class="empty">No hay datafonos para mostrar.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderInventoryRow(row) {
  const statusClass = STATUS_CLASS[row.estatus] || "";
  const activeMenu = state.actionMenu?.id === row.id ? "active" : "";
  return `
    <tr class="${statusClass}">
      <td class="actions-cell">
        <button class="btn icon kebab-btn ${activeMenu}" data-action="row-menu" data-id="${escapeAttr(row.id)}" title="Acciones" aria-label="Acciones de terminal ${escapeAttr(row.numero_terminal)}">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </td>
      ${INVENTORY_TABLE_COLUMNS.map(([key]) => `<td>${key === "estatus" ? statusPill(row[key]) : escapeHtml(row[key])}</td>`).join("")}
    </tr>
  `;
}

function renderActionMenu() {
  const { x, y, id } = state.actionMenu;
  return `
    <div class="action-menu" style="left:${x}px;top:${y}px">
      <button data-action="row-action" data-row-action="status" data-id="${escapeAttr(id)}">Editar estatus</button>
      <button data-action="row-action" data-row-action="data" data-id="${escapeAttr(id)}">Ver datos</button>
      <button data-action="row-action" data-row-action="history" data-id="${escapeAttr(id)}">Ver bitácora</button>
    </div>
  `;
}

function renderFilterMenu() {
  const { column, x, y } = state.filterMenu;
  const values = uniqueValues(state.inventory, column);
  const filterIsActive = hasInventoryFilter(column);
  const selected = filterIsActive ? state.inventoryFilters[column] : values;
  const allSelected = !filterIsActive;
  const isDateFilter = DATE_FILTER_COLUMNS.has(column);

  return `
    <div class="filter-menu" data-filter-column="${escapeAttr(column)}" data-filter-type="${isDateFilter ? "date" : "text"}" style="left:${x}px;top:${y}px">
      <button data-action="sort-filter" data-column="${column}" data-dir="asc">Ordenar de A a Z</button>
      <button data-action="sort-filter" data-column="${column}" data-dir="desc">Ordenar de Z a A</button>
      <button data-action="clear-filter" data-column="${column}">Borrar filtro</button>
      <input type="search" data-action="filter-search" placeholder="Buscar" value="${escapeAttr(state.filterSearch)}" />
      <label class="check-row">
        <input type="checkbox" data-action="toggle-filter-all" data-column="${column}" ${allSelected ? "checked" : ""} />
        <span>(Seleccionar todo)</span>
      </label>
      <div class="filter-list ${isDateFilter ? "date-filter-list" : ""}">
        ${isDateFilter ? renderDateFilterOptions(column, values, selected, allSelected) : renderTextFilterOptions(column, values, selected, allSelected)}
      </div>
      <div class="filter-actions">
        <button class="btn primary" data-action="apply-filter">Aceptar</button>
        <button class="btn" data-action="cancel-filter">Cancelar</button>
      </div>
    </div>
  `;
}

function renderTextFilterOptions(column, values, selected, allSelected) {
  return values.map((value) => `
    <label class="check-row filter-choice">
      <input type="checkbox" data-action="toggle-filter-value" data-column="${column}" value="${escapeAttr(value)}" ${allSelected || selected.includes(value) ? "checked" : ""} />
      <span>${escapeHtml(value || "(vacío)")}</span>
    </label>
  `).join("");
}

function renderDateFilterOptions(column, values, selected, allSelected) {
  const groups = buildDateFilterGroups(values);
  return `
    ${groups.years.map((year) => `
      <div class="date-year-group" data-year-group="${escapeAttr(year.key)}">
        <div class="check-row group-row year-row filter-choice">
          <button class="date-toggle" type="button" data-action="toggle-date-group" data-target="year-${escapeAttr(year.key)}" aria-expanded="true" title="Contraer ${escapeAttr(year.key)}"></button>
          <label class="group-check">
            <input type="checkbox" data-action="toggle-filter-year" data-column="${column}" data-year="${escapeAttr(year.key)}" />
            <span>${escapeHtml(year.key)}</span>
          </label>
          <small>${year.values.length}</small>
        </div>
        <div class="date-nested" data-date-children="year-${escapeAttr(year.key)}" data-collapsed="false">
          ${year.months.map((month) => `
            <div class="date-month-group" data-year="${escapeAttr(year.key)}" data-month-group="${escapeAttr(month.key)}">
              <div class="check-row group-row month-row filter-choice">
                <button class="date-toggle" type="button" data-action="toggle-date-group" data-target="month-${escapeAttr(month.key)}" aria-expanded="false" title="Abrir ${escapeAttr(month.label)}"></button>
                <label class="group-check">
                  <input type="checkbox" data-action="toggle-filter-month" data-column="${column}" data-year="${escapeAttr(year.key)}" data-month="${escapeAttr(month.key)}" />
                  <span>${escapeHtml(month.label)}</span>
                </label>
                <small>${month.values.length}</small>
              </div>
              <div class="date-nested days" data-date-children="month-${escapeAttr(month.key)}" data-collapsed="true">
                ${month.values.map((item) => renderDateValueOption(column, item, selected, allSelected)).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
    ${groups.withoutDate.map((value) => `
      <label class="check-row filter-choice date-value-row">
        <input type="checkbox" data-action="toggle-filter-value" data-column="${column}" value="${escapeAttr(value)}" ${allSelected || selected.includes(value) ? "checked" : ""} />
        <span>${escapeHtml(value || "(sin fecha)")}</span>
      </label>
    `).join("")}
  `;
}

function renderDateValueOption(column, item, selected, allSelected) {
  return `
    <label class="check-row filter-choice date-value-row">
      <input type="checkbox" data-action="toggle-filter-value" data-column="${column}" value="${escapeAttr(item.value)}" data-year="${escapeAttr(item.year)}" data-month="${escapeAttr(item.monthKey)}" ${allSelected || selected.includes(item.value) ? "checked" : ""} />
      <span>${escapeHtml(item.display)}</span>
    </label>
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
  if (modal.type === "data") return modalShell(modal.editing ? "Editar información del datafono" : "Datos del datafono", renderDataForm(modal.row, modal.editing), "wide");
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

function renderDataForm(row, editing = false) {
  const locked = editing ? "" : "disabled";
  return `
    <form data-form="data" data-id="${escapeAttr(row.id)}">
      <div class="grid-3">
        ${field("numero_terminal", "Número Terminal *", row.numero_terminal, "text", locked)}
        ${field("numero_afiliado", "Número Afiliado *", row.numero_afiliado, "text", locked)}
        ${editing ? selectField("hotel", "Hotel *", state.config.Hoteles, row.hotel) : field("hotel_actual", "Hotel *", row.hotel, "text", "disabled")}
        ${editing ? selectField("area", "Área *", state.config.Areas, row.area) : field("area_actual", "Área *", row.area, "text", "disabled")}
        ${editing ? selectField("departamento", "Departamento *", state.config.Departamentos, row.departamento) : field("departamento_actual", "Departamento *", row.departamento, "text", "disabled")}
        ${field("responsable", "Responsable", row.responsable, "text", locked)}
        ${editing ? field("fecha_asignacion", "Fecha asignación", row.fecha_asignacion || todayIso(), "date") : field("fecha_asignacion_actual", "Fecha asignación", row.fecha_asignacion, "text", "disabled")}
        ${field("estatus_actual", "Estatus", row.estatus, "text", "disabled")}
        ${field("fecha_cambio_actual", "Fecha cambio", row.fecha_cambio, "text", "disabled")}
        ${field("sustituido_por_actual", "Sustituido por", row.sustituido_por, "text", "disabled")}
      </div>
      ${textareaField("observacion", "Observación", row.observacion, locked)}
      ${editing ? modalButtons("Guardar") : dataViewButtons()}
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

function field(name, label, value = "", type = "text", attrs = "") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${attrs} /></div>`;
}

function selectField(name, label, options = [], value = "", attrs = "") {
  return `
    <div class="field">
      <label>${label}</label>
      <select name="${name}" ${attrs}>
        <option value="">Seleccione</option>
        ${(options || []).map((option) => `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </div>
  `;
}

function textareaField(name, label, value = "", attrs = "") {
  return `<div class="field" style="margin-top:14px"><label>${label}</label><textarea name="${name}" ${attrs}>${escapeHtml(value)}</textarea></div>`;
}

function modalButtons(primaryText) {
  return `
    <div class="grid-2" style="margin-top:16px">
      <button class="btn primary" type="submit">${primaryText}</button>
      <button class="btn" type="button" data-action="close-modal">Cerrar</button>
    </div>
  `;
}

function dataViewButtons() {
  return `
    <div class="grid-2" style="margin-top:16px">
      <button class="btn primary" type="button" data-action="enable-data-edit">Editar información</button>
      <button class="btn" type="button" data-action="close-modal">Cerrar</button>
    </div>
  `;
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    if (event.target.closest(".action-menu, .filter-menu, .modal")) return;
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
  } else if (action === "enable-data-edit") {
    if (state.modal?.type === "data") state.modal.editing = true;
    render();
  } else if (action === "toggle-date-group") {
    toggleDateGroup(button);
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
    if (button.dataset.rowAction === "data") state.modal = { type: "data", row, editing: false };
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
  } else if (action === "apply-filter") {
    applyCurrentFilter();
  } else if (action === "cancel-filter" || action === "close-popups") {
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
  const menu = target.closest(".filter-menu");
  if (action === "toggle-filter-all") {
    setFilterValuesChecked(menu, target.checked);
  } else if (action === "toggle-filter-year") {
    setFilterValuesChecked(menu, target.checked, (input) => input.dataset.year === target.dataset.year);
  } else if (action === "toggle-filter-month") {
    setFilterValuesChecked(menu, target.checked, (input) => input.dataset.month === target.dataset.month);
  } else if (action === "toggle-filter-value") {
    syncFilterMenuControls(menu);
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === "filter-search") {
    state.filterSearch = target.value;
    updateFilterMenuSearch(target.closest(".filter-menu"), target.value);
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
    rows = rows.filter((row) => selected.includes(String(row[column] || "").trim()));
  }
  if (state.inventorySort) {
    const { column, dir } = state.inventorySort;
    rows.sort((a, b) => compareInventoryValues(a[column], b[column], column) * (dir === "desc" ? -1 : 1));
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
  return hasInventoryFilter(column) || state.inventorySort?.column === column;
}

function hasInventoryFilter(column) {
  return Object.prototype.hasOwnProperty.call(state.inventoryFilters, column);
}

function uniqueValues(rows, column) {
  return Array.from(new Set(rows.map((row) => String(row[column] || "").trim()))).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

function applyCurrentFilter() {
  const menu = document.querySelector(".filter-menu");
  if (!menu || !state.filterMenu) return;
  const column = state.filterMenu.column;
  const allValues = uniqueValues(state.inventory, column);
  const selected = Array.from(menu.querySelectorAll('input[data-action="toggle-filter-value"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);

  if (selected.length === allValues.length) delete state.inventoryFilters[column];
  else state.inventoryFilters[column] = selected;

  state.actionMenu = null;
  state.filterMenu = null;
  state.filterSearch = "";
  render();
}

function setFilterValuesChecked(menu, checked, predicate = () => true) {
  if (!menu) return;
  menu.querySelectorAll('input[data-action="toggle-filter-value"]').forEach((input) => {
    if (predicate(input)) input.checked = checked;
  });
  syncFilterMenuControls(menu);
}

function syncFilterMenuControls(menu = document.querySelector(".filter-menu")) {
  if (!menu) return;
  const values = Array.from(menu.querySelectorAll('input[data-action="toggle-filter-value"]'));
  const allToggle = menu.querySelector('input[data-action="toggle-filter-all"]');
  syncCheckboxState(allToggle, values);

  menu.querySelectorAll('input[data-action="toggle-filter-year"]').forEach((input) => {
    syncCheckboxState(input, values.filter((value) => value.dataset.year === input.dataset.year));
  });

  menu.querySelectorAll('input[data-action="toggle-filter-month"]').forEach((input) => {
    syncCheckboxState(input, values.filter((value) => value.dataset.month === input.dataset.month));
  });
}

function syncCheckboxState(input, values) {
  if (!input) return;
  const checkedCount = values.filter((item) => item.checked).length;
  input.checked = values.length > 0 && checkedCount === values.length;
  input.indeterminate = checkedCount > 0 && checkedCount < values.length;
}

function updateFilterMenuSearch(menu, value) {
  if (!menu) return;
  const query = normalizeSearchText(value);
  menu.querySelectorAll(".search-hidden").forEach((item) => item.classList.remove("search-hidden"));

  if (!query) {
    return;
  }

  if (menu.dataset.filterType !== "date") {
    menu.querySelectorAll(".filter-choice").forEach((item) => {
      item.classList.toggle("search-hidden", !normalizeSearchText(item.textContent).includes(query));
    });
    return;
  }

  menu.querySelectorAll(".date-value-row").forEach((item) => {
    item.classList.toggle("search-hidden", !normalizeSearchText(item.textContent).includes(query));
  });

  menu.querySelectorAll(".date-month-group").forEach((group) => {
    const row = group.querySelector(".month-row");
    const rowMatches = normalizeSearchText(row?.textContent).includes(query);
    const values = Array.from(group.querySelectorAll(".date-value-row"));
    if (rowMatches) values.forEach((item) => item.classList.remove("search-hidden"));
    const hasVisibleValue = values.some((item) => !item.classList.contains("search-hidden"));
    group.classList.toggle("search-hidden", !rowMatches && !hasVisibleValue);
    if (rowMatches || hasVisibleValue) {
      setDateGroupExpanded(group.querySelector(".date-toggle"), true);
    }
  });

  menu.querySelectorAll(".date-year-group").forEach((group) => {
    const row = group.querySelector(".year-row");
    const rowMatches = normalizeSearchText(row?.textContent).includes(query);
    const months = Array.from(group.querySelectorAll(".date-month-group"));
    if (rowMatches) {
      months.forEach((month) => {
        month.classList.remove("search-hidden");
        month.querySelectorAll(".date-value-row").forEach((item) => item.classList.remove("search-hidden"));
      });
    }
    const hasVisibleMonth = months.some((month) => !month.classList.contains("search-hidden"));
    group.classList.toggle("search-hidden", !rowMatches && !hasVisibleMonth);
    if (rowMatches || hasVisibleMonth) {
      setDateGroupExpanded(group.querySelector(".year-row .date-toggle"), true);
    }
  });
}

function toggleDateGroup(button) {
  setDateGroupExpanded(button, button.getAttribute("aria-expanded") !== "true");
}

function setDateGroupExpanded(button, expanded) {
  if (!button) return;
  const menu = button.closest(".filter-menu");
  const target = Array.from(menu?.querySelectorAll("[data-date-children]") || [])
    .find((item) => item.dataset.dateChildren === button.dataset.target);
  if (!target) return;
  target.dataset.collapsed = String(!expanded);
  button.setAttribute("aria-expanded", String(expanded));
  button.title = `${expanded ? "Contraer" : "Abrir"} ${button.closest(".group-row")?.innerText.trim() || "grupo"}`;
}

function buildDateFilterGroups(values) {
  const years = new Map();
  const withoutDate = [];

  values.forEach((value) => {
    const parts = parseDateParts(value);
    if (!parts) {
      withoutDate.push(value);
      return;
    }

    if (!years.has(parts.year)) {
      years.set(parts.year, { key: parts.year, values: [], months: new Map() });
    }
    const year = years.get(parts.year);
    year.values.push(value);

    if (!year.months.has(parts.monthKey)) {
      year.months.set(parts.monthKey, { key: parts.monthKey, label: parts.monthLabel, values: [] });
    }
    year.months.get(parts.monthKey).values.push({ ...parts, value });
  });

  return {
    years: Array.from(years.values())
      .sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }))
      .map((year) => ({
        ...year,
        months: Array.from(year.months.values())
          .sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }))
          .map((month) => ({
            ...month,
            values: month.values.sort((a, b) => a.value.localeCompare(b.value, "es", { numeric: true }))
          }))
      })),
    withoutDate
  };
}

function parseDateParts(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  let year;
  let month;
  let day;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return {
    year: String(year),
    monthKey: `${year}-${paddedMonth}`,
    monthLabel: `${MONTH_NAMES_ES[month - 1]} ${year}`,
    display: `${paddedDay}/${paddedMonth}/${year}`
  };
}

function compareInventoryValues(first, second, column) {
  if (DATE_FILTER_COLUMNS.has(column)) {
    const firstDate = dateSortValue(first);
    const secondDate = dateSortValue(second);
    if (firstDate !== null && secondDate !== null) return firstDate - secondDate;
    if (firstDate !== null) return -1;
    if (secondDate !== null) return 1;
  }
  return String(first || "").localeCompare(String(second || ""), "es", { numeric: true });
}

function dateSortValue(value) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return Number(parts.monthKey.replace("-", "") + parts.display.slice(0, 2));
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function metric(label, value, caption = "") {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${caption ? `<small>${escapeHtml(caption)}</small>` : ""}
    </div>
  `;
}

function miniStat(label, value, detail) {
  return `
    <div class="mini-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </div>
  `;
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

function renderStatusOverview(items, total) {
  if (!items.length) return `<p class="muted">Sin datos.</p>`;
  let current = 0;
  const segments = items.map(([label, value], index) => {
    const start = current;
    const size = total ? (value / total) * 100 : 0;
    current += size;
    return `${dashboardColor(label, index)} ${start}% ${current}%`;
  });
  return `
    <div class="status-overview">
      <div class="donut" style="background:conic-gradient(${segments.join(", ")})">
        <span>${total}</span>
      </div>
      <div class="status-legend">
        ${items.map(([label, value], index) => `
          <div>
            <i style="background:${dashboardColor(label, index)}"></i>
            <span>${escapeHtml(label || "Sin valor")}</span>
            <strong>${value}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAlertList(items) {
  return `
    <div class="alert-list">
      ${items.map(([label, value, detail], index) => `
        <div class="alert-item">
          <i style="background:${dashboardColor(label, index + 2)}"></i>
          <div>
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(label)}</span>
            <small>${escapeHtml(detail)}</small>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRecentChanges(rows) {
  if (!rows.length) return `<p class="muted">Sin movimientos recientes.</p>`;
  return `
    <div class="recent-list">
      ${rows.map((row) => `
        <div class="recent-item">
          <span>${escapeHtml(row.fecha)}</span>
          <strong>${escapeHtml(row.terminal_nueva || row.terminal_anterior || "Sin terminal")}</strong>
          <em>${escapeHtml(row.motivo || "Movimiento")}</em>
          <small>${escapeHtml(row.responsable || row.departamento || "")}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBars(items) {
  if (!items.length) return `<p class="muted">Sin datos.</p>`;
  const max = Math.max(...items.map(([, value]) => value));
  return `<div class="chart-list">${items.slice(0, 10).map(([label, value]) => `
    <div class="bar-row" style="--bar-color:${dashboardColor(label)}">
      <span>${escapeHtml(label)}</span>
      <div class="bar"><span style="width:${Math.max(4, (value / max) * 100)}%"></span></div>
      <strong>${value}</strong>
    </div>
  `).join("")}</div>`;
}

function dashboardColor(label, fallbackIndex = 0) {
  const colors = {
    "Activo": "#10b981",
    "Resguardo": "#2563eb",
    "En reparación": "#facc15",
    "Sustituido": "#14b8a6",
    "Decomisado": "#fb4b4e",
    "Baja": "#64748b",
    "Decomisados/Baja": "#fb4b4e",
    "Sustituidos": "#14b8a6"
  };
  const palette = ["#083344", "#10b981", "#facc15", "#2563eb", "#14b8a6", "#fb4b4e", "#7c3aed", "#64748b"];
  return colors[label] || palette[Math.abs(String(label || "").length + fallbackIndex) % palette.length];
}

function statusPill(status) {
  const clean = String(status || "").trim();
  return `<span class="status-pill ${STATUS_PILL[clean] || "pill-default"}">${escapeHtml(clean)}</span>`;
}

function creditCardIcon() {
  return `
    <span class="cc-icon" aria-hidden="true">
      <span></span>
    </span>
  `;
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
