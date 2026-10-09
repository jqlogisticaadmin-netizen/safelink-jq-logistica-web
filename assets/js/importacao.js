(() => {
  "use strict";
  const state = { file: null, headers: [], rows: [], validRows: [], invalidRows: [], hash: "", bases: [], busy: false };
  const byId = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  function renderShell() {
    const root = byId("importModule"); if (!root) return;
    root.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">SAFELINK · OPERAÇÃO</p><h1>Importação</h1><p class="page-description">Envie uma planilha, confira as colunas e valide os registros antes de qualquer gravação operacional.</p></div><span class="date-chip">Pré-validação</span></div>
      <div class="notice" role="status"><span class="notice-icon">i</span><div><strong>Importação em duas etapas</strong><p>Esta etapa analisa o arquivo no navegador e pode registrar um rascunho de validação. Ainda não grava pacotes nem altera indicadores operacionais.</p></div></div>
      <section class="import-card"><div class="section-heading"><div><h2>1. Arquivo e escopo</h2><p>Arquivos .xlsx, .xls e .csv de até 20 MB; até 10.000 linhas na primeira aba.</p></div></div>
      <div class="import-form-grid"><label class="import-field">Base autorizada<select id="importBase" required><option value="">Carregando bases autorizadas…</option></select></label><label class="import-field">Arquivo da operação<input id="importFile" type="file" accept=".xlsx,.xls,.csv" /></label></div><p class="muted-note" id="importFileNote">Selecione uma base e um arquivo para iniciar a pré-validação.</p></section>
      <section class="import-card" id="importPreviewCard" hidden><div class="section-heading"><div><h2>2. Resultado da validação</h2><p id="importPreviewSummary">Aguardando arquivo.</p></div><span class="panel-label" id="importValidationStatus">AGUARDANDO</span></div>
      <div class="metrics-grid import-metrics"><article class="metric-card"><span>Linhas lidas</span><strong class="metric-value" id="importTotalRows">0</strong></article><article class="metric-card"><span>Válidas</span><strong class="metric-value" id="importValidRows">0</strong></article><article class="metric-card"><span>Com erros</span><strong class="metric-value" id="importInvalidRows">0</strong></article><article class="metric-card"><span>Etiquetas duplicadas</span><strong class="metric-value" id="importDuplicateRows">0</strong></article></div>
      <div class="import-validation-message" id="importValidationMessage" role="status"></div><div class="table-scroll"><table class="import-table"><thead id="importPreviewHead"></thead><tbody id="importPreviewBody"></tbody></table></div>
      <div class="import-actions"><button class="auth-submit import-action" id="saveImportDraft" type="button" disabled>Registrar rascunho de validação</button><button class="signout-button" id="resetImport" type="button">Limpar análise</button></div><p class="muted-note">O rascunho registra apenas metadados, hash e resumo. O conteúdo da planilha não é enviado nem gravado como pacotes nesta etapa.</p></section>
      <section class="import-card"><div class="section-heading"><div><h2>Histórico recente</h2><p>Rascunhos visíveis ao seu perfil e às permissões RLS.</p></div><button class="signout-button" id="refreshImportHistory" type="button">Atualizar</button></div><div id="importHistory" class="import-history"><p class="muted-note">Consultando histórico…</p></div></section>`;
    byId("importFile").addEventListener("change", onFileSelected);
    byId("importBase").addEventListener("change", updateSaveState);
    byId("saveImportDraft").addEventListener("click", saveDraft);
    byId("resetImport").addEventListener("click", () => resetAnalysis());
    byId("refreshImportHistory").addEventListener("click", loadHistory);
    loadBases(); loadHistory();
  }
  async function loadBases() {
    const select = byId("importBase"), client = window.SAFELINK_CLIENT;
    if (!client) { select.innerHTML = '<option value="">Sessão não disponível</option>'; return; }
    const { data, error } = await client.from("bases").select("id,name,organization_id,client_operation,status").eq("status", "active").order("name");
    if (error) { select.innerHTML = '<option value="">Não foi possível consultar as bases autorizadas</option>'; byId("importFileNote").textContent = "Consulta bloqueada ou indisponível; nenhuma base foi presumida."; return; }
    state.bases = data || [];
    if (!state.bases.length) { select.innerHTML = '<option value="">Nenhuma base ativa visível</option>'; byId("importFileNote").textContent = "Não há base ativa visível. Cadastre/autorize uma base antes de registrar importações."; return; }
    select.innerHTML = '<option value="">Selecione uma base…</option>' + state.bases.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + (b.client_operation ? " · " + esc(b.client_operation) : "") + '</option>').join("");
  }
  function parseRows(matrix) {
    const list = matrix.filter((r) => Array.isArray(r) && r.some((v) => String(v ?? "").trim() !== ""));
    if (list.length < 2) throw new Error("A planilha precisa conter cabeçalho e pelo menos um registro.");
    const headers = list[0].map((v, i) => String(v ?? "").trim() || ("Coluna " + (i + 1)));
    if (headers.length > 300) throw new Error("A planilha excede 300 colunas.");
    const rows = list.slice(1).map((r, i) => { const values = {}; headers.forEach((h, j) => { values[h] = r[j] == null ? "" : (r[j] instanceof Date ? r[j].toISOString() : String(r[j]).trim()); }); return { rowNumber: i + 2, values }; });
    if (rows.length > 10000) throw new Error("A primeira aba excede 10.000 linhas.");
    return { headers, rows };
  }
  function normalizeHeader(v) { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function validate(headers, rows) {
    const keys = ["numerodaetiqueta", "etiqueta", "trackingnumber", "tracking", "awb", "shipmentid", "codigodebarras"];
    const labelHeader = headers.find((h) => keys.includes(normalizeHeader(h)));
    const seen = new Set(), validRows = [], invalidRows = []; let duplicateCount = 0;
    for (const row of rows) {
      const rowErrors = [], label = labelHeader ? String(row.values[labelHeader] ?? "").trim() : "";
      if (!label) rowErrors.push("Número da Etiqueta vazio.");
      else if (seen.has(label)) { rowErrors.push("Etiqueta duplicada neste arquivo."); duplicateCount++; } else seen.add(label);
      const item = { rowNumber: row.rowNumber, label, values: row.values, errors: rowErrors };
      (rowErrors.length ? invalidRows : validRows).push(item);
    }
    return { labelHeader, validRows, invalidRows, duplicateCount, errors: labelHeader ? [] : ["Cabeçalho obrigatório ausente: Número da Etiqueta (ou equivalente reconhecido)."] };
  }
  async function sha256(file) {
    if (!window.crypto?.subtle) return "";
    const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function onFileSelected(event) {
    const file = event.target.files?.[0]; resetAnalysis(false); if (!file) return;
    if (!byId("importBase").value) { byId("importFileNote").textContent = "Selecione primeiro uma base autorizada."; event.target.value = ""; return; }
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return failFile("Formato não suportado. Use .xlsx, .xls ou .csv.");
    if (file.size > 20 * 1024 * 1024) return failFile("Arquivo maior que 20 MB.");
    if (!window.XLSX?.read) return failFile("O leitor de planilhas não carregou. Atualize a página.");
    byId("importFileNote").textContent = "Lendo e validando no navegador…";
    try {
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });
      const sheet = workbook.SheetNames?.[0]; if (!sheet) throw new Error("O arquivo não contém abas legíveis.");
      const parsed = parseRows(window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: "", raw: false, blankrows: false }));
      state.file = file; state.headers = parsed.headers; state.rows = parsed.rows; state.hash = await sha256(file);
      const result = validate(state.headers, state.rows);
      state.validRows = result.validRows; state.invalidRows = result.invalidRows; state.validationErrors = result.errors; state.labelHeader = result.labelHeader; state.duplicateCount = result.duplicateCount;
      renderPreview();
      byId("importFileNote").textContent = file.name + " · " + (file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB · primeira aba: " + sheet;
      updateSaveState();
    } catch (error) { failFile(error?.message || "Não foi possível interpretar a planilha."); }
  }
  function failFile(message) {
    byId("importPreviewCard").hidden = false; byId("importValidationStatus").textContent = "ERRO"; byId("importValidationMessage").textContent = message;
    byId("importPreviewSummary").textContent = "O arquivo não passou pela leitura inicial."; byId("saveImportDraft").disabled = true; byId("importFileNote").textContent = message;
  }
  function renderPreview() {
    byId("importPreviewCard").hidden = false;
    byId("importTotalRows").textContent = String(state.rows.length); byId("importValidRows").textContent = String(state.validRows.length);
    byId("importInvalidRows").textContent = String(state.invalidRows.length); byId("importDuplicateRows").textContent = String(state.duplicateCount || 0);
    byId("importValidationStatus").textContent = state.validationErrors.length || state.invalidRows.length ? "REVISAR" : "VALIDADO";
    byId("importPreviewSummary").textContent = state.headers.length + " colunas · " + state.rows.length + " registros · etiqueta: " + (state.labelHeader || "não identificada");
    const messages = [...state.validationErrors, ...(state.invalidRows.length ? [state.invalidRows.length + " linha(s) com erro; confira a prévia."] : [])];
    byId("importValidationMessage").textContent = messages.length ? messages.join(" ") : "Estrutura inicial válida. Isso não confirma importação operacional.";
    byId("importPreviewHead").innerHTML = "<tr><th>Linha</th><th>Validação</th>" + state.headers.slice(0, 5).map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr>";
    byId("importPreviewBody").innerHTML = state.rows.slice(0, 15).map((r) => {
      const invalid = state.invalidRows.some((item) => item.rowNumber === r.rowNumber);
      return "<tr><td>" + r.rowNumber + "</td><td><span class=\"import-row-state " + (invalid ? "bad" : "good") + "\">" + (invalid ? "Revisar" : "OK") + "</span></td>" + state.headers.slice(0, 5).map((h) => "<td>" + esc(r.values[h]) + "</td>").join("") + "</tr>";
    }).join("");
    if (state.rows.length > 15) byId("importPreviewBody").insertAdjacentHTML("beforeend", '<tr><td colspan="' + (Math.min(state.headers.length, 5) + 2) + '">Exibindo 15 de ' + state.rows.length + " linhas na prévia.</td></tr>");
  }
  function updateSaveState() { const b = byId("saveImportDraft"); if (b) b.disabled = state.busy || !state.file || !byId("importBase").value || !state.hash || !state.labelHeader || !state.rows.length; }
  async function saveDraft() {
    const client = window.SAFELINK_CLIENT, base = state.bases.find((b) => b.id === byId("importBase").value);
    if (!client || !base || !state.file || !state.hash || !state.labelHeader) return;
    state.busy = true; updateSaveState(); const button = byId("saveImportDraft"); button.textContent = "Registrando…";
    try {
      const { data: existing, error: lookupError } = await client.from("import_batches").select("id,status,created_at").eq("base_id", base.id).eq("file_sha256", state.hash).limit(1);
      if (lookupError) throw lookupError;
      if (existing?.length) { byId("importValidationMessage").textContent = "Este arquivo já possui registro (" + existing[0].status + ", " + new Date(existing[0].created_at).toLocaleString("pt-BR") + "). Rascunho duplicado não criado."; return; }
      const userResult = await client.auth.getUser(), userId = userResult.data.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");
      const summary = { stage: "client_side_prevalidation_only", sheet_rows_read: state.rows.length, valid_rows: state.validRows.length, invalid_rows: state.invalidRows.length, duplicate_labels: state.duplicateCount || 0, label_header: state.labelHeader, headers: state.headers, file_size_bytes: state.file.size, sha256_available: Boolean(state.hash), operational_rows_written: 0 };
      const { data, error } = await client.from("import_batches").insert({ organization_id: base.organization_id, base_id: base.id, original_file_name: state.file.name, file_sha256: state.hash, status: "draft", total_rows: state.rows.length, accepted_rows: state.validRows.length, rejected_rows: state.invalidRows.length, summary, imported_by: userId }).select("id,status,created_at").single();
      if (error) throw error;
      byId("importValidationMessage").textContent = "Rascunho " + data.id + " registrado em " + new Date(data.created_at).toLocaleString("pt-BR") + ". Nenhum pacote foi criado ou alterado.";
      byId("importValidationStatus").textContent = "RASCUNHO"; await loadHistory();
    } catch (error) {
      byId("importValidationMessage").textContent = "Não foi possível registrar: " + (error?.message || "falha de acesso") + ". Nenhum dado operacional foi importado.";
    } finally { state.busy = false; button.textContent = "Registrar rascunho de validação"; updateSaveState(); }
  }
  async function loadHistory() {
    const host = byId("importHistory"), client = window.SAFELINK_CLIENT; if (!host) return;
    if (!client) { host.innerHTML = '<p class="muted-note">Sessão indisponível.</p>'; return; }
    host.innerHTML = '<p class="muted-note">Consultando histórico…</p>';
    const { data, error } = await client.from("import_batches").select("id,original_file_name,status,total_rows,accepted_rows,rejected_rows,created_at,base_id").order("created_at", { ascending: false }).limit(20);
    if (error) { host.innerHTML = '<p class="muted-note">Histórico indisponível para este perfil. A consulta respeita RLS.</p>'; return; }
    if (!data?.length) { host.innerHTML = '<p class="muted-note">Nenhum rascunho de importação visível.</p>'; return; }
    const names = new Map(state.bases.map((b) => [b.id, b.name]));
    host.innerHTML = '<div class="table-scroll"><table class="import-table"><thead><tr><th>Arquivo</th><th>Base</th><th>Estado</th><th>Linhas</th><th>Erros</th><th>Criado em</th></tr></thead><tbody>' + data.map((r) => "<tr><td>" + esc(r.original_file_name) + "</td><td>" + esc(names.get(r.base_id) || "Base autorizada") + "</td><td>" + esc(r.status) + "</td><td>" + r.total_rows + "</td><td>" + r.rejected_rows + "</td><td>" + (r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—") + "</td></tr>").join("") + "</tbody></table></div>";
  }
  function resetAnalysis(clearFile = true) {
    state.file = null; state.headers = []; state.rows = []; state.validRows = []; state.invalidRows = []; state.hash = ""; state.validationErrors = []; state.labelHeader = null; state.duplicateCount = 0;
    if (clearFile && byId("importFile")) byId("importFile").value = "";
    if (byId("importPreviewCard")) byId("importPreviewCard").hidden = true;
    if (byId("importFileNote")) byId("importFileNote").textContent = "Selecione uma base e um arquivo para iniciar a pré-validação.";
    updateSaveState();
  }
  window.SAFELINK_RENDER_IMPORTACAO = renderShell;
})();