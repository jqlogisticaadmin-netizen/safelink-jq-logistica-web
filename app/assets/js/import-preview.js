import { classifyD0, normalizeSlaReferenceDates } from "./operational-calculations.js";
import { attachPersistentImport } from "./persistent-import.js";

const PREVIEW_LIMIT = 50;
const MAPPABLE_FIELDS = [
  ["package_label", "Número da etiqueta (A)"],
  ["creation_datetime", "Data de criação (K; hora ignorada nos cálculos por data)"],
  ["last_status", "Último status (X)"],
  ["last_read_datetime", "Data da última leitura (Y; hora ignorada em D+0)"],
  ["last_read_station", "Última estação de leitura (Z)"],
  ["station", "Station (AK)"],
  ["driver", "Motorista (AP)"],
  ["recipient_state", "Estado do destinatário (BH)"],
  ["destination_neighborhood", "Bairro de destino (BJ)"],
  ["postal_code", "Código postal / CEP (BK)"],
  ["destination_address", "Endereço (BS)"],
  ["sla_reference_date", "Campo de data para SLA (BW)"]
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV contém aspas sem fechamento.");
  if (cell.length || row.length || text.endsWith(delimiter)) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    let quoted = false;
    let count = 0;
    for (let i = 0; i < firstLine.length; i += 1) {
      if (firstLine[i] === '"') {
        if (quoted && firstLine[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (firstLine[i] === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function normalizeRows(rows) {
  return rows
    .map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [])
    .filter((row) => row.some((cell) => cell.trim() !== ""));
}

export function getMaxColumns(rows) {
  return rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}


function renderMapping(headers) {
  const fields = MAPPABLE_FIELDS.map(([key, label]) => {
    const options = headers.map((header, index) =>
      `<option value="${index + 1}">${escapeHtml(header || `Coluna ${index + 1}`)} · coluna ${index + 1}</option>`
    ).join("");
    return `<label class="mapping-field">${escapeHtml(label)}<select data-map-field="${escapeHtml(key)}"><option value="">— Não mapear —</option>${options}</select></label>`;
  }).join("");
  return `<section class="panel import-mapping"><div class="panel-heading"><div><h2>Mapeamento local de colunas</h2><p>Associe os cabeçalhos do arquivo aos campos canônicos. Esta configuração ainda não é salva.</p></div></div><div class="mapping-grid">${fields}</div>
    <section class="import-date-normalization" aria-labelledby="slaNormalizationHeading">
      <h3 id="slaNormalizationHeading">Normalização local de datas</h3>
      <p class="admin-help">Os cálculos usam somente a data do calendário, ignorando horas. Informe explicitamente o dia operacional para permitir a correção de datas divergentes. Nada será enviado ao servidor.</p>
      <label>Dia operacional para normalização (opcional)
        <input type="date" id="slaOperationDate">
      </label>
      <div class="admin-actions"><button class="admin-secondary" id="normalizeSlaDates" type="button">Pré-visualizar normalização de SLA e D+0</button></div>
      <div id="slaNormalizationStatus" class="notice" role="status" hidden></div>
      <div id="slaNormalizationResult"></div>
    </section>
    <p class="admin-help">Os nomes de cabeçalho podem variar entre operações. Mapeie BW para a data de SLA e, para D+0, Y para a data da última leitura. Ao alterar o mapeamento ou o dia operacional, execute novamente a pré-visualização.</p></section>`;
}

function renderTable(rows) {
  if (!rows.length) return '<p class="admin-help">A planilha não contém linhas de dados reconhecíveis.</p>';
  const columnCount = getMaxColumns(rows);
  const headers = Array.from({ length: columnCount }, (_, index) =>
    String(rows[0][index] || `Coluna ${index + 1}`)
  );
  const body = rows.slice(1, PREVIEW_LIMIT + 1);
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const duplicateHeaders = headers
    .map((header) => header.trim().toLocaleLowerCase("pt-BR"))
    .filter((header, index, list) => header && list.indexOf(header) !== index);
  const warnings = [];
  if (duplicateHeaders.length) {
    warnings.push('<div class="notice" role="alert"><span class="notice-icon">!</span><div><strong>Cabeçalhos repetidos</strong><p>Renomeie ou mapeie explicitamente os cabeçalhos duplicados antes de confirmar uma importação.</p></div></div>');
  }
  if (rows.slice(1).some((row) => row.length !== rows[0].length)) {
    warnings.push('<div class="notice" role="alert"><span class="notice-icon">!</span><div><strong>Quantidade de colunas inconsistente</strong><p>Há linhas com mais ou menos campos do que o cabeçalho. Todas as colunas encontradas são exibidas; revise o arquivo antes de importar.</p></div></div>');
  }
  const warning = warnings.join("");
  return `${warning}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>#</th>${headerHtml}</tr></thead><tbody>${body.map((row, index) => `<tr><td>${index + 2}</td>${headers.map((_, column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="admin-help">Pré-visualização de até ${Math.min(body.length, PREVIEW_LIMIT)} linha(s) de dados. Nenhum dado foi enviado ao servidor.</p>`;
}

export function renderImportPreview(content) {
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">SAFELINK · OPERAÇÃO</p><h1>Importação Excel/CSV</h1>
      <p class="page-description">Leitura local, inspeção de cabeçalhos e pré-visualização antes de qualquer envio.</p></div>
      <span class="date-chip">Prévia local · sem gravação</span>
    </div>
    <div class="notice"><span class="notice-icon">i</span><div><strong>Etapa de pré-visualização</strong><p>O arquivo é lido no navegador. Esta etapa não grava dados nem cria lotes. Mapeamento, validação de negócio e confirmação serão habilitados após as políticas de backend e regras de importação serem aprovadas.</p></div></div>
    <section class="panel">
      <form id="importPreviewForm" class="admin-form">
        <label>Arquivo Excel ou CSV *<input id="importFile" name="file" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" required></label>
        <div class="admin-actions"><button class="admin-primary" type="submit">Ler e pré-visualizar</button><button class="admin-secondary" id="clearImportPreview" type="button">Limpar</button></div>
      </form>
      <div id="importPreviewStatus" class="notice" role="status" hidden></div>
      <div id="importPreviewResult" class="admin-table-wrap"></div>
    </section>
    <section class="panel" style="margin-top:18px">
      <div class="panel-heading"><div><h2>Validação antes de gravar</h2><p>Revise o mapeamento e selecione a base correta.</p></div></div>
      <ul class="check-list">
        <li><span class="check pending">1</span><span><strong>Etiqueta</strong><small>Obrigatória e sem duplicidade dentro da base.</small></span></li>
        <li><span class="check pending">2</span><span><strong>Datas</strong><small>Horas são descartadas; datas inválidas são rejeitadas por linha.</small></span></li>
        <li><span class="check pending">3</span><span><strong>Persistência</strong><small>A gravação ocorre no Supabase e gera histórico de importação.</small></span></li>
        <li><span class="check pending">4</span><span><strong>Reenvio</strong><small>O mesmo arquivo, base e perfil não deve criar uma segunda importação.</small></span></li>
      </ul>
    </section>`;
  const form = document.getElementById("importPreviewForm");
  const fileInput = document.getElementById("importFile");
  const status = document.getElementById("importPreviewStatus");
  const result = document.getElementById("importPreviewResult");

  function showStatus(message, isError = false) {
    status.hidden = false;
    status.textContent = message;
    status.dataset.type = isError ? "error" : "info";
  }

  document.getElementById("clearImportPreview").addEventListener("click", () => {
    form.reset();
    result.innerHTML = "";
    status.hidden = true;
    status.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return showStatus("Selecione um arquivo.", true);
    result.innerHTML = "";
    showStatus("Lendo arquivo local…");
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      let rows;
      if (extension === "csv") {
        const text = (await file.text()).replace(/^\uFEFF/, "");
        rows = normalizeRows(parseDelimited(text, detectDelimiter(text)));
      } else if (extension === "xlsx" || extension === "xls") {
        const { read, utils } = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
        const workbook = read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error("O arquivo não contém uma planilha.");
        rows = normalizeRows(utils.sheet_to_json(workbook.Sheets[firstSheet], {
          header: 1, defval: "", raw: false, blankrows: false
        }));
      } else {
        throw new Error("Formato não suportado. Selecione .xlsx, .xls ou .csv.");
      }
      if (rows.length < 2) throw new Error("A planilha precisa conter cabeçalho e ao menos uma linha de dados.");
      const width = getMaxColumns(rows);
      if (!width || rows.slice(1).every((row) => row.every((cell) => !cell.trim()))) {
        throw new Error("Não foram encontradas colunas ou linhas de dados.");
      }
      result.innerHTML = renderTable(rows) + renderMapping(rows[0].map((header) => String(header ?? "")));
      attachPersistentImport(result, rows, file).catch((error) => {
        showStatus("A prévia foi gerada, mas não foi possível habilitar a importação persistente: " +
          (error?.message || "falha ao consultar a base ou as permissões."), true);
      });
      const normalizeButton = result.querySelector("#normalizeSlaDates");
      normalizeButton.addEventListener("click", () => {
        const bwSelect = result.querySelector('[data-map-field="sla_reference_date"]');
        const readSelect = result.querySelector('[data-map-field="last_read_datetime"]');
        const dateStatus = result.querySelector("#slaNormalizationStatus");
        const dateResult = result.querySelector("#slaNormalizationResult");
        const operationDate = result.querySelector("#slaOperationDate")?.value || null;
        if (!bwSelect?.value) {
          dateStatus.hidden = false;
          dateStatus.dataset.type = "error";
          dateStatus.textContent = "Mapeie a coluna BW para a data de SLA antes de executar a normalização.";
          dateResult.innerHTML = "";
          return;
        }

        const dataRows = rows.slice(1);
        const bwIndex = Number(bwSelect.value) - 1;
        const readIndex = readSelect?.value ? Number(readSelect.value) - 1 : null;
        const normalized = normalizeSlaReferenceDates(
          dataRows.map((row) => ({ bwDate: row[bwIndex] ?? "" })),
          operationDate
        );
        const reviewCount = normalized.rows.filter((item) => item.requiresReview).length;
        const statusMessage = normalized.requiresReview
          ? `Revisão necessária: ${reviewCount} de ${normalized.rows.length} linha(s). Motivo geral: ${normalized.reason || "valores pendentes"}.`
          : `Normalização calculada localmente para ${normalized.rows.length} linha(s), sem pendências detectadas.`;
        dateStatus.hidden = false;
        dateStatus.dataset.type = normalized.requiresReview ? "warning" : "success";
        dateStatus.textContent = `${statusMessage} Data mais frequente: ${normalized.modeDate || "indisponível"}. Dia operacional: ${normalized.operationDate || "não informado"}.`;

        const previewRows = normalized.rows.slice(0, PREVIEW_LIMIT).map((item, index) => {
          const sourceRow = dataRows[index] || [];
          const lastReadValue = readIndex === null ? null : (sourceRow[readIndex] ?? "");
          const d0 = item.requiresReview
            ? "Revisar"
            : readIndex === null
              ? "Não mapeado"
              : classifyD0(item.normalizedDate, lastReadValue);
          return `<tr><td>${index + 2}</td><td>${escapeHtml(item.originalValue ?? "")}</td><td>${escapeHtml(item.normalizedDate ?? "—")}</td><td>${escapeHtml(lastReadValue ?? "—")}</td><td>${escapeHtml(d0)}</td><td>${escapeHtml(item.normalization)}</td><td>${item.requiresReview ? "Revisar" : "OK"}</td></tr>`;
        }).join("");
        dateResult.innerHTML = `<p class="admin-help">Exibindo ${Math.min(normalized.rows.length, PREVIEW_LIMIT)} de ${normalized.rows.length} linha(s) normalizada(s). Valores originais são preservados na prévia; nenhuma alteração foi gravada.</p>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Linha na prévia</th><th>BW original</th><th>BW normalizado</th><th>Y original (hora ignorada)</th><th>D+0</th><th>Motivo</th><th>Validação</th></tr></thead><tbody>${previewRows || '<tr><td colspan="7">Nenhuma linha para normalizar.</td></tr>'}</tbody></table></div>`;
      });
      showStatus(`Arquivo lido localmente: ${file.name}. ${rows.length - 1} linha(s) com conteúdo detectada(s), ${width} coluna(s) no cabeçalho. Nenhuma gravação foi realizada.`);
    } catch (error) {
      showStatus(error?.message || "Não foi possível ler o arquivo.", true);
    }
  });
}
