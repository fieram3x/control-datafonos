const INVENTARIO_COLUMNS = [
  "id", "numero_terminal", "numero_afiliado", "hotel", "area", "departamento",
  "responsable", "estatus", "fecha_asignacion", "fecha_cambio", "sustituido_por",
  "observacion", "creado_el", "actualizado_el"
];

const HISTORIAL_COLUMNS = [
  "id_movimiento", "fecha", "terminal_anterior", "terminal_nueva", "hotel", "area",
  "departamento", "estatus_anterior", "estatus_nuevo", "motivo", "responsable", "observacion",
  "fecha_hora", "usuario"
];

const USUARIOS_COLUMNS = ["usuario", "clave", "rol", "activo"];
const PASSWORD_PREFIX = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 100000;
const SESSION_COOKIE = "datafonos_session";
const SESSION_MAX_AGE = 60 * 60 * 8;

const CONFIG_DEFAULT = {
  Hoteles: ["5918-MCB", "5917-MPCB", "5910-PPRL", "5911-ZEL", "5930-PGC", "6034-GOLF Hoyo 10&9", "6254-TENNIS", "6374-CASINO"],
  Departamentos: ["Recepción", "Spa", "A&B", "Hoyo 10&9", "Golf", "Tenis", "Casino", "Administración", "Auditoría", "Otro"],
  Estatus: ["Activo", "Resguardo", "En reparación", "Sustituido", "Decomisado", "Baja"],
  Roles: ["Administrador", "Usuario"],
  Activo: ["Sí", "No"],
  Areas: ["Operación", "Administración"]
};

const SHEETS = {
  Inventario: INVENTARIO_COLUMNS,
  Historial: HISTORIAL_COLUMNS,
  Usuarios: USUARIOS_COLUMNS
};

const googleTokenCache = {
  token: "",
  expiresAt: 0
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (error) {
        if (error instanceof ApiError) {
          return json({ error: error.message }, error.status);
        }
        console.error(error);
        return json({ error: "Error interno del servidor." }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, ctx, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const path = url.pathname.replace(/^\/api\/?/, "");

  if (path === "login" && request.method === "POST") {
    return login(request, env);
  }
  if (path === "logout" && request.method === "POST") {
    return logout(request);
  }
  if (path === "session" && request.method === "GET") {
    const session = await getSession(request, env);
    return json({ session });
  }

  const session = await requireSession(request, env);

  if (path === "bootstrap" && request.method === "GET") {
    const [config, inventory, history] = await Promise.all([
      readConfig(env),
      readSheet(env, "Inventario", INVENTARIO_COLUMNS),
      readSheet(env, "Historial", HISTORIAL_COLUMNS)
    ]);
    const users = session.rol === "Administrador" ? await getUsers(env) : [];
    return json({
      session,
      config,
      inventory,
      history,
      users: sanitizeUsers(users),
      synced_at: nowStamp()
    });
  }

  if (path === "inventory" && request.method === "GET") {
    return json({ inventory: await readSheet(env, "Inventario", INVENTARIO_COLUMNS) });
  }
  if (path === "inventory" && request.method === "POST") {
    return createInventory(request, env, session);
  }
  if (path === "inventory/bulk" && request.method === "PUT") {
    return updateInventoryBulk(request, env, session);
  }

  const inventoryStatusMatch = path.match(/^inventory\/([^/]+)\/status$/);
  if (inventoryStatusMatch && request.method === "PUT") {
    return updateInventoryStatus(request, env, session, decodeURIComponent(inventoryStatusMatch[1]));
  }

  const inventoryMatch = path.match(/^inventory\/([^/]+)$/);
  if (inventoryMatch && request.method === "PUT") {
    return updateInventoryData(request, env, session, decodeURIComponent(inventoryMatch[1]));
  }

  if (path === "history" && request.method === "GET") {
    return json({ history: await readSheet(env, "Historial", HISTORIAL_COLUMNS) });
  }

  if (path === "config" && request.method === "GET") {
    return json({ config: await readConfig(env) });
  }

  if (path === "users" && request.method === "GET") {
    requireAdmin(session);
    return json({ users: sanitizeUsers(await getUsers(env)) });
  }
  if (path === "users" && request.method === "POST") {
    requireAdmin(session);
    return createUser(request, env);
  }

  const userPasswordMatch = path.match(/^users\/([^/]+)\/password$/);
  if (userPasswordMatch && request.method === "PUT") {
    requireAdmin(session);
    return changeUserPassword(request, env, decodeURIComponent(userPasswordMatch[1]));
  }

  const userStatusMatch = path.match(/^users\/([^/]+)\/status$/);
  if (userStatusMatch && request.method === "PUT") {
    requireAdmin(session);
    return changeUserStatus(request, env, decodeURIComponent(userStatusMatch[1]), session);
  }

  const userMatch = path.match(/^users\/([^/]+)$/);
  if (userMatch && request.method === "PUT") {
    requireAdmin(session);
    return updateUser(request, env, decodeURIComponent(userMatch[1]), session);
  }

  return json({ error: "Ruta no encontrada." }, 404);
}

async function login(request, env) {
  const { usuario = "", clave = "" } = await readJson(request);
  const username = normalizeText(usuario);
  const password = String(clave || "");

  if (!username || !password) {
    return json({ error: "Digite usuario y contraseña." }, 400);
  }

  const users = await getUsers(env);
  const user = users.find((item) => item.usuario === username && item.activo === "Sí");
  if (!user || !(await verifyPassword(password, user.clave))) {
    return json({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  if (!isPasswordHash(user.clave)) {
    const updated = { ...user, clave: await makePasswordHash(password) };
    await updateSheetRow(env, "Usuarios", USUARIOS_COLUMNS, "usuario", username, updated);
  }

  const session = { usuario: user.usuario, rol: user.rol };
  const token = await signSession(session, env);
  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.append("Set-Cookie", serializeSessionCookie(token, request));
  return new Response(JSON.stringify({ session }), { headers });
}

function logout(request) {
  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.append("Set-Cookie", clearSessionCookie(request));
  return new Response(JSON.stringify({ ok: true }), { headers });
}

async function createInventory(request, env, session) {
  const body = await readJson(request);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const numeroTerminal = normalizeTerminal(body.numero_terminal);
  const numeroAfiliado = normalizeTerminal(body.numero_afiliado);
  const validation = validateTerminalFields(numeroTerminal, numeroAfiliado);
  if (validation) return json({ error: validation }, 400);

  const required = ["hotel", "area", "departamento", "estatus"];
  for (const field of required) {
    if (!normalizeText(body[field])) {
      return json({ error: "Completa los campos obligatorios." }, 400);
    }
  }

  const inventory = await readSheet(env, "Inventario", INVENTARIO_COLUMNS);
  if (inventory.some((row) => normalizeTerminal(row.numero_terminal) === numeroTerminal)) {
    return json({ error: "Ese número de terminal ya existe en el inventario." }, 409);
  }

  const row = {
    id: crypto.randomUUID().slice(0, 8),
    numero_terminal: numeroTerminal,
    numero_afiliado: numeroAfiliado,
    hotel: normalizeText(body.hotel),
    area: normalizeText(body.area),
    departamento: normalizeText(body.departamento),
    responsable: normalizeText(body.responsable),
    estatus: normalizeText(body.estatus),
    fecha_asignacion: normalizeText(body.fecha_asignacion) || todayIso(),
    fecha_cambio: "",
    sustituido_por: "",
    observacion: normalizeText(body.observacion),
    creado_el: now,
    actualizado_el: now
  };

  await appendSheetRow(env, "Inventario", row, INVENTARIO_COLUMNS);
  await addHistory(env, {
    terminal_anterior: row.numero_terminal,
    terminal_nueva: "",
    hotel: row.hotel,
    area: row.area,
    departamento: row.departamento,
    estatus_anterior: "",
    estatus_nuevo: row.estatus,
    motivo: "Registro inicial",
    responsable: row.responsable,
    observacion: row.observacion
  }, session);
  return json({ row });
}

async function updateInventoryStatus(request, env, session, id) {
  const body = await readJson(request);
  const inventory = await readSheet(env, "Inventario", INVENTARIO_COLUMNS);
  const row = inventory.find((item) => String(item.id) === String(id));
  if (!row) return json({ error: "La terminal seleccionada ya no existe." }, 404);

  const conflict = validateInventoryRevision(body.actualizado_el, row);
  if (conflict) return conflict;

  const nuevoEstatus = normalizeText(body.estatus);
  if (!nuevoEstatus) return json({ error: "Seleccione un estatus." }, 400);
  const sustituidoPor = normalizeTerminal(body.sustituido_por);
  if (nuevoEstatus === "Sustituido" && !sustituidoPor) {
    return json({ error: "Indica la terminal que sustituye al equipo." }, 400);
  }
  if (sustituidoPor && sustituidoPor === normalizeTerminal(row.numero_terminal)) {
    return json({ error: "La terminal sustituta debe ser diferente a la terminal actual." }, 400);
  }

  const updated = {
    ...row,
    estatus: nuevoEstatus,
    fecha_cambio: normalizeText(body.fecha_cambio) || todayIso(),
    sustituido_por: nuevoEstatus === "Sustituido" ? sustituidoPor : "",
    observacion: normalizeText(body.observacion),
    actualizado_el: nowStamp()
  };

  await updateSheetRow(env, "Inventario", INVENTARIO_COLUMNS, "id", id, updated);
  await addHistory(env, {
    terminal_anterior: row.numero_terminal,
    terminal_nueva: "",
    hotel: row.hotel,
    area: row.area,
    departamento: row.departamento,
    estatus_anterior: row.estatus,
    estatus_nuevo: nuevoEstatus,
    motivo: normalizeText(body.motivo) || "Actualización de estatus",
    responsable: row.responsable,
    observacion: normalizeText(body.observacion)
  }, session);
  return json({ row: updated });
}

async function updateInventoryData(request, env, session, id) {
  const body = await readJson(request);
  const inventory = await readSheet(env, "Inventario", INVENTARIO_COLUMNS);
  const row = inventory.find((item) => String(item.id) === String(id));
  if (!row) return json({ error: "La terminal seleccionada ya no existe." }, 404);

  const conflict = validateInventoryRevision(body.actualizado_el, row);
  if (conflict) return conflict;

  const numeroTerminal = normalizeTerminal(body.numero_terminal);
  const numeroAfiliado = normalizeTerminal(body.numero_afiliado);
  const validation = validateTerminalFields(numeroTerminal, numeroAfiliado);
  if (validation) return json({ error: validation }, 400);

  const duplicate = inventory.find((item) => String(item.id) !== String(id) && normalizeTerminal(item.numero_terminal) === numeroTerminal);
  if (duplicate) return json({ error: "Ese número de terminal ya existe en el inventario." }, 409);

  const required = ["hotel", "area", "departamento"];
  for (const field of required) {
    if (!normalizeText(body[field])) {
      return json({ error: "Completa los campos obligatorios." }, 400);
    }
  }

  const updated = {
    ...row,
    numero_terminal: numeroTerminal,
    numero_afiliado: numeroAfiliado,
    hotel: normalizeText(body.hotel),
    area: normalizeText(body.area),
    departamento: normalizeText(body.departamento),
    responsable: normalizeText(body.responsable),
    fecha_asignacion: normalizeText(body.fecha_asignacion) || todayIso(),
    observacion: normalizeText(body.observacion),
    actualizado_el: nowStamp()
  };

  await updateSheetRow(env, "Inventario", INVENTARIO_COLUMNS, "id", id, updated);
  await addHistory(env, {
    terminal_anterior: row.numero_terminal,
    terminal_nueva: numeroTerminal !== row.numero_terminal ? numeroTerminal : "",
    hotel: updated.hotel,
    area: updated.area,
    departamento: updated.departamento,
    estatus_anterior: row.estatus,
    estatus_nuevo: row.estatus,
    motivo: "Edición de datos maestros",
    responsable: updated.responsable,
    observacion: updated.observacion
  }, session);
  return json({ row: updated });
}

async function updateInventoryBulk(request, env, session) {
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  const rawChanges = body.changes && typeof body.changes === "object" ? body.changes : {};
  if (!items.length) return json({ error: "Selecciona al menos un datafono." }, 400);

  const allowedFields = ["hotel", "area", "departamento", "responsable", "estatus"];
  const changes = {};
  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(rawChanges, field)) changes[field] = normalizeText(rawChanges[field]);
  });
  if (!Object.keys(changes).length) return json({ error: "Indica al menos un dato para actualizar." }, 400);
  if (changes.estatus === "Sustituido") {
    return json({ error: "El estatus Sustituido debe registrarse individualmente con su terminal sustituta." }, 400);
  }

  const inventory = await readSheet(env, "Inventario", INVENTARIO_COLUMNS);
  const rows = items.map((item) => inventory.find((row) => String(row.id) === String(item.id))).filter(Boolean);
  if (rows.length !== items.length) return json({ error: "Uno o más datafonos ya no existen. Actualiza la vista." }, 409);

  for (const item of items) {
    const row = rows.find((candidate) => String(candidate.id) === String(item.id));
    if (normalizeText(item.actualizado_el) !== normalizeText(row.actualizado_el)) {
      return json({ error: `La terminal ${row.numero_terminal} fue modificada por otra persona. Actualiza la vista.` }, 409);
    }
  }

  const stamp = nowStamp();
  const updatedRows = rows.map((row) => ({
    ...row,
    ...changes,
    fecha_cambio: changes.estatus && changes.estatus !== row.estatus ? todayIso() : row.fecha_cambio,
    sustituido_por: changes.estatus && changes.estatus !== "Sustituido" ? "" : row.sustituido_por,
    actualizado_el: stamp
  }));
  await batchUpdateSheetRows(env, "Inventario", INVENTARIO_COLUMNS, "id", updatedRows);
  const motivo = normalizeText(body.motivo) || "Actualización masiva";
  const historyRows = updatedRows.map((updated, index) => createHistoryRow({
    terminal_anterior: rows[index].numero_terminal,
    terminal_nueva: "",
    hotel: updated.hotel,
    area: updated.area,
    departamento: updated.departamento,
    estatus_anterior: rows[index].estatus,
    estatus_nuevo: updated.estatus,
    motivo,
    responsable: updated.responsable,
    observacion: `Actualización masiva de ${Object.keys(changes).join(", ")}`
  }, session));
  await appendSheetRows(env, "Historial", historyRows, HISTORIAL_COLUMNS);
  return json({ updated: updatedRows.length });
}

async function createUser(request, env) {
  const body = await readJson(request);
  const usuario = normalizeText(body.usuario);
  const clave = String(body.clave || "");
  const rol = normalizeText(body.rol) || "Usuario";
  const activo = normalizeText(body.activo) || "Sí";

  if (!usuario || !clave) return json({ error: "Usuario y contraseña son obligatorios." }, 400);
  if (clave.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);

  const users = await getUsers(env);
  if (users.some((item) => item.usuario === usuario)) {
    return json({ error: "Ese usuario ya existe." }, 409);
  }

  const row = { usuario, clave: await makePasswordHash(clave), rol, activo };
  await appendSheetRow(env, "Usuarios", row, USUARIOS_COLUMNS);
  return json({ user: sanitizeUser(row) });
}

async function updateUser(request, env, usuario, session) {
  const body = await readJson(request);
  const users = await getUsers(env);
  const row = users.find((item) => item.usuario === usuario);
  if (!row) return json({ error: "Usuario no encontrado." }, 404);

  const nuevoUsuario = normalizeText(body.usuario) || usuario;
  if (nuevoUsuario !== usuario && users.some((item) => item.usuario === nuevoUsuario)) {
    return json({ error: "Ese usuario ya existe." }, 409);
  }
  if (row.usuario === session.usuario && nuevoUsuario !== usuario) {
    return json({ error: "No puedes renombrar el usuario de tu sesión actual." }, 400);
  }

  const nextRole = normalizeText(body.rol) || row.rol;
  const nextActive = normalizeText(body.activo) || row.activo;
  if (row.usuario === session.usuario && (nextRole !== "Administrador" || nextActive !== "Sí")) {
    return json({ error: "No puedes quitar tu propio acceso de administrador." }, 400);
  }
  if (row.rol === "Administrador" && row.activo === "Sí" && (nextRole !== "Administrador" || nextActive !== "Sí")) {
    const activeAdmins = users.filter((item) => item.rol === "Administrador" && item.activo === "Sí");
    if (activeAdmins.length <= 1) {
      return json({ error: "Debe permanecer al menos un administrador activo." }, 400);
    }
  }

  const updated = {
    ...row,
    usuario: nuevoUsuario,
    rol: nextRole,
    activo: nextActive
  };
  await updateSheetRow(env, "Usuarios", USUARIOS_COLUMNS, "usuario", usuario, updated);
  return json({ user: sanitizeUser(updated) });
}

async function changeUserPassword(request, env, usuario) {
  const { clave = "" } = await readJson(request);
  const password = String(clave || "");
  if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);

  const users = await getUsers(env);
  const row = users.find((item) => item.usuario === usuario);
  if (!row) return json({ error: "Usuario no encontrado." }, 404);

  const updated = { ...row, clave: await makePasswordHash(password) };
  await updateSheetRow(env, "Usuarios", USUARIOS_COLUMNS, "usuario", usuario, updated);
  return json({ user: sanitizeUser(updated) });
}

async function changeUserStatus(request, env, usuario, session) {
  const users = await getUsers(env);
  const row = users.find((item) => item.usuario === usuario);
  if (!row) return json({ error: "Usuario no encontrado." }, 404);

  if (row.usuario === session.usuario && row.activo === "Sí") {
    return json({ error: "No puedes desactivar tu propia sesión." }, 400);
  }
  if (row.rol === "Administrador" && row.activo === "Sí") {
    const activeAdmins = users.filter((item) => item.rol === "Administrador" && item.activo === "Sí");
    if (activeAdmins.length <= 1) {
      return json({ error: "Debe permanecer al menos un administrador activo." }, 400);
    }
  }

  const updated = { ...row, activo: row.activo === "Sí" ? "No" : "Sí" };
  await updateSheetRow(env, "Usuarios", USUARIOS_COLUMNS, "usuario", usuario, updated);
  return json({ user: sanitizeUser(updated) });
}

async function addHistory(env, values, session = {}) {
  const row = createHistoryRow(values, session);
  await appendSheetRow(env, "Historial", row, HISTORIAL_COLUMNS);
  return row;
}

function createHistoryRow(values, session = {}) {
  return {
    id_movimiento: crypto.randomUUID().slice(0, 8),
    fecha: todayIso(),
    terminal_anterior: normalizeText(values.terminal_anterior),
    terminal_nueva: normalizeText(values.terminal_nueva),
    hotel: normalizeText(values.hotel),
    area: normalizeText(values.area),
    departamento: normalizeText(values.departamento),
    estatus_anterior: normalizeText(values.estatus_anterior),
    estatus_nuevo: normalizeText(values.estatus_nuevo),
    motivo: normalizeText(values.motivo),
    responsable: normalizeText(values.responsable),
    observacion: normalizeText(values.observacion),
    fecha_hora: nowStamp(),
    usuario: normalizeText(session.usuario) || "Sistema"
  };
}

async function getUsers(env) {
  const users = await readSheet(env, "Usuarios", USUARIOS_COLUMNS);
  if (users.length > 0) return users;

  const initialUser = normalizeText(env.APP_INITIAL_ADMIN_USER) || "admin";
  const initialPassword = String(env.APP_INITIAL_ADMIN_PASSWORD || "");
  if (!initialPassword || initialPassword.length < 8) {
    throw new ApiError("No hay usuarios configurados. Define APP_INITIAL_ADMIN_PASSWORD con al menos 8 caracteres.", 500);
  }

  const user = {
    usuario: initialUser,
    clave: await makePasswordHash(initialPassword),
    rol: "Administrador",
    activo: "Sí"
  };
  await appendSheetRow(env, "Usuarios", user, USUARIOS_COLUMNS);
  return [user];
}

async function readConfig(env) {
  try {
    await ensureSheet(env, "Config", Object.keys(CONFIG_DEFAULT));
    const values = await sheetsValuesGet(env, "Config!A:Z");
    if (!values.length) return CONFIG_DEFAULT;

    const headers = values[0].map(normalizeText);
    const config = {};
    headers.forEach((header, colIndex) => {
      if (!header) return;
      config[header] = values.slice(1)
        .map((row) => normalizeText(row[colIndex]))
        .filter(Boolean);
    });

    for (const [key, defaultValues] of Object.entries(CONFIG_DEFAULT)) {
      if (!config[key] || !config[key].length) config[key] = defaultValues;
    }
    return config;
  } catch (error) {
    console.warn("No fue posible leer Config, se usan valores por defecto.", error);
    return CONFIG_DEFAULT;
  }
}

async function readSheet(env, name, columns) {
  await ensureSheet(env, name, columns);
  const values = await sheetsValuesGet(env, `${name}!A:Z`);
  return rowsToObjects(values, columns);
}

async function appendSheetRow(env, name, row, columns) {
  await ensureSheet(env, name, columns);
  const values = columns.map((column) => normalizeText(row[column]));
  await sheetsRequest(env, `/values/${encodeRange(`${name}!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [values] })
  });
}

async function appendSheetRows(env, name, rows, columns) {
  if (!rows.length) return;
  await ensureSheet(env, name, columns);
  const values = rows.map((row) => columns.map((column) => normalizeText(row[column])));
  await sheetsRequest(env, `/values/${encodeRange(`${name}!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values })
  });
}

async function updateSheetRow(env, name, columns, keyColumn, keyValue, rowValues) {
  await ensureSheet(env, name, columns);
  const rowNumber = await findSheetRowNumber(env, name, columns, keyColumn, keyValue);
  if (!rowNumber) return false;
  const endColumn = columnToLetter(columns.length);
  const values = columns.map((column) => normalizeText(rowValues[column]));
  await sheetsRequest(env, `/values/${encodeRange(`${name}!A${rowNumber}:${endColumn}${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [values] })
  });
  return true;
}

async function batchUpdateSheetRows(env, name, columns, keyColumn, rows) {
  await ensureSheet(env, name, columns);
  const values = await sheetsValuesGet(env, `${name}!A:Z`);
  const headers = values[0]?.map(normalizeText) || [];
  const keyIndex = headers.indexOf(keyColumn);
  if (keyIndex < 0) throw new ApiError(`No se encontró la columna ${keyColumn}.`, 500);
  const positions = new Map();
  values.slice(1).forEach((row, index) => positions.set(normalizeText(row[keyIndex]), index + 2));
  const endColumn = columnToLetter(columns.length);
  const data = rows.map((row) => {
    const rowNumber = positions.get(normalizeText(row[keyColumn]));
    if (!rowNumber) throw new ApiError("Uno de los registros seleccionados ya no existe.", 409);
    return {
      range: `${name}!A${rowNumber}:${endColumn}${rowNumber}`,
      values: [columns.map((column) => normalizeText(row[column]))]
    };
  });
  await sheetsRequest(env, "/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
}

async function findSheetRowNumber(env, name, columns, keyColumn, keyValue) {
  const values = await sheetsValuesGet(env, `${name}!A:Z`);
  if (!values.length) return null;

  const headers = values[0].map(normalizeText);
  const keyIndex = headers.indexOf(keyColumn);
  if (keyIndex < 0) return null;

  const wanted = normalizeText(keyValue);
  for (let index = 1; index < values.length; index += 1) {
    if (normalizeText(values[index][keyIndex]) === wanted) return index + 1;
  }
  return null;
}

function rowsToObjects(values, columns) {
  if (!values.length) return [];
  const headers = values[0].map(normalizeText);
  const positions = new Map();
  headers.forEach((header, index) => {
    if (header && !positions.has(header)) positions.set(header, index);
  });

  return values.slice(1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => {
      const item = {};
      columns.forEach((column) => {
        const index = positions.get(column);
        item[column] = index === undefined ? "" : normalizeText(row[index]);
      });
      return item;
    });
}

async function ensureSheet(env, name, columns) {
  const spreadsheet = await sheetsRequest(env, "?fields=sheets.properties(title,sheetId)");
  const sheet = spreadsheet.sheets?.find((item) => item.properties?.title === name);

  if (!sheet) {
    await sheetsRequest(env, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: name,
              gridProperties: {
                rowCount: 1000,
                columnCount: Math.max(20, columns.length)
              }
            }
          }
        }]
      })
    });
  }

  const headerValues = await sheetsValuesGet(env, `${name}!1:1`).catch(() => []);
  const headers = headerValues[0] || [];
  const hasHeaders = headers.some((cell) => normalizeText(cell));
  if (!hasHeaders) {
    await sheetsRequest(env, `/values/${encodeRange(`${name}!A1:${columnToLetter(columns.length)}1`)}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: [columns] })
    });
  } else {
    const normalizedHeaders = headers.map(normalizeText);
    const missingColumns = columns.filter((column) => !normalizedHeaders.includes(column));
    if (missingColumns.length) {
      const start = normalizedHeaders.length + 1;
      const end = normalizedHeaders.length + missingColumns.length;
      await sheetsRequest(env, `/values/${encodeRange(`${name}!${columnToLetter(start)}1:${columnToLetter(end)}1`)}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values: [missingColumns] })
      });
    }
  }
}

async function sheetsValuesGet(env, range) {
  const data = await sheetsRequest(env, `/values/${encodeRange(range)}?majorDimension=ROWS`);
  return data.values || [];
}

async function sheetsRequest(env, path, init = {}) {
  const spreadsheetId = requiredEnv(env, "GOOGLE_SHEET_ID");
  const token = await getGoogleAccessToken(env);
  const prefix = path.startsWith("/") || path.startsWith(":") || path.startsWith("?") ? path : `/${path}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${prefix}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiError(data.error?.message || "No fue posible leer Google Sheets.", response.status);
  }
  return data;
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (googleTokenCache.token && googleTokenCache.expiresAt - 60 > now) {
    return googleTokenCache.token;
  }

  const clientEmail = requiredEnv(env, "GOOGLE_CLIENT_EMAIL");
  const privateKey = requiredEnv(env, "GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const tokenUri = env.GOOGLE_TOKEN_URI || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await signRs256(unsigned, privateKey);
  const jwt = `${unsigned}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error_description || data.error || "Google rechazó la autenticación.", 500);
  }

  googleTokenCache.token = data.access_token;
  googleTokenCache.expiresAt = now + Number(data.expires_in || 3600);
  return googleTokenCache.token;
}

async function signRs256(input, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder().encode(input));
  return base64UrlBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(base64).buffer;
}

async function signSession(session, env) {
  const payload = {
    usuario: session.usuario,
    rol: session.rol,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  };
  const encoded = base64UrlJson(payload);
  const signature = await hmacSign(encoded, sessionSecret(env));
  return `${encoded}.${signature}`;
}

async function verifySessionToken(token, env) {
  const [payloadPart, signature] = String(token || "").split(".");
  if (!payloadPart || !signature) return null;
  const expected = await hmacSign(payloadPart, sessionSecret(env));
  if (!constantTimeEqual(signature, expected)) return null;

  const payload = JSON.parse(bytesToUtf8(base64UrlToBytes(payloadPart)));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { usuario: payload.usuario, rol: payload.rol };
}

async function hmacSign(input, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder().encode(input));
  return base64UrlBytes(new Uint8Array(signature));
}

async function getSession(request, env) {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, env);
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) throw new ApiError("Sesión expirada. Inicia sesión nuevamente.", 401);
  return session;
}

function requireAdmin(session) {
  if (!session || session.rol !== "Administrador") {
    throw new ApiError("No tienes permiso para esta acción.", 403);
  }
}

function serializeSessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || "").split(";").forEach((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    if (!key) return;
    cookies[key] = valueParts.join("=");
  });
  return cookies;
}

async function makePasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await pbkdf2(password, salt);
  return `${PASSWORD_PREFIX}$${bytesToBase64(salt)}$${bytesToBase64(digest)}`;
}

function isPasswordHash(value) {
  return normalizeText(value).startsWith(`${PASSWORD_PREFIX}$`);
}

async function verifyPassword(password, storedValue) {
  const stored = normalizeText(storedValue);
  if (!isPasswordHash(stored)) {
    return constantTimeEqual(String(password), stored);
  }
  try {
    const [, saltBase64, digestBase64] = stored.split("$");
    const salt = base64ToBytes(saltBase64);
    const expected = base64ToBytes(digestBase64);
    const actual = await pbkdf2(password, salt);
    return bytesEqual(actual, expected);
  } catch {
    return false;
  }
}

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

function validateTerminalFields(terminal, afiliado) {
  if (!terminal || !afiliado) return "Terminal y afiliado son obligatorios.";
  if (!/^[A-Za-z0-9-]{3,30}$/.test(terminal)) return "El número de terminal debe tener 3-30 caracteres alfanuméricos o guiones.";
  if (!/^[A-Za-z0-9-]{3,30}$/.test(afiliado)) return "El número de afiliado debe tener 3-30 caracteres alfanuméricos o guiones.";
  return "";
}

function validateInventoryRevision(clientRevision, currentRow) {
  if (clientRevision === undefined || clientRevision === null) return null;
  const expected = normalizeText(clientRevision);
  const current = normalizeText(currentRow.actualizado_el);
  if (expected === current) return null;
  return json({
    error: "Este datafono fue modificado por otra persona. Actualiza los datos antes de guardar.",
    current: currentRow
  }, 409);
}

function sanitizeUsers(users) {
  return users.map(sanitizeUser);
}

function sanitizeUser(user) {
  return {
    usuario: user.usuario,
    rol: user.rol,
    activo: user.activo
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTerminal(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function nowStamp() {
  const parts = getSantoDomingoParts();
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function todayIso() {
  const parts = getSantoDomingoParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getSantoDomingoParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function columnToLetter(index) {
  let column = "";
  let value = index;
  while (value > 0) {
    const mod = (value - 1) % 26;
    column = String.fromCharCode(65 + mod) + column;
    value = Math.floor((value - mod) / 26);
  }
  return column;
}

function encodeRange(range) {
  return encodeURIComponent(range);
}

function requiredEnv(env, name) {
  const value = normalizeText(env[name]);
  if (!value) throw new ApiError(`Falta configurar ${name}.`, 500);
  return value;
}

function sessionSecret(env) {
  const secret = normalizeText(env.APP_SESSION_SECRET);
  if (!secret || secret.length < 16) {
    throw new ApiError("Falta configurar APP_SESSION_SECRET con al menos 16 caracteres.", 500);
  }
  return secret;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(payload, status = 200) {
  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsHeaders() {
  return {
    "Cache-Control": "no-store"
  };
}

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function encoder() {
  return new TextEncoder();
}

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlJson(value) {
  return base64UrlBytes(encoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

function constantTimeEqual(left, right) {
  const a = encoder().encode(String(left));
  const b = encoder().encode(String(right));
  return bytesEqual(a, b);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a[index] ^ b[index];
  }
  return result === 0;
}
