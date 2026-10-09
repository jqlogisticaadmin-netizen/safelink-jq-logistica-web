import { supabase } from "./supabase-client.js";
import { normalizeSlaReferenceDates } from "./operational-calculations.js";

const fields = [
  "package_label", "creation_datetime", "last_status", "last_read_datetime",
  "last_read_station", "station", "driver", "recipient_state",
  "destination_neighborhood", "postal_code", "destination_address", "sla_reference_date"
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function dateOnly(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return br[3] + "-" + String(br[2]).padStart(2, "0") + "-" + String(br[1]).padStart(2, "0");
  return text;
}

export async function attachPersistentImport(result, rows, file) {
  const [basesResult, orgsResult] = await Promise.all([
    supabase.from("bases").select("id,organization_id,name").eq("status", "active").order("name"),
    supabase.from("organizations").select("id,name").eq("status", "active").order("name")
  ]);
  const controls = document.createElement("section");
  controls.className = "panel";
  controls.style.marginTop = "18px";
  if (basesResult.error || orgsResult.error) {
    controls.innerHTML = "<div class=\"notice\" role=\"alert\"><strong>Não foi possível consultar as bases autorizadas.</strong><p>Verifique suas permissões no Supabase.</p></div>";
    result.appendChild(controls);
    return;
  }
  const orgs = orgsResult.data || [];
  const bases = (basesResult.data || []).map((base) => ({
    ...base,
    orgName: orgs.find((org) => org.id === base.organization_id)?.name || "Organização"
  }));
  const baseOptions = bases.map((base) =>
    "<option value=\"" + escapeHtml(base.id) + "\">" + escapeHtml(base.name) + " · " + escapeHtml(base.orgName) + "</option>"
  ).join("");
  controls.innerHTML = "<div class=\"panel-heading\"><div><h2>Gravar importação</h2><p>O lote será validado no banco. Etiquetas duplicadas serão rejeitadas sem sobrescrever registros existentes.</p></div></div>" +
    (bases.length ? "<div class=\"admin-form\"><label>Base de destino *<select id=\"persistentImportBase\"><option value=\"\">Selecione uma base ativa...</option>" + baseOptions + "</select></label>" +
      "<label>Nome do perfil de importação *<input id=\"persistentImportProfileName\" maxlength=\"120\" value=\"Importação operacional\"></label>" +
      "<div class=\"admin-actions\"><button type=\"button\" class=\"admin-primary\" id=\"persistentImportConfirm\">Validar e importar para o Supabase</button></div>" +
      "<div id=\"persistentImportStatus\" class=\"notice\" role=\"status\" hidden></div><div id=\"persistentImportErrors\"></div></div>" :
      "<div class=\"notice\" role=\"alert\"><strong>Nenhuma base ativa disponível.</strong><p>Cadastre primeiro a organização J&Q Logística e sua base em Bases.</p></div>");
  result.appendChild(controls);
  if (!bases.length) return;

  const button = controls.querySelector("#persistentImportConfirm");
  const status = controls.querySelector("#persistentImportStatus");
  const errorsBox = controls.querySelector("#persistentImportErrors");
  const showStatus = (message, type = "info") => {
    status.hidden = false;
    status.dataset.type = type;
    status.textContent = message;
  };

  button.addEventListener("click", async () => {
    const baseId = controls.querySelector("#persistentImportBase").value;
    const profileName = controls.querySelector("#persistentImportProfileName").value.trim();
    if (!baseId) return showStatus("Selecione uma base ativa.", "error");
    if (!profileName) return showStatus("Informe o nome do perfil de importação.", "error");

    const headers = rows[0].map((value, index) => String(value || ("Coluna " + (index + 1))));
    const normalizedHeaders = headers.map((header) => header.trim().toLocaleLowerCase("pt-BR"));
    if (normalizedHeaders.some((header, index) => header && normalizedHeaders.indexOf(header) !== index)) {
      return showStatus("Importação bloqueada: existem cabeçalhos repetidos. Corrija o arquivo ou renomeie as colunas antes de importar.", "error");
    }
    if (dataRows.some((row) => row.length !== rows[0].length)) {
      return showStatus("Importação bloqueada: há linhas com quantidade de colunas diferente do cabeçalho.", "error");
    }
    const mappings = fields.map((target) => {
      const select = result.querySelector('[data-map-field="' + target + '"]');
      if (!select || !select.value) return null;
      const columnIndex = Number(select.value);
      return {
        source_header: headers[columnIndex - 1],
        source_column_index: columnIndex,
        target_field: target,
        is_required: target === "package_label"
      };
    }).filter(Boolean);
    const byTarget = Object.fromEntries(mappings.map((item) => [item.target_field, item]));
    if (!byTarget.package_label) return showStatus("Mapeie a coluna Número da etiqueta antes de importar.", "error");

    const dataRows = rows.slice(1);
    let slaNormalization = null;
    if (byTarget.sla_reference_date) {
      const slaColumn = byTarget.sla_reference_date.source_column_index - 1;
      const operationDate = result.querySelector("#slaOperationDate")?.value || null;
      slaNormalization = normalizeSlaReferenceDates(
        dataRows.map((row) => ({ bwDate: row[slaColumn] ?? "" })),
        operationDate
      );
      if (slaNormalization.requiresReview) {
        return showStatus("Importação bloqueada para revisão de datas SLA. Motivo: " +
          (slaNormalization.reason || "valores inválidos") +
          ". Informe o dia operacional quando necessário e confira a pré-visualização antes de tentar novamente.", "error");
      }
    }

    const getValue = (row, target) => {
      const mapping = byTarget[target];
      return mapping ? String(row[mapping.source_column_index - 1] ?? "").trim() : "";
    };
    const canonicalRows = dataRows.map((row, index) => {
      const raw = {};
      headers.forEach((header, columnIndex) => { raw[header] = String(row[columnIndex] ?? ""); });
      const originalSla = getValue(row, "sla_reference_date");
      return {
        label: getValue(row, "package_label"),
        source_created_at: dateOnly(getValue(row, "creation_datetime")),
        source_last_read_at: dateOnly(getValue(row, "last_read_datetime")),
        last_status_source: getValue(row, "last_status"),
        last_read_station: getValue(row, "last_read_station"),
        station_source: getValue(row, "station"),
        source_driver_name: getValue(row, "driver"),
        recipient_state: getValue(row, "recipient_state"),
        destination_neighborhood: getValue(row, "destination_neighborhood"),
        postal_code: getValue(row, "postal_code"),
        destination_address: getValue(row, "destination_address"),
        sla_reference_date: slaNormalization ? slaNormalization.rows[index]?.normalizedDate : dateOnly(originalSla),
        sla_reference_original: originalSla || null,
        raw_data: raw,
        normalized_data: {
          date_policy: "date_only",
          sla_normalization: slaNormalization?.rows[index]?.normalization || "not_normalized"
        }
      };
    });

    button.disabled = true;
    showStatus("Salvando o perfil e validando " + canonicalRows.length + " linha(s)…");
    errorsBox.innerHTML = "";
    try {
      const { data: latestProfile, error: lookupError } = await supabase
        .from("import_profiles").select("version")
        .eq("base_id", baseId).eq("name", profileName)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      const nextVersion = Number(latestProfile?.version || 0) + 1;
      const { data: profileId, error: profileError } = await supabase.rpc("save_import_profile", {
        p_base_id: baseId,
        p_name: profileName,
        p_version: nextVersion,
        p_description: "Perfil salvo pela tela de importação SafeLink",
        p_mappings: mappings
      });
      if (profileError) throw profileError;

      let hash = null;
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const { data: batch, error: importError } = await supabase.rpc("import_safelink_packages", {
        p_base_id: baseId,
        p_import_profile_id: profileId,
        p_original_file_name: file.name,
        p_file_sha256: hash,
        p_rows: canonicalRows
      });
      if (importError) throw importError;
      showStatus("Lote " + batch.batch_id + " concluído: " + batch.accepted_rows + " linha(s) aceita(s), " +
        batch.rejected_rows + " rejeitada(s), de " + batch.total_rows +
        ". As horas foram descartadas nas datas gravadas; duplicados não sobrescreveram registros.", batch.rejected_rows ? "warning" : "success");
      if (batch.rejected_rows > 0) {
        const { data: rowErrors, error: rowError } = await supabase.from("import_row_errors")
          .select("row_number,errors").eq("import_batch_id", batch.batch_id).order("row_number");
        if (rowError) {
          errorsBox.innerHTML = "<p class=\"admin-help\">O lote foi gravado, mas os detalhes dos erros não puderam ser consultados.</p>";
        } else {
          errorsBox.innerHTML = "<div class=\"admin-table-wrap\"><table class=\"admin-table\"><thead><tr><th>Linha da planilha</th><th>Validação</th></tr></thead><tbody>" +
            (rowErrors || []).map((item) => "<tr><td>" + escapeHtml(item.row_number + 1) + "</td><td>" +
              escapeHtml((item.errors || []).join("; ")) + "</td></tr>").join("") +
            "</tbody></table></div>";
        }
      }
    } catch (error) {
      showStatus("Importação não concluída. " + (error?.message || "Falha inesperada.") +
        " A função de importação persistente exige a migração 012 no Supabase.", "error");
    } finally {
      button.disabled = false;
    }
  });
}
