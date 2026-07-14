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
  ["fecha_hora", "Fecha y hora"],
  ["usuario", "Usuario"],
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
  inventorySearch: "",
  selectedInventoryIds: [],
  historySearch: "",
  historyUser: "",
  historyDateFrom: "",
  historyDateTo: "",
  actionMenu: null,
  filterMenu: null,
  filterSearch: "",
  modal: null,
  toast: null,
  loading: false,
  sidebarOpen: false,
  syncedAt: "",
  syncError: false
};

const VIEW_META = {
  dashboard: ["Dashboard", "Panorama operativo y alertas del inventario"],
  inventory: ["Inventario maestro", "Consulta, filtra y gestiona los datafonos"],
  history: ["Historial de cambios", "Trazabilidad de movimientos y responsables"],
  users: ["Usuarios", "Accesos, roles y estado de las cuentas"]
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
      state.sidebarOpen = false;
      if (state.modal) {
        closeModal();
        return;
      }
      render();
    } else if (event.key === "Tab" && state.modal) {
      trapDialogFocus(event);
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
    state.syncedAt = data.synced_at || "";
    state.syncError = false;
    state.selectedInventoryIds = state.selectedInventoryIds.filter((id) => state.inventory.some((row) => row.id === id));
  } catch (error) {
    if (error.status === 401) state.session = null;
    state.syncError = true;
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
    error.data = data;
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
      ${state.sidebarOpen ? `<button class="sidebar-backdrop" data-action="close-sidebar" aria-label="Cerrar menú"></button>` : ""}
      <main class="main">
        ${renderTopbar()}
        ${state.loading ? `<div class="panel">Cargando datos...</div>` : renderView()}
      </main>
    </div>
    ${state.actionMenu ? renderActionMenu() : ""}
    ${state.filterMenu ? renderFilterMenu() : ""}
    ${state.modal ? renderModal() : ""}
  `;
  syncFilterMenuControls();
  syncSelectionHeader();
  renderToast();
  focusActiveDialog();
}

function renderLogin() {
  return `
    <main class="login-shell">
      <form class="login-card" data-form="login">
        <section class="login-brand" aria-label="Control de Datafonos">
          <div class="login-brand-title">${creditCardIcon()}<span>Control de Datafonos</span></div>
          <h1>Inventario confiable, decisiones rápidas.</h1>
          <p>Consulta ubicaciones, responsables, resguardos e historial desde un solo lugar.</p>
          <div class="login-features">
            <span>Inventario centralizado</span>
            <span>Trazabilidad de cambios</span>
            <span>Resguardos en PDF</span>
          </div>
        </section>
        <section class="login-form-panel">
          <span class="eyebrow">Acceso seguro</span>
          <h2>Iniciar sesión</h2>
          <p>Ingresa tus credenciales para continuar.</p>
          ${formErrorRegion()}
          ${field("usuario", "Usuario *", "", "text", 'autocomplete="username" autofocus')}
          <div class="password-field">
            ${field("clave", "Contraseña *", "", "password", 'autocomplete="current-password"')}
            <button class="password-toggle" type="button" data-action="toggle-password" aria-label="Mostrar contraseña">Mostrar</button>
          </div>
          <button class="btn primary full-width" type="submit" data-busy-label="Ingresando…">Entrar</button>
          <small class="login-help">Si no puedes acceder, contacta al administrador del inventario.</small>
        </section>
      </form>
    </main>
  `;
}

function renderSidebar() {
  const menu = [
    ["dashboard", "Dashboard", "⌂"],
    ["inventory", "Inventario maestro", "▦"],
    ["history", "Historial de cambios", "↺"]
  ];
  if (state.session.rol === "Administrador") menu.push(["users", "Usuarios", "♙"]);

  return `
    <aside class="sidebar ${state.sidebarOpen ? "open" : ""}" aria-label="Navegación principal">
      <div class="sidebar-title">${creditCardIcon()}Control Datafonos</div>
      <div class="user-card">
        <span class="avatar" aria-hidden="true">${escapeHtml(String(state.session.usuario || "U").slice(0, 1).toUpperCase())}</span>
        <div><strong>${escapeHtml(state.session.usuario)}</strong><small>${escapeHtml(state.session.rol)}</small></div>
      </div>
      <nav class="nav">
        ${menu.map(([view, label, icon]) => `
          <button class="${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">
            <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-actions">
        <div class="sidebar-footer"><span class="connection-dot"></span><div><small>Fuente de datos</small><strong>Google Sheets</strong></div></div>
        <button class="btn" data-action="refresh">↻ Actualizar datos</button>
        <button class="btn" data-action="logout">Cerrar sesión</button>
      </div>
    </aside>
  `;
}

function renderTopbar() {
  const [title, subtitle] = VIEW_META[state.view] || VIEW_META.dashboard;
  return `
    <header class="topbar">
      <button class="mobile-menu-btn" data-action="open-sidebar" aria-label="Abrir menú" aria-expanded="${state.sidebarOpen}">☰</button>
      <div class="topbar-title">
        <span class="eyebrow">Control de Datafonos</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="sync-status" title="Última actualización completada">
        <span class="connection-dot ${state.syncError ? "error" : state.syncedAt ? "" : "pending"}"></span>
        <div><small>Última actualización</small><strong>${state.syncError ? "Error de conexión" : escapeHtml(formatSyncTime(state.syncedAt))}</strong></div>
      </div>
    </header>
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
  const alerts = [
    operationalAlert("En reparación", ["En reparación"]),
    operationalAlert("Sustituidos", ["Sustituido"]),
    operationalAlert("Decomisados/Baja", ["Decomisado", "Baja"])
  ];

  return `
    <section class="dashboard-hero">
      <div>
        <span class="eyebrow">Inventario general</span>
        <strong>${metrics.total}</strong>
        <p>Datafonos registrados y disponibles para seguimiento.</p>
        <button class="text-link" data-action="open-inventory-filter" data-statuses="">Ver inventario completo →</button>
      </div>
      <div class="hero-stats">
        ${miniStat("Activos", `${activeRate}%`, `${metrics.activos} equipos`, ["Activo"])}
        ${miniStat("Resguardo", `${custodyRate}%`, `${metrics.resguardo} equipos`, ["Resguardo"])}
        ${miniStat("Cambios del mes", metrics.cambiosMes, "movimientos", [], "history")}
      </div>
    </section>
    <section class="metrics dashboard-metrics">
      ${metric("Activos", metrics.activos, "Disponibles para operación", ["Activo"])}
      ${metric("Resguardo", metrics.resguardo, "Asignados bajo responsabilidad", ["Resguardo"])}
      ${metric("En reparación", metrics.reparacion, "Pendientes de seguimiento", ["En reparación"])}
      ${metric("Sustituidos", metrics.sustituidos, "Con terminal reemplazante", ["Sustituido"])}
      ${metric("Decomisados/Baja", metrics.decomisadosBaja, "Fuera de operación", ["Decomisado", "Baja"])}
      ${metric("Cambios del mes", metrics.cambiosMes, currentMonth, [], "history")}
    </section>
    <section class="dashboard-layout">
      <div class="panel status-panel dashboard-chart">
        <div class="panel-head">
          <h3>Gráfico de pastel por estatus</h3>
          <span>${metrics.total} equipos</span>
        </div>
        ${renderStatusOverview(statusCounts, metrics.total)}
      </div>
      <div class="panel dashboard-chart bar-chart-panel">
        <div class="panel-head">
          <h3>Gráfico de barras por hotel</h3>
          <span>${hotelCounts.length} hoteles</span>
        </div>
        ${renderBars(hotelCounts, { limit: 8, large: true })}
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
          <h3>Top departamentos</h3>
          <span>${departmentCounts.length} áreas</span>
        </div>
        ${renderBars(departmentCounts, { limit: 8 })}
      </div>
    </section>
  `;
}

function renderInventory() {
  const rows = getFilteredInventory();
  return `
    <section class="inventory-toolbar panel">
      <div class="toolbar-main">
        <label class="search-box" for="inventory-search">
          <span aria-hidden="true">⌕</span>
          <input id="inventory-search" type="search" data-action="inventory-search" placeholder="Buscar terminal, afiliado, hotel o responsable" value="${escapeAttr(state.inventorySearch)}" />
        </label>
        <button class="btn primary" data-action="open-modal" data-modal="register">+ Registrar datafono</button>
      </div>
      <div class="quick-views" aria-label="Vistas rápidas">
        <span>Vistas rápidas:</span>
        <button data-action="inventory-preset" data-preset="repair">En reparación</button>
        <button data-action="inventory-preset" data-preset="unassigned">Sin responsable</button>
        <button data-action="inventory-preset" data-preset="out">Fuera de operación</button>
        <button data-action="inventory-preset" data-preset="all">Todos</button>
      </div>
    </section>
    <div class="inventory-meta">
      <div>
        <strong class="inventory-count">${rows.length} de ${state.inventory.length}</strong>
        <span class="muted">datafonos visibles</span>
      </div>
      <div class="toolbar">
        <button class="btn" data-action="clear-all-filters" ${hasAnyInventoryConstraint() ? "" : "disabled"}>Limpiar filtros</button>
        <button class="btn" data-action="export-excel" ${rows.length ? "" : "disabled"}>Exportar vista XLSX</button>
      </div>
    </div>
    <div class="active-filters" aria-live="polite">${renderActiveFilterChips()}</div>
    <div class="selection-host">
      ${renderSelectionBar()}
    </div>
    <div class="inventory-results">
      ${renderInventoryTable(rows)}
    </div>
  `;
}

function renderInventoryTable(rows) {
  const visibleIds = rows.map((row) => row.id);
  const selectedVisible = visibleIds.filter((id) => state.selectedInventoryIds.includes(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  return `
    <div class="table-shell desktop-inventory-table">
      <table class="data-table">
        <thead>
          <tr>
            <th class="select-head sticky-select">
              <input type="checkbox" data-action="select-visible" aria-label="Seleccionar todos los datafonos visibles" ${allSelected ? "checked" : ""} ${selectedVisible.length && !allSelected ? 'data-indeterminate="true"' : ""} />
            </th>
            <th class="actions-head"></th>
            ${INVENTORY_TABLE_COLUMNS.map(([key, label]) => `
              <th class="${inventoryColumnClass(key)}">
                <div class="th-content">
                  <button class="sort-btn" data-action="sort-column" data-column="${key}" aria-label="Ordenar por ${escapeAttr(label)}">
                    <span>${label}</span>${sortIndicator(key)}
                  </button>
                  <button class="filter-btn ${isFilterActive(key) ? "active" : ""}" data-action="open-filter" data-column="${key}" title="Filtrar" aria-label="Filtrar ${escapeAttr(label)}">
                    <span class="filter-icon" aria-hidden="true"></span>
                  </button>
                </div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(renderInventoryRow).join("") : `<tr><td colspan="${INVENTORY_TABLE_COLUMNS.length + 2}" class="empty-state"><strong>No encontramos datafonos</strong><span>Prueba con otra búsqueda o limpia los filtros activos.</span><button class="btn" data-action="clear-all-filters">Limpiar filtros</button></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="mobile-inventory-list">
      ${rows.length ? `
        <label class="mobile-select-all">
          <input type="checkbox" data-action="select-visible" ${allSelected ? "checked" : ""} />
          <span>Seleccionar los ${rows.length} visibles</span>
        </label>
        ${rows.map(renderInventoryMobileCard).join("")}
      ` : `<div class="empty-state mobile-empty"><strong>No encontramos datafonos</strong><span>Prueba con otra búsqueda o limpia los filtros activos.</span><button class="btn" data-action="clear-all-filters">Limpiar filtros</button></div>`}
    </div>
  `;
}

function renderInventoryRow(row) {
  const statusClass = STATUS_CLASS[row.estatus] || "";
  const activeMenu = state.actionMenu?.id === row.id ? "active" : "";
  const selected = state.selectedInventoryIds.includes(row.id);
  return `
    <tr class="${statusClass} ${selected ? "selected" : ""}">
      <td class="select-cell sticky-select"><input type="checkbox" data-action="select-row" data-id="${escapeAttr(row.id)}" aria-label="Seleccionar terminal ${escapeAttr(row.numero_terminal)}" ${selected ? "checked" : ""} /></td>
      <td class="actions-cell">
        <button class="btn icon kebab-btn ${activeMenu}" data-action="row-menu" data-id="${escapeAttr(row.id)}" title="Acciones" aria-label="Acciones de terminal ${escapeAttr(row.numero_terminal)}">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </td>
      ${INVENTORY_TABLE_COLUMNS.map(([key]) => `<td class="${inventoryColumnClass(key)}">${key === "estatus" ? statusPill(row[key]) : escapeHtml(row[key])}</td>`).join("")}
    </tr>
  `;
}

function renderInventoryMobileCard(row) {
  const selected = state.selectedInventoryIds.includes(row.id);
  const activeMenu = state.actionMenu?.id === row.id ? "active" : "";
  return `
    <article class="inventory-mobile-card ${selected ? "selected" : ""}">
      <div class="mobile-card-head">
        <label class="mobile-row-select"><input type="checkbox" data-action="select-row" data-id="${escapeAttr(row.id)}" aria-label="Seleccionar terminal ${escapeAttr(row.numero_terminal)}" ${selected ? "checked" : ""} /><span></span></label>
        <div><small>Terminal</small><strong>${escapeHtml(row.numero_terminal)}</strong></div>
        ${statusPill(row.estatus)}
        <button class="btn icon kebab-btn ${activeMenu}" data-action="row-menu" data-id="${escapeAttr(row.id)}" aria-label="Acciones de terminal ${escapeAttr(row.numero_terminal)}"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
      </div>
      <div class="mobile-card-grid">
        <div><small>Afiliado</small><strong>${escapeHtml(row.numero_afiliado || "—")}</strong></div>
        <div><small>Hotel</small><strong>${escapeHtml(row.hotel || "—")}</strong></div>
        <div><small>Ubicación</small><strong>${escapeHtml([row.area, row.departamento].filter(Boolean).join(" · ") || "—")}</strong></div>
        <div><small>Responsable</small><strong>${escapeHtml(row.responsable || "Sin asignar")}</strong></div>
      </div>
      <div class="mobile-card-foot"><span>Asignación: ${escapeHtml(row.fecha_asignacion || "Sin fecha")}</span>${row.fecha_cambio ? `<span>Cambio: ${escapeHtml(row.fecha_cambio)}</span>` : ""}</div>
    </article>
  `;
}

function renderSelectionBar() {
  const rows = getSelectedInventory();
  if (!rows.length) return `<div class="selection-placeholder">Selecciona uno o varios datafonos para generar resguardos o exportar una selección.</div>`;
  return `
    <div class="selection-bar" role="status">
      <div><strong>${rows.length}</strong><span>${rows.length === 1 ? "datafono seleccionado" : "datafonos seleccionados"}</span></div>
      <div class="toolbar">
        <button class="btn" data-action="open-modal" data-modal="bulk-edit">Actualizar selección</button>
        <button class="btn" data-action="export-selected">Exportar selección</button>
        <button class="btn primary" data-action="open-modal" data-modal="resguardo">Generar resguardo PDF</button>
        <button class="btn ghost" data-action="clear-selection">Cancelar selección</button>
      </div>
    </div>
  `;
}

function renderActiveFilterChips() {
  const chips = [];
  if (state.inventorySearch) chips.push(`<button class="filter-chip" data-action="clear-search">Búsqueda: ${escapeHtml(truncate(state.inventorySearch, 24))} ×</button>`);
  Object.entries(state.inventoryFilters).forEach(([column, values]) => {
    const label = LABELS[column] || column;
    const valueLabel = values.length === 1 ? (values[0] || "Sin valor") : `${values.length} valores`;
    chips.push(`<button class="filter-chip" data-action="remove-filter" data-column="${escapeAttr(column)}">${escapeHtml(label)}: ${escapeHtml(valueLabel)} ×</button>`);
  });
  if (state.inventorySort) chips.push(`<button class="filter-chip neutral" data-action="clear-sort">Orden: ${escapeHtml(LABELS[state.inventorySort.column])} ${state.inventorySort.dir === "asc" ? "↑" : "↓"} ×</button>`);
  return chips.join("") || `<span class="muted">Sin filtros activos</span>`;
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
  const users = uniqueValues(state.history, "usuario").filter(Boolean);
  return `
    <section class="history-toolbar panel">
      <label class="search-box" for="history-search"><span aria-hidden="true">⌕</span><input id="history-search" type="search" data-action="history-search" placeholder="Buscar terminal, motivo, hotel o responsable" value="${escapeAttr(state.historySearch)}" /></label>
      <div class="history-filters">
        <div class="field compact"><label for="history-user">Usuario</label><select id="history-user" data-action="history-user"><option value="">Todos</option>${users.map((user) => `<option ${user === state.historyUser ? "selected" : ""}>${escapeHtml(user)}</option>`).join("")}</select></div>
        <div class="field compact"><label for="history-from">Desde</label><input id="history-from" type="date" data-action="history-date-from" value="${escapeAttr(state.historyDateFrom)}" /></div>
        <div class="field compact"><label for="history-to">Hasta</label><input id="history-to" type="date" data-action="history-date-to" value="${escapeAttr(state.historyDateTo)}" /></div>
      </div>
      <div class="toolbar history-actions">
        <span class="history-count"><strong>${rows.length}</strong> movimientos</span>
        <button class="btn" data-action="clear-history-filters">Limpiar</button>
        <button class="btn primary" data-action="export-history" ${rows.length ? "" : "disabled"}>Exportar XLSX</button>
      </div>
    </section>
    <div class="table-shell">
      <table class="data-table">
        <thead><tr>${HISTORY_COLUMNS.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead>
        <tbody data-history-body>${renderHistoryRows(rows)}</tbody>
      </table>
    </div>
  `;
}

function renderHistoryRows(rows) {
  if (!rows.length) return `<tr><td class="empty-state" colspan="${HISTORY_COLUMNS.length}"><strong>No encontramos movimientos</strong><span>Ajusta la búsqueda o el rango de fechas.</span></td></tr>`;
  return rows.map((row) => `<tr>${HISTORY_COLUMNS.map(([key]) => `<td>${key === "fecha_hora" ? escapeHtml(row.fecha_hora || row.fecha) : escapeHtml(row[key])}</td>`).join("")}</tr>`).join("");
}

function renderUsers() {
  if (state.session.rol !== "Administrador") return `<div class="panel">No tienes permiso para ver usuarios.</div>`;
  return `
    <div class="section-head content-head">
      <div><h2>Accesos del sistema</h2><p class="muted">Administra roles y disponibilidad sin compartir contraseñas.</p></div>
      <button class="btn primary" data-action="open-modal" data-modal="user-create">Nuevo usuario</button>
    </div>
    <div class="table-shell">
      <table class="data-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead>
        <tbody>
          ${state.users.map((user) => `
            <tr>
              <td>${escapeHtml(user.usuario)}</td>
              <td><span class="role-pill">${escapeHtml(user.rol)}</span></td>
              <td><span class="account-status ${user.activo === "Sí" ? "active" : "inactive"}"><i></i>${user.activo === "Sí" ? "Activo" : "Inactivo"}</span></td>
              <td class="row-actions">
                <button class="btn" data-action="open-modal" data-modal="user-edit" data-id="${escapeAttr(user.usuario)}">Editar</button>
                <button class="btn" data-action="open-modal" data-modal="user-password" data-id="${escapeAttr(user.usuario)}">Cambiar clave</button>
                <button class="btn ${user.activo === "Sí" ? "danger-ghost" : ""}" data-action="toggle-user-status" data-id="${escapeAttr(user.usuario)}" data-current="${escapeAttr(user.activo)}">${user.activo === "Sí" ? "Desactivar" : "Activar"}</button>
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
  if (modal.type === "bulk-edit") return modalShell("Actualizar selección", renderBulkEditForm(), "wide");
  if (modal.type === "user-create") return modalShell("Nuevo usuario", renderUserCreateForm());
  if (modal.type === "user-edit") return modalShell("Editar usuario", renderUserEditForm(modal.user));
  if (modal.type === "user-password") return modalShell("Cambiar contraseña", renderUserPasswordForm(modal.user));
  if (modal.type === "confirm") return modalShell(modal.title, renderConfirmDialog(modal), "confirm-dialog");
  return "";
}

function modalShell(title, body, extraClass = "") {
  const titleId = `modal-title-${slugify(title)}`;
  return `
    <div class="modal-backdrop">
      <section class="modal ${extraClass}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <div class="modal-head">
          <h3 id="${titleId}">${escapeHtml(title)}</h3>
          <button class="close-btn" data-action="close-modal" aria-label="Cerrar ventana">×</button>
        </div>
        ${body}
      </section>
    </div>
  `;
}

function renderRegisterForm() {
  return `
    <form data-form="register">
      ${formErrorRegion()}
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
      ${formErrorRegion()}
      <input type="hidden" name="actualizado_el" value="${escapeAttr(row.actualizado_el)}" />
      <div class="record-summary"><div><small>Terminal</small><strong>${escapeHtml(row.numero_terminal)}</strong></div><div><small>Afiliado</small><strong>${escapeHtml(row.numero_afiliado)}</strong></div><div><small>Hotel</small><strong>${escapeHtml(row.hotel)}</strong></div><div><small>Estatus actual</small>${statusPill(row.estatus)}</div></div>
      <div class="grid-3">
        ${selectField("estatus", "Estatus *", state.config.Estatus, row.estatus)}
        ${field("fecha_cambio", "Fecha cambio", todayIso(), "date")}
        ${field("sustituido_por", "Sustituido por", row.sustituido_por, "text", `${row.estatus === "Sustituido" ? "required " : "disabled "}aria-describedby="sustituto-hint"`)}
      </div>
      <p class="field-hint" id="sustituto-hint">Obligatorio cuando el nuevo estatus sea Sustituido.</p>
      <label class="check-row sensitive-confirm" ${["Sustituido", "Decomisado", "Baja"].includes(row.estatus) ? "" : "hidden"}>
        <input type="checkbox" name="confirm_sensitive" value="Sí" ${["Sustituido", "Decomisado", "Baja"].includes(row.estatus) ? "required" : "disabled"} />
        <span>Confirmo que revisé esta acción y su impacto operativo.</span>
      </label>
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
      ${formErrorRegion()}
      <input type="hidden" name="actualizado_el" value="${escapeAttr(row.actualizado_el)}" />
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
          ${items.length ? renderHistoryRows(items) : `<tr><td colspan="${HISTORY_COLUMNS.length}" class="empty">Esta terminal no tiene cambios registrados.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderResguardoForm() {
  const rows = getSelectedInventory();
  const responsables = uniqueValues(rows, "responsable").filter(Boolean);
  const responsableDefault = responsables.length === 1 ? responsables[0] : "";
  return `
    <form data-form="resguardo">
      ${formErrorRegion()}
      <div class="resguardo-summary"><strong>${rows.length} ${rows.length === 1 ? "datafono" : "datafonos"}</strong><span>seleccionados para el documento del ${formatDate(todayIso())}</span><small>${escapeHtml(rows.slice(0, 4).map((row) => row.numero_terminal).join(", "))}${rows.length > 4 ? ` y ${rows.length - 4} más` : ""}</small></div>
      <div class="grid-2">
        ${selectField("tipo_documento", "Tipo de documento *", ["Cédula", "Pasaporte"], "Cédula")}
        ${field("numero_documento", "Cédula o pasaporte *")}
        ${field("nombre_responsable", "Nombre del responsable *", responsableDefault)}
        ${field("puesto_responsable", "Puesto del responsable *")}
        ${field("nombre_entrega", "Nombre de quien entrega *")}
      </div>
      ${textareaField("observacion_resguardo", "Observación del resguardo")}
      ${modalButtons("Generar PDF")}
    </form>
  `;
}

function renderBulkEditForm() {
  const rows = getSelectedInventory();
  return `
    <form data-form="bulk-edit">
      ${formErrorRegion()}
      <div class="resguardo-summary"><strong>${rows.length} ${rows.length === 1 ? "datafono seleccionado" : "datafonos seleccionados"}</strong><span>Completa únicamente los valores que quieres aplicar a toda la selección.</span></div>
      <div class="grid-3">
        ${selectField("estatus", "Estatus", (state.config.Estatus || []).filter((value) => value !== "Sustituido"))}
        ${selectField("hotel", "Hotel", state.config.Hoteles)}
        ${selectField("area", "Área", state.config.Areas)}
        ${selectField("departamento", "Departamento", state.config.Departamentos)}
        ${field("responsable", "Responsable")}
      </div>
      <label class="check-row bulk-clear"><input type="checkbox" name="clear_responsable" value="Sí" /><span>Quitar el responsable actual de todos los seleccionados</span></label>
      ${field("motivo", "Motivo del cambio *", "Actualización masiva")}
      <p class="field-hint">El estatus Sustituido se registra individualmente porque requiere indicar la terminal sustituta.</p>
      ${modalButtons("Aplicar cambios")}
    </form>
  `;
}

function renderUserCreateForm() {
  return `
    <form data-form="user-create">
      ${formErrorRegion()}
      ${field("usuario", "Usuario *")}
      ${field("clave", "Contraseña *", "", "password", 'minlength="8" autocomplete="new-password"')}
      ${selectField("rol", "Rol *", state.config.Roles, "Usuario")}
      ${selectField("activo", "Activo *", state.config.Activo, "Sí")}
      ${modalButtons("Crear usuario")}
    </form>
  `;
}

function renderUserEditForm(user) {
  return `
    <form data-form="user-edit" data-id="${escapeAttr(user.usuario)}">
      ${formErrorRegion()}
      ${field("usuario", "Usuario *", user.usuario)}
      ${selectField("rol", "Rol", state.config.Roles, user.rol)}
      ${selectField("activo", "Activo", state.config.Activo, user.activo)}
      ${modalButtons("Guardar usuario")}
    </form>
  `;
}

function renderUserPasswordForm(user) {
  return `
    <form data-form="user-password" data-id="${escapeAttr(user.usuario)}">
      ${formErrorRegion()}
      <p>Cambiar contraseña de <strong>${escapeHtml(user.usuario)}</strong>.</p>
      ${field("clave", "Nueva contraseña *", "", "password", 'minlength="8" autocomplete="new-password"')}
      ${modalButtons("Guardar contraseña")}
    </form>
  `;
}

function field(name, label, value = "", type = "text", attrs = "") {
  const id = `field-${name}`;
  const required = label.includes("*") ? "required" : "";
  const cleanLabel = label.replace(" *", "");
  return `<div class="field"><label for="${id}">${escapeHtml(cleanLabel)}${required ? '<span class="required-mark" aria-hidden="true">*</span>' : ""}</label><input id="${id}" name="${name}" type="${type}" value="${escapeAttr(value)}" ${required} ${attrs} /></div>`;
}

function selectField(name, label, options = [], value = "", attrs = "") {
  const id = `field-${name}`;
  const required = label.includes("*") ? "required" : "";
  const cleanLabel = label.replace(" *", "");
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(cleanLabel)}${required ? '<span class="required-mark" aria-hidden="true">*</span>' : ""}</label>
      <select id="${id}" name="${name}" ${required} ${attrs}>
        <option value="">Seleccione</option>
        ${(options || []).map((option) => `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </div>
  `;
}

function textareaField(name, label, value = "", attrs = "") {
  const id = `field-${name}`;
  return `<div class="field field-spaced"><label for="${id}">${escapeHtml(label)}</label><textarea id="${id}" name="${name}" ${attrs}>${escapeHtml(value)}</textarea></div>`;
}

function modalButtons(primaryText) {
  return `
    <div class="grid-2" style="margin-top:16px">
      <button class="btn primary" type="submit" data-busy-label="Procesando…">${primaryText}</button>
      <button class="btn" type="button" data-action="close-modal">Cerrar</button>
    </div>
  `;
}

function formErrorRegion() {
  return `<div class="form-error" role="alert" hidden></div>`;
}

function renderConfirmDialog(modal) {
  return `
    <div class="confirm-content">
      <span class="confirm-icon" aria-hidden="true">!</span>
      <p>${escapeHtml(modal.message)}</p>
    </div>
    <div class="modal-actions">
      <button class="btn ${modal.danger ? "danger" : "primary"}" data-action="confirm-action" data-confirm-action="${escapeAttr(modal.confirmAction)}" data-id="${escapeAttr(modal.id || "")}">${escapeHtml(modal.confirmLabel || "Confirmar")}</button>
      <button class="btn" data-action="close-modal">Cancelar</button>
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
    state.sidebarOpen = false;
    state.actionMenu = null;
    state.filterMenu = null;
    render();
  } else if (action === "open-sidebar") {
    state.sidebarOpen = true;
    render();
  } else if (action === "close-sidebar") {
    state.sidebarOpen = false;
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
    closeModal();
  } else if (action === "toggle-password") {
    togglePasswordVisibility(button);
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
  } else if (action === "sort-column") {
    const current = state.inventorySort;
    state.inventorySort = current?.column === button.dataset.column
      ? { column: button.dataset.column, dir: current.dir === "asc" ? "desc" : "asc" }
      : { column: button.dataset.column, dir: "asc" };
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
    exportExcel("historial_datafonos", getFilteredHistory().map((row) => ({ ...row, fecha_hora: row.fecha_hora || row.fecha })), HISTORY_COLUMNS);
  } else if (action === "export-selected") {
    exportExcel("inventario_datafonos_seleccion", getSelectedInventory(), INVENTORY_COLUMNS);
  } else if (action === "clear-selection") {
    state.selectedInventoryIds = [];
    refreshInventoryResults();
    refreshInventorySelectionUi();
  } else if (action === "clear-all-filters") {
    clearInventoryConstraints();
    render();
  } else if (action === "clear-search") {
    state.inventorySearch = "";
    render();
  } else if (action === "remove-filter") {
    delete state.inventoryFilters[button.dataset.column];
    render();
  } else if (action === "clear-sort") {
    state.inventorySort = null;
    render();
  } else if (action === "inventory-preset") {
    applyInventoryPreset(button.dataset.preset);
  } else if (action === "open-inventory-filter") {
    const statuses = String(button.dataset.statuses || "").split("|").filter(Boolean);
    state.view = "inventory";
    state.inventorySearch = "";
    state.inventoryFilters = statuses.length ? { estatus: statuses } : {};
    state.inventorySort = null;
    render();
  } else if (action === "clear-history-filters") {
    state.historySearch = "";
    state.historyUser = "";
    state.historyDateFrom = "";
    state.historyDateTo = "";
    render();
  } else if (action === "toggle-user-status") {
    const deactivating = button.dataset.current === "Sí";
    state.modal = {
      type: "confirm",
      title: deactivating ? "Desactivar usuario" : "Activar usuario",
      message: `${deactivating ? "Se bloqueará el acceso de" : "Se restaurará el acceso de"} ${button.dataset.id}.`,
      confirmLabel: deactivating ? "Desactivar" : "Activar",
      confirmAction: "toggle-user-status",
      id: button.dataset.id,
      danger: deactivating
    };
    render();
  } else if (action === "confirm-action") {
    await performConfirmedAction(button);
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;
  clearFormError(form);
  if (!form.reportValidity()) return;
  setFormBusy(form, true);

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
    } else if (type === "bulk-edit") {
      const changes = {};
      ["estatus", "hotel", "area", "departamento", "responsable"].forEach((field) => {
        if (String(data[field] || "").trim()) changes[field] = data[field];
      });
      if (data.clear_responsable === "Sí") changes.responsable = "";
      if (!Object.keys(changes).length) throw new Error("Indica al menos un dato para actualizar.");
      const items = getSelectedInventory().map((row) => ({ id: row.id, actualizado_el: row.actualizado_el }));
      await api("/api/inventory/bulk", { method: "PUT", body: JSON.stringify({ items, changes, motivo: data.motivo }) });
      state.selectedInventoryIds = [];
      state.modal = null;
      await loadBootstrap();
      showToast(`${items.length} datafonos actualizados.`, "success");
    } else if (type === "resguardo") {
      generateResguardoPdf(data, getSelectedInventory());
      state.selectedInventoryIds = [];
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
    showFormError(form, error.message);
    if (error.status === 409) {
      showToast("Los datos cambiaron. Actualiza antes de intentarlo nuevamente.", "error");
    }
  } finally {
    if (document.body.contains(form)) setFormBusy(form, false);
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
  const modalForm = target.closest(".modal form");
  if (modalForm) modalForm.dataset.dirty = "true";
  if (action === "select-row") {
    setInventorySelected(target.dataset.id, target.checked);
    syncRowSelection(target.dataset.id, target.checked);
    refreshInventorySelectionUi();
  } else if (action === "select-visible") {
    getFilteredInventory().forEach((row) => setInventorySelected(row.id, target.checked));
    refreshInventoryResults();
  } else if (action === "history-user") {
    state.historyUser = target.value;
    refreshHistoryResults();
  } else if (action === "history-date-from") {
    state.historyDateFrom = target.value;
    refreshHistoryResults();
  } else if (action === "history-date-to") {
    state.historyDateTo = target.value;
    refreshHistoryResults();
  } else if (target.name === "estatus" && target.closest('form[data-form="status"]')) {
    const substitute = target.form.elements.sustituido_por;
    if (substitute) {
      substitute.disabled = target.value !== "Sustituido";
      substitute.required = target.value === "Sustituido";
    }
    const confirmation = target.form.querySelector(".sensitive-confirm");
    const checkbox = confirmation?.querySelector("input");
    const sensitive = ["Sustituido", "Decomisado", "Baja"].includes(target.value);
    if (confirmation && checkbox) {
      confirmation.hidden = !sensitive;
      checkbox.disabled = !sensitive;
      checkbox.required = sensitive;
      if (!sensitive) checkbox.checked = false;
    }
  } else if (action === "toggle-filter-all") {
    setFilterValuesChecked(menu, target.checked, getCurrentFilterSearch(menu) ? isFilterValueVisibleForSearch : () => true);
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
  const modalForm = target.closest(".modal form");
  if (modalForm) modalForm.dataset.dirty = "true";
  if (target.dataset.action === "filter-search") {
    state.filterSearch = target.value;
    updateFilterMenuSearch(target.closest(".filter-menu"), target.value);
  } else if (target.dataset.action === "inventory-search") {
    state.inventorySearch = target.value;
    refreshInventoryResults();
  } else if (target.dataset.action === "history-search") {
    state.historySearch = target.value;
    refreshHistoryResults();
  }
}

function openModal(type, id) {
  if (type === "resguardo" && !getSelectedInventory().length) {
    showToast("Selecciona al menos un datafono para generar el resguardo.", "error");
    return;
  }
  if (type === "register" || type === "resguardo" || type === "bulk-edit" || type === "user-create") {
    state.modal = { type };
  } else if (type === "user-edit" || type === "user-password") {
    const user = state.users.find((item) => item.usuario === id);
    state.modal = user ? { type, user } : null;
  }
  state.actionMenu = null;
  state.filterMenu = null;
  render();
}

function closeModal() {
  const dirtyForm = document.querySelector('.modal form[data-dirty="true"]');
  if (dirtyForm && !window.confirm("Tienes cambios sin guardar. ¿Quieres cerrar esta ventana?")) return;
  state.modal = null;
  render();
}

async function performConfirmedAction(button) {
  const action = button.dataset.confirmAction;
  button.disabled = true;
  try {
    if (action === "toggle-user-status") {
      await submitApi(`/api/users/${encodeURIComponent(button.dataset.id)}/status`, { method: "PUT" }, "Estado del usuario actualizado.");
    }
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
  }
}

function getFilteredInventory() {
  let rows = [...state.inventory];
  const search = normalizeSearchText(state.inventorySearch);
  if (search) {
    rows = rows.filter((row) => INVENTORY_COLUMNS.some(([key]) => normalizeSearchText(row[key]).includes(search)));
  }
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
  if (state.historyUser) rows = rows.filter((row) => row.usuario === state.historyUser);
  if (state.historyDateFrom) rows = rows.filter((row) => historyDateValue(row) >= state.historyDateFrom);
  if (state.historyDateTo) rows = rows.filter((row) => historyDateValue(row) <= state.historyDateTo);
  return rows;
}

function getSelectedInventory() {
  return state.selectedInventoryIds
    .map((id) => state.inventory.find((row) => row.id === id))
    .filter(Boolean);
}

function setInventorySelected(id, selected) {
  if (!id) return;
  const ids = new Set(state.selectedInventoryIds);
  if (selected) ids.add(id);
  else ids.delete(id);
  state.selectedInventoryIds = Array.from(ids);
}

function refreshInventoryResults() {
  const host = document.querySelector(".inventory-results");
  if (!host) return;
  const rows = getFilteredInventory();
  host.innerHTML = renderInventoryTable(rows);
  const count = document.querySelector(".inventory-count");
  if (count) count.textContent = `${rows.length} de ${state.inventory.length}`;
  const filters = document.querySelector(".active-filters");
  if (filters) filters.innerHTML = renderActiveFilterChips();
  const clearButton = document.querySelector('[data-action="clear-all-filters"]');
  if (clearButton) clearButton.disabled = !hasAnyInventoryConstraint();
  const exportButton = document.querySelector('[data-action="export-excel"]');
  if (exportButton) exportButton.disabled = !rows.length;
  syncSelectionHeader();
}

function refreshInventorySelectionUi() {
  const host = document.querySelector(".selection-host");
  if (host) host.innerHTML = renderSelectionBar();
  syncSelectionHeader();
}

function syncSelectionHeader() {
  const headers = Array.from(document.querySelectorAll('input[data-action="select-visible"]'));
  if (!headers.length) return;
  const rows = getFilteredInventory();
  const count = rows.filter((row) => state.selectedInventoryIds.includes(row.id)).length;
  headers.forEach((header) => {
    header.checked = rows.length > 0 && count === rows.length;
    header.indeterminate = count > 0 && count < rows.length;
  });
}

function syncRowSelection(id, selected) {
  document.querySelectorAll('input[data-action="select-row"]').forEach((input) => {
    if (input.dataset.id !== id) return;
    input.checked = selected;
    input.closest("tr")?.classList.toggle("selected", selected);
    input.closest(".inventory-mobile-card")?.classList.toggle("selected", selected);
  });
}

function refreshHistoryResults() {
  const body = document.querySelector("[data-history-body]");
  if (!body) return;
  const rows = getFilteredHistory();
  body.innerHTML = renderHistoryRows(rows);
  const count = document.querySelector(".history-count strong");
  if (count) count.textContent = String(rows.length);
  const exportButton = document.querySelector('[data-action="export-history"]');
  if (exportButton) exportButton.disabled = !rows.length;
}

function historyDateValue(row) {
  return String(row.fecha_hora || row.fecha || "").slice(0, 10);
}

function clearInventoryConstraints() {
  state.inventorySearch = "";
  state.inventoryFilters = {};
  state.inventorySort = null;
}

function hasAnyInventoryConstraint() {
  return Boolean(state.inventorySearch || Object.keys(state.inventoryFilters).length || state.inventorySort);
}

function applyInventoryPreset(preset) {
  state.inventorySearch = "";
  state.inventorySort = null;
  if (preset === "repair") state.inventoryFilters = { estatus: ["En reparación"] };
  else if (preset === "unassigned") state.inventoryFilters = { responsable: [""] };
  else if (preset === "out") state.inventoryFilters = { estatus: ["Decomisado", "Baja"] };
  else state.inventoryFilters = {};
  render();
}

function isFilterActive(column) {
  return hasInventoryFilter(column) || state.inventorySort?.column === column;
}

function inventoryColumnClass(column) {
  if (column === "numero_terminal") return "terminal-column";
  if (column === "estatus") return "status-column";
  return "";
}

function sortIndicator(column) {
  if (state.inventorySort?.column !== column) return `<span class="sort-indicator" aria-hidden="true">↕</span>`;
  return `<span class="sort-indicator active" aria-hidden="true">${state.inventorySort.dir === "asc" ? "↑" : "↓"}</span>`;
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
  const valueInputs = Array.from(menu.querySelectorAll('input[data-action="toggle-filter-value"]'));
  const selectableInputs = getCurrentFilterSearch(menu)
    ? valueInputs.filter(isFilterValueVisibleForSearch)
    : valueInputs;
  const selected = selectableInputs
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

function getCurrentFilterSearch(menu) {
  return normalizeSearchText(menu?.querySelector('input[data-action="filter-search"]')?.value || state.filterSearch);
}

function isFilterValueVisibleForSearch(input) {
  const choice = input.closest(".filter-choice");
  return !choice || !choice.closest(".search-hidden");
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

function metric(label, value, caption = "", statuses = [], targetView = "inventory") {
  return `
    <button class="metric" data-action="${targetView === "history" ? "nav" : "open-inventory-filter"}" ${targetView === "history" ? 'data-view="history"' : `data-statuses="${escapeAttr(statuses.join("|"))}"`}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${caption ? `<small>${escapeHtml(caption)}</small>` : ""}
      <em aria-hidden="true">→</em>
    </button>
  `;
}

function miniStat(label, value, detail, statuses = [], targetView = "inventory") {
  return `
    <button class="mini-stat" data-action="${targetView === "history" ? "nav" : "open-inventory-filter"}" ${targetView === "history" ? 'data-view="history"' : `data-statuses="${escapeAttr(statuses.join("|"))}"`}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </button>
  `;
}

function operationalAlert(label, statuses) {
  const rows = state.inventory.filter((row) => statuses.includes(row.estatus));
  const withoutResponsible = rows.filter((row) => !String(row.responsable || "").trim()).length;
  const oldest = rows
    .map((row) => row.fecha_cambio || row.fecha_asignacion)
    .filter(Boolean)
    .sort()[0];
  const detail = withoutResponsible
    ? `${withoutResponsible} sin responsable asignado`
    : oldest
      ? `Seguimiento desde ${formatShortDate(oldest)}`
      : "Requiere seguimiento operativo";
  return { label, statuses, value: rows.length, detail };
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
  const safeTotal = total || items.reduce((sum, [, value]) => sum + value, 0);
  const segments = items.map(([label, value], index) => {
    const start = current;
    const size = safeTotal ? (value / safeTotal) * 100 : 0;
    current += size;
    return `${dashboardColor(label, index)} ${start}% ${current}%`;
  });
  return `
    <div class="status-overview">
      <div class="pie-wrap">
        <div class="pie-chart" role="img" aria-label="Distribución de ${safeTotal} datafonos por estatus" style="background:conic-gradient(${segments.join(", ")})"></div>
        <div class="pie-caption">
          <strong>${safeTotal}</strong>
          <span>datafonos</span>
        </div>
      </div>
      <div class="status-legend">
        ${items.map(([label, value], index) => `
          <div>
            <i style="background:${dashboardColor(label, index)}"></i>
            <span>${escapeHtml(label || "Sin valor")}</span>
            <strong>${value}</strong>
            <small>${safeTotal ? Math.round((value / safeTotal) * 100) : 0}%</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAlertList(items) {
  return `
    <div class="alert-list">
      ${items.map((item, index) => `
        <button class="alert-item" data-action="open-inventory-filter" data-statuses="${escapeAttr(item.statuses.join("|"))}">
          <i style="background:${dashboardColor(item.label, index + 2)}"></i>
          <div>
            <strong>${escapeHtml(item.value)}</strong>
            <span>${escapeHtml(item.label)}</span>
            <small>${escapeHtml(item.detail)}</small>
          </div>
          <span class="alert-arrow" aria-hidden="true">→</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderBars(items, options = {}) {
  if (!items.length) return `<p class="muted">Sin datos.</p>`;
  const limit = options.limit || 10;
  const rows = items.slice(0, limit);
  const max = Math.max(...items.map(([, value]) => value));
  return `<div class="chart-list ${options.large ? "chart-list-large" : ""}">${rows.map(([label, value]) => `
    <div class="bar-row" style="--bar-color:${dashboardColor(label)}">
      <span>${escapeHtml(label)}</span>
      <div class="bar" role="img" aria-label="${escapeAttr(label)}: ${value}"><span style="width:${Math.max(4, (value / max) * 100)}%"></span></div>
      <strong>${value}</strong>
      ${options.large ? `<small>${Math.round((value / max) * 100)}%</small>` : ""}
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
  toast.setAttribute("role", state.toast.type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", state.toast.type === "error" ? "assertive" : "polite");
  toast.textContent = state.toast.message;
  document.body.appendChild(toast);
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    if (busy) {
      control.dataset.wasDisabled = String(control.disabled);
      control.disabled = true;
    } else {
      control.disabled = control.dataset.wasDisabled === "true";
      delete control.dataset.wasDisabled;
    }
  });
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;
  if (busy) {
    submit.dataset.originalText = submit.textContent;
    submit.textContent = submit.dataset.busyLabel || "Procesando…";
    submit.classList.add("busy");
  } else {
    submit.textContent = submit.dataset.originalText || submit.textContent;
    submit.classList.remove("busy");
  }
}

function showFormError(form, message) {
  const region = form.querySelector(".form-error");
  if (!region) {
    showToast(message, "error");
    return;
  }
  region.textContent = message;
  region.hidden = false;
  region.focus?.();
}

function clearFormError(form) {
  const region = form.querySelector(".form-error");
  if (!region) return;
  region.hidden = true;
  region.textContent = "";
}

function togglePasswordVisibility(button) {
  const input = button.closest(".password-field")?.querySelector('input[name="clave"]');
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.textContent = visible ? "Mostrar" : "Ocultar";
  button.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
}

function focusActiveDialog() {
  if (!state.modal) return;
  queueMicrotask(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const preferred = dialog?.querySelector("input:not([type=hidden]):not(:disabled), select:not(:disabled), button:not(:disabled)");
    (preferred || dialog)?.focus();
  });
}

function trapDialogFocus(event) {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function formatSyncTime(value) {
  if (!value) return "Pendiente";
  const date = new Date(String(value).replace(" ", "T") + "-04:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

function formatShortDate(value) {
  const text = String(value || "").slice(0, 10);
  const date = new Date(`${text}T12:00:00-04:00`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function slugify(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dialog";
}

function exportExcel(name, rows, columns) {
  if (!rows.length) {
    showToast("No hay datos para exportar.", "error");
    return;
  }
  const sheetRows = [
    columns.map(([, label]) => label),
    ...rows.map((row) => columns.map(([key]) => row[key] ?? ""))
  ];
  const workbook = buildXlsx(sheetRows, columns.map(([, label]) => label));
  downloadBlob(`${name}_${todayIso()}.xlsx`, new Blob([workbook], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }));
  showToast(`${rows.length} filas exportadas en XLSX.`, "success");
}

function buildXlsx(rows, headers) {
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols>${headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(34, Math.max(12, String(header).length + 4))}" customWidth="1"/>`).join("")}</cols>
      <sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
        const ref = `${xlsxColumnName(columnIndex + 1)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join("")}</row>`).join("")}</sheetData>
      <autoFilter ref="A1:${xlsxColumnName(headers.length)}${rows.length}"/>
    </worksheet>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F3440"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXml
  };
  return zipStore(files);
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(files).forEach(([filename, content]) => {
    const name = encoder.encode(filename);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = concatBytes(
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name
    );
    localParts.push(localHeader, data);
    const centralHeader = concatBytes(
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0),
      uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name
    );
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });
  const central = concatBytes(...centralParts);
  const end = concatBytes(
    uint32(0x06054b50), uint16(0), uint16(0), uint16(centralParts.length), uint16(centralParts.length),
    uint32(central.length), uint32(offset), uint16(0)
  );
  return concatBytes(...localParts, central, end);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function uint32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function xlsxColumnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

function generateResguardoPdf(form, rows) {
  if (!rows.length) {
    showToast("No hay datáfonos filtrados para generar el resguardo.", "error");
    return;
  }
  const pdf = new SimplePdf();
  const title = "CARTA DE RESGUARDO DE DATÁFONOS";
  const dateText = formatDate(todayIso());
  const margin = 42;
  const pageTop = 565;
  const pageBottom = 40;
  const contentWidth = pdf.width - (margin * 2);
  const bodyText = "Por medio de la presente se deja constancia de que la persona indicada en este documento recibe en calidad de resguardo los datáfonos detallados más adelante, los cuales serán utilizados exclusivamente para fines operativos de la empresa. La persona responsable se compromete a custodiar dichos equipos, utilizarlos de forma adecuada, mantenerlos en buen estado y reportar oportunamente cualquier cambio, pérdida, daño, traslado o devolución.";
  const tableColumns = [
    ["numero_terminal", "Terminal", 62],
    ["numero_afiliado", "Afiliado", 88],
    ["hotel", "Hotel", 82],
    ["area", "Área", 70],
    ["departamento", "Departamento", 104],
    ["estatus", "Estatus", 67],
    ["fecha_asignacion", "Fecha asignación", 92],
    ["observacion", "Observación", 137]
  ];

  const startPage = () => {
    pdf.addPage();
    pdf.text(title, pdf.width / 2, pageTop, 16, "bold", "center", "#0f172a");
    pdf.text(`Santo Domingo, ${dateText}`, pdf.width - margin, 532, 10, "normal", "right", "#334155");
    return pdf.wrapText(bodyText, margin, 504, contentWidth, 9.6, 13, {
      align: "justify",
      color: "#111827"
    }) - 14;
  };

  const drawResponsibleTable = (y) => {
    const data = [
      ["Tipo de documento", cleanPdfValue(form.tipo_documento), "Documento", cleanPdfValue(form.numero_documento)],
      ["Responsable", cleanPdfValue(form.nombre_responsable), "Puesto", cleanPdfValue(form.puesto_responsable)],
      ["Fecha de resguardo", dateText, "Observación", cleanPdfValue(form.observacion_resguardo)]
    ];
    return pdf.drawKeyValueTable(data, margin, y, [118, 200, 110, 274]);
  };

  const drawTableHeader = (y) => {
    let x = margin;
    const headerHeight = 22;
    tableColumns.forEach(([, label, width]) => {
      pdf.rect(x, y - headerHeight, width, headerHeight, { fill: "#0f172a", stroke: "#0f172a" });
      pdf.text(label, x + 5, y - 14, 7.2, "bold", "left", "#ffffff");
      x += width;
    });
    return y - headerHeight;
  };

  const drawInventoryRow = (row, index, y) => {
    const paddingX = 5;
    const paddingTop = 5;
    const paddingBottom = 4;
    const lineHeight = 8.6;
    const cellLines = tableColumns.map(([key, , width]) => (
      pdf.splitText(cleanPdfValue(row[key]), width - (paddingX * 2), 7.2, key === "observacion" ? 4 : 2)
    ));
    const rowHeight = Math.max(19, paddingTop + paddingBottom + (Math.max(...cellLines.map((lines) => lines.length)) * lineHeight));
    if (y - rowHeight < pageBottom) {
      pdf.addPage();
      y = pageTop;
      y = drawTableHeader(y);
    }
    const fill = index % 2 === 0 ? "#ffffff" : "#f8fafc";
    let x = margin;
    tableColumns.forEach(([, , width], colIndex) => {
      pdf.rect(x, y - rowHeight, width, rowHeight, { fill, stroke: "#cbd5e1", lineWidth: 0.35 });
      cellLines[colIndex].forEach((line, lineIndex) => {
        pdf.text(line, x + paddingX, y - paddingTop - 7 - (lineIndex * lineHeight), 7.2, "normal", "left", "#0f172a");
      });
      x += width;
    });
    return y - rowHeight;
  };

  const drawSignatures = (y) => {
    const needed = 106;
    if (y - needed < pageBottom) {
      pdf.addPage();
      y = pageTop;
    }
    y -= 18;
    pdf.text("Firmas", pdf.width / 2, y, 14, "bold", "center", "#0f172a");
    y -= 42;
    const centers = [250, 542];
    const labels = [
      ["Responsable", cleanPdfValue(form.nombre_responsable) || "Nombre y firma", ""],
      ["Entregado por", cleanPdfValue(form.nombre_entrega) || "Nombre y firma", "Auditoría / Administración"]
    ];
    centers.forEach((center, index) => {
      pdf.line(center - 96, y, center + 96, y, "#0f172a", 0.8);
      pdf.text(labels[index][0], center, y - 16, 9, "bold", "center", "#111827");
      pdf.text(labels[index][1], center, y - 30, 8.5, "normal", "center", "#334155");
      if (labels[index][2]) pdf.text(labels[index][2], center, y - 43, 8, "normal", "center", "#64748b");
    });
  };

  let y = startPage();
  pdf.text(`Cantidad de datáfonos incluidos: ${rows.length}`, margin, y, 11, "bold", "left", "#0f172a");
  y -= 18;
  y = drawResponsibleTable(y);
  y -= 14;
  y = drawTableHeader(y);
  rows.forEach((row, index) => {
    y = drawInventoryRow(row, index, y);
  });
  drawSignatures(y);
  downloadBlob(`resguardo_datafonos_filtrados_${todayIso()}.pdf`, pdf.blob());
}

class SimplePdf {
  constructor() {
    this.width = 792;
    this.height = 612;
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
  setFillColor(color) {
    const [r, g, b] = pdfColor(color);
    this.current.push(`${r} ${g} ${b} rg`);
  }
  setStrokeColor(color) {
    const [r, g, b] = pdfColor(color);
    this.current.push(`${r} ${g} ${b} RG`);
  }
  text(value, x, y, size = 10, weight = "normal", align = "left", color = "#000000") {
    const safe = cleanPdfValue(value);
    if (!safe) return;
    const drawX = align === "center"
      ? x - (this.textWidth(safe, size, weight) / 2)
      : align === "right"
        ? x - this.textWidth(safe, size, weight)
        : x;
    this.setFillColor(color);
    this.current.push(`BT /${this.fontName(weight)} ${round(size)} Tf 1 0 0 1 ${round(drawX)} ${round(y)} Tm <${winAnsiHex(safe)}> Tj ET`);
  }
  textWidth(value, size = 10, weight = "normal") {
    const ratio = weight === "bold" ? 0.53 : 0.5;
    return String(value || "").length * size * ratio;
  }
  splitText(value, width, size = 10, maxLines = Infinity) {
    const text = cleanPdfValue(value);
    if (!text) return [""];
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (this.textWidth(candidate, size) <= width) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      line = word;
      while (this.textWidth(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && this.textWidth(`${line.slice(0, cut)}...`, size) > width) cut -= 1;
        lines.push(`${line.slice(0, cut)}...`);
        line = line.slice(cut);
      }
    });
    if (line) lines.push(line);
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = truncateToWidth(`${clipped[maxLines - 1]}...`, width, size, this);
    return clipped;
  }
  wrapText(value, x, y, width, size = 10, leading = 13, options = {}) {
    const lines = this.splitText(value, width, size);
    lines.forEach((line) => {
      this.text(line, x, y, size, options.weight || "normal", options.align || "left", options.color || "#000000");
      y -= leading;
    });
    return y;
  }
  rect(x, y, w, h, options = {}) {
    const fill = options.fill || null;
    const stroke = options.stroke || "#cbd5e1";
    const lineWidth = options.lineWidth ?? 0.5;
    this.current.push(`${round(lineWidth)} w`);
    if (fill) {
      this.setFillColor(fill);
      if (stroke) {
        this.setStrokeColor(stroke);
        this.current.push(`${round(x)} ${round(y)} ${round(w)} ${round(h)} re B`);
      } else {
        this.current.push(`${round(x)} ${round(y)} ${round(w)} ${round(h)} re f`);
      }
    } else {
      this.setStrokeColor(stroke);
      this.current.push(`${round(x)} ${round(y)} ${round(w)} ${round(h)} re S`);
    }
  }
  line(x1, y1, x2, y2, color = "#000000", lineWidth = 0.8) {
    this.setStrokeColor(color);
    this.current.push(`${round(lineWidth)} w ${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
  }
  drawKeyValueTable(rows, x, y, widths) {
    const rowHeight = 24;
    rows.forEach((row) => {
      let cx = x;
      row.forEach((value, index) => {
        const isLabel = index % 2 === 0;
        this.rect(cx, y - rowHeight, widths[index], rowHeight, {
          fill: isLabel ? "#f1f5f9" : "#ffffff",
          stroke: "#cbd5e1",
          lineWidth: 0.45
        });
        const lines = this.splitText(value, widths[index] - 12, 8.4, 2);
        lines.forEach((line, lineIndex) => {
          this.text(line, cx + 6, y - 10 - (lineIndex * 9.2), 8.3, isLabel ? "bold" : "normal", "left", isLabel ? "#0f172a" : "#111827");
        });
        cx += widths[index];
      });
      y -= rowHeight;
    });
    return y;
  }
  blob() {
    const objects = [];
    const add = (content) => {
      objects.push(content);
      return objects.length;
    };
    const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesPlaceholderId = add("");
    const font1Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const font2Id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds = [];
    this.pages.forEach((commands) => {
      const stream = commands.join("\n");
      const contentId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent ${pagesPlaceholderId} 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

function cleanPdfValue(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return String(value).replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ").trim();
}

function pdfColor(color) {
  const clean = String(color || "#000000").replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((item) => item + item).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((index) => round(parseInt(value.slice(index, index + 2), 16) / 255));
}

function truncateToWidth(value, width, size, pdf) {
  let text = cleanPdfValue(value);
  while (text.length > 1 && pdf.textWidth(text, size) > width) {
    text = `${text.slice(0, -4)}...`;
  }
  return text;
}

function winAnsiHex(value) {
  const extra = {
    "€": 0x80,
    "‚": 0x82,
    "ƒ": 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    "ˆ": 0x88,
    "‰": 0x89,
    "Š": 0x8a,
    "‹": 0x8b,
    "Œ": 0x8c,
    "Ž": 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "™": 0x99,
    "š": 0x9a,
    "›": 0x9b,
    "œ": 0x9c,
    "ž": 0x9e,
    "Ÿ": 0x9f
  };
  const bytes = [];
  for (const char of cleanPdfValue(value)) {
    const code = char.charCodeAt(0);
    if (extra[char]) bytes.push(extra[char]);
    else if (code <= 0xff) bytes.push(code);
    else bytes.push(0x3f);
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
