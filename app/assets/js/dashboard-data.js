import { supabase } from "./supabase-client.js";
import { parseDateOnly } from "./operational-calculations.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short"
  }).format(parsed);
}

function renderError(content, message) {
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">SAFELINK · VISÃO GERAL</p><h1>Dashboard</h1>
    <p class="page-description">Indicadores calculados a partir dos dados visíveis à sua conta.</p></div></div>
    <div class="notice" role="alert"><span class="notice-icon">!</span><div>
      <strong>Não foi possível carregar os indicadores</strong><p>${escapeHtml(message)}</p>
      <p>Confira sua organização, base e permissões. Nenhum dado fictício foi exibido.</p>
      <button type="button" class="admin-secondary" id="retryDashboard">Tentar novamente</button>
    </div></div>`;
  document.getElementById("retryDashboard")?.addEventListener("click", () => renderDashboard(content));
}

export async function renderDashboard(content) {
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">SAFELINK · VISÃO GERAL</p><h1>Dashboard</h1>
    <p class="page-description">Resumo atualizado dos dados operacionais autorizados no Supabase.</p></div>
    <button type="button" class="admin-secondary" id="refreshDashboard">Atualizar dados</button></div>
    <div class="notice" role="status"><span class="notice-icon">i</span><div><strong>Consultando o banco</strong><p>Os números só serão exibidos após a consulta real ao Supabase.</p></div></div>`;
  document.getElementById("refreshDashboard")?.addEventListener("click", () => renderDashboard(content));

  try {
    const [packagesResult, routesResult, expeditionsResult, slaResult, eventsResult, organizationsResult, basesResult] = await Promise.all([
      supabase.from("packages").select("id", { count: "exact", head: true }),
      supabase.from("routes").select("id", { count: "exact", head: true }),
      supabase.from("expeditions").select("id", { count: "exact", head: true }),
      supabase.from("packages").select("id", { count: "exact", head: true }).not("sla_reference_date", "is", null),
      supabase.from("package_events").select("id,event_type,status_source,occurred_at").order("occurred_at", { ascending: false }).limit(8),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("bases").select("id", { count: "exact", head: true })
    ]);
    const failed = [packagesResult, routesResult, expeditionsResult, slaResult, eventsResult, organizationsResult, basesResult].find((result) => result.error);
    if (failed) throw failed.error;

    const packageRows = [];
    const pageSize = 1000;
    for (let offset = 0; offset < (packagesResult.count ?? 0); offset += pageSize) {
      const { data: page, error: pageError } = await supabase.from("packages")
        .select("id,label,source_created_at,source_last_read_at,last_status_source,sla_reference_date,normalized_data")
        .order("id").range(offset, offset + pageSize - 1);
      if (pageError) throw pageError;
      packageRows.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }
    const validD0Rows = packageRows.filter((item) =>
      parseDateOnly(item.sla_reference_date) && parseDateOnly(item.source_last_read_at)
    );
    const d0Count = validD0Rows.filter((item) =>
      parseDateOnly(item.sla_reference_date) === parseDateOnly(item.source_last_read_at)
    ).length;
    const d0Percent = validD0Rows.length
      ? (d0Count * 100 / validD0Rows.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
      : "—";
    const statusCounts = new Map();
    packageRows.forEach((item) => {
      const status = String(item.last_status_source || "").trim() || "Status não informado";
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    });
    const statusRows = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const metrics = [
      { label: "Pacotes visíveis", value: Number(packagesResult.count ?? 0).toLocaleString("pt-BR"), note: "Registros autorizados pela política RLS" },
      { label: "Rotas cadastradas", value: Number(routesResult.count ?? 0).toLocaleString("pt-BR"), note: "Total de rotas visíveis à sua conta" },
      { label: "Expedições cadastradas", value: Number(expeditionsResult.count ?? 0).toLocaleString("pt-BR"), note: "Total de expedições visíveis à sua conta" },
      { label: "SLA D+0 (data)", value: d0Percent, note: d0Count.toLocaleString("pt-BR") + " de " + validD0Rows.length.toLocaleString("pt-BR") + " pacotes com datas válidas; horas ignoradas" }
    ];
    const events = eventsResult.data || [];
    content.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">SAFELINK · VISÃO GERAL</p><h1>Dashboard</h1>
      <p class="page-description">Resumo atualizado dos dados operacionais autorizados no Supabase.</p></div>
      <button type="button" class="admin-secondary" id="refreshDashboard">Atualizar dados</button></div>
      <div class="metrics-grid">${metrics.map((metric) => `
        <article class="metric-card"><div class="metric-top"><span>${escapeHtml(metric.label)}</span></div>
        <strong class="metric-value">${escapeHtml(metric.value)}</strong><p>${escapeHtml(metric.note)}</p></article>`).join("")}</div>
      <div class="content-grid">
        <article class="panel"><div class="panel-heading"><div><h2>Atividade operacional recente</h2>
        <p>Eventos mais recentes que sua conta tem autorização para consultar.</p></div><span class="panel-label">${events.length ? "DADOS REAIS" : "SEM EVENTOS"}</span></div>
        ${events.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Evento</th><th>Status de origem</th><th>Data/hora registrada</th></tr></thead><tbody>
        ${events.map((event) => `<tr><td>${escapeHtml(event.event_type)}</td><td>${escapeHtml(event.status_source || "—")}</td><td>${escapeHtml(formatDate(event.occurred_at))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state"><strong>Nenhum evento disponível</strong><p>Os eventos aparecerão aqui quando existirem registros operacionais autorizados.</p></div>'}
        </article>
        <article class="panel"><div class="panel-heading"><div><h2>Estrutura cadastrada</h2><p>Cadastros disponíveis para o seu escopo de acesso.</p></div></div>
        <ul class="check-list"><li><span class="check">${(organizationsResult.count ?? 0) > 0 ? "✓" : "○"}</span><span><strong>Organizações</strong><small>${Number(organizationsResult.count ?? 0).toLocaleString("pt-BR")} registro(s) visível(is)</small></span></li>
        <li><span class="check">${(basesResult.count ?? 0) > 0 ? "✓" : "○"}</span><span><strong>Bases logísticas</strong><small>${Number(basesResult.count ?? 0).toLocaleString("pt-BR")} registro(s) visível(is)</small></span></li>
        <li><span class="check">${(packagesResult.count ?? 0) > 0 ? "✓" : "○"}</span><span><strong>Pacotes</strong><small>${Number(packagesResult.count ?? 0).toLocaleString("pt-BR")} registro(s) visível(is)</small></span></li></ul>
        <div class="panel-heading" style="margin-top:18px"><div><h2>Distribuição por status de origem</h2><p>Valores agrupados exatamente como vieram da coluna mapeada para status.</p></div></div>
        ${statusRows.length ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Status</th><th>Pacotes</th></tr></thead><tbody>' + statusRows.map(([status, count]) => '<tr><td>' + escapeHtml(status) + '</td><td>' + Number(count).toLocaleString("pt-BR") + '</td></tr>').join("") + '</tbody></table></div>' : '<p class="admin-help">Ainda não há status de pacotes para agrupar.</p>'}
        <p class="admin-help">D+0 compara somente a data normalizada de SLA com a data da última leitura; horas são ignoradas. Indicadores de metas, gap e recebimento dentro da abrangência dependem das regras operacionais restantes.</p></article>
      </div>
      <footer class="page-footer"><span>SafeLink · J&Q Logística</span><span>Consulta direta ao Supabase com RLS.</span></footer>`;
    document.getElementById("refreshDashboard")?.addEventListener("click", () => renderDashboard(content));
  } catch (error) {
    renderError(content, error?.message || "Erro inesperado ao consultar os dados.");
  }
}
