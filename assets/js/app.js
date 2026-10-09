(() => {
  "use strict";

  const titles = {
    dashboard: "Dashboard",
    bases: "Bases",
    usuarios: "Usuários e acessos",
    clientes: "Clientes",
    importacao: "Importação",
    pacotes: "Pacotes",
    motoristas: "Motoristas",
    expedicoes: "Expedições",
    rotas: "Rotas e entregas",
    relatorios: "Indicadores e relatórios",
    auditoria: "Auditoria e histórico",
    administracao: "Administração"
  };

  const byId = (id) => document.getElementById(id);
  const content = byId("appContent");
  const sidebar = byId("sidebar");
  const menuToggle = byId("menuToggle");
  const breadcrumb = byId("breadcrumbCurrent");
  let dashboardLoading = false;

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  async function countVisibleRows(client, table, valueId, noteId, countColumn = "id") {
    const { count, error } = await client.from(table).select(countColumn, { count: "exact", head: true });
    if (error) {
      setText(valueId, "—");
      setText(noteId, "Sem acesso ou consulta indisponível");
      return { ok: false, error };
    }
    setText(valueId, String(count ?? 0));
    setText(noteId, "Registros visíveis ao seu perfil");
    return { ok: true, count: count ?? 0 };
  }

  async function refreshDashboard() {
    const client = window.SAFELINK_CLIENT;
    if (!client || dashboardLoading || byId("appShell")?.hidden) return;
    dashboardLoading = true;
    setText("dashboardConnectionStatus", "Conexão autenticada; consultando banco…");
    setText("sidebarConnectionStatus", "Conexão autenticada");
    setText("dashboardNoticeText", "Sessão autenticada no Supabase. Os números abaixo são consultas reais e respeitam as políticas de acesso (RLS).");
    try {
      const results = await Promise.all([
        countVisibleRows(client, "organizations", "metricOrganizations", "metricOrganizationsNote"),
        countVisibleRows(client, "bases", "metricBases", "metricBasesNote"),
        countVisibleRows(client, "import_batches", "metricImports", "metricImportsNote"),
        countVisibleRows(client, "user_profiles", "metricUsers", "metricUsersNote", "user_id")
      ]);
      const successes = results.filter((r) => r.ok).length;
      setText("dashboardConnectionStatus", successes === results.length
        ? "Supabase conectado · consultas concluídas"
        : "Supabase conectado · acesso parcial aos indicadores");
      setText("sidebarConnectionStatus", successes === results.length ? "Conectado · consultas OK" : "Conectado · acesso parcial");

      const activity = byId("activityEmpty");
      const activityStatus = byId("activityStatus");
      const { data, error } = await client
        .from("audit_events")
        .select("event_type,created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) {
        if (activityStatus) activityStatus.textContent = "ACESSO RESTRITO";
        if (activity) activity.innerHTML = "<strong>Eventos não disponíveis para este perfil</strong><p>A consulta foi bloqueada ou não há política de leitura autorizada. Nenhum evento foi inventado.</p>";
      } else if (!data?.length) {
        if (activityStatus) activityStatus.textContent = "SEM EVENTOS";
        if (activity) activity.innerHTML = "<strong>Nenhum evento visível</strong><p>Não há eventos administrativos disponíveis para exibição neste momento.</p>";
      } else {
        if (activityStatus) activityStatus.textContent = "DADOS REAIS";
        if (activity) {
          activity.replaceChildren();
          const list = document.createElement("div");
          list.className = "activity-list";
          data.forEach((event) => {
            const item = document.createElement("div");
            item.className = "activity-item";
            const name = document.createElement("strong");
            name.textContent = event.event_type || "Evento administrativo";
            const date = document.createElement("p");
            date.textContent = event.created_at
              ? new Date(event.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
              : "Data não informada";
            item.append(name, date);
            list.append(item);
          });
          activity.append(list);
        }
      }
      if (successes < results.length) {
        setText("dashboardNoticeText", "Conexão com Supabase estabelecida. Algumas tabelas não puderam ser consultadas com as permissões atuais; os campos restritos permanecem sem valor em vez de mostrar zero fictício.");
      } else {
        setText("dashboardNoticeText", "Conexão com Supabase estabelecida. Os cartões exibem contagens reais de organizações, bases, importações e perfis que seu usuário pode consultar. Os indicadores logísticos (SLA, entregas, rotas e pacotes) dependem da implementação das tabelas e regras operacionais.");
      }
    } catch (_) {
      setText("dashboardConnectionStatus", "Erro ao consultar Supabase");
      setText("sidebarConnectionStatus", "Falha na consulta");
      setText("dashboardNoticeText", "A sessão existe, mas ocorreu uma falha inesperada ao consultar os dados. Recarregue a página; nenhum indicador foi preenchido com valores fictícios.");
    } finally {
      dashboardLoading = false;
    }
  }

  function renderView(view) {
    const title = titles[view] || titles.dashboard;
    document.querySelectorAll("[data-view]").forEach((link) => {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    breadcrumb.textContent = title;
    window.location.hash = view;

    if (view === "dashboard") {
      content.querySelectorAll(".page-heading h1").forEach((h) => { h.textContent = "Dashboard"; });
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      refreshDashboard();
      return;
    }

    if (view === "importacao") {
      content.innerHTML = '<div id="importModule"></div>';
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      if (window.SAFELINK_RENDER_IMPORTACAO) window.SAFELINK_RENDER_IMPORTACAO();
      else content.innerHTML = '<div class="notice"><strong>Módulo de importação indisponível</strong><p>Atualize a página para carregar os recursos do módulo.</p></div>';
      content.focus();
      return;
    }

    content.innerHTML = `
      <div class="page-heading">
        <div><p class="eyebrow">SAFELINK · MÓDULO</p><h1>${title}</h1>
        <p class="page-description">Módulo ${title.toLowerCase()} do SafeLink.</p></div>
        <span class="date-chip">Implementação pendente</span>
      </div>
      <div class="notice" role="status"><span class="notice-icon">i</span><div>
        <strong>Conexão Supabase disponível; módulo ainda não implementado</strong>
        <p>O backend possui a fundação de segurança e algumas tabelas iniciais, mas esta tela ainda precisa de operações CRUD, validações de negócio e testes de autorização antes de ser usada operacionalmente.</p>
      </div></div>
      <section class="placeholder-page">
        <h2>Próxima etapa</h2>
        <p>Implementar este módulo usando o esquema existente, permissões RLS e validações no backend. Não serão exibidos dados fictícios.</p>
        <p><strong>Status:</strong> <code>Implementação pendente</code></p>
      </section>
    `;
    sidebar.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    content.focus();
  }

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      renderView(link.dataset.view);
    });
  });

  menuToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  window.addEventListener("safelink:session-ready", () => {
    if (window.location.hash.slice(1) === "importacao") renderView("importacao");
    else refreshDashboard();
  });
  window.addEventListener("hashchange", () => {
    const view = window.location.hash.slice(1);
    if (titles[view]) renderView(view);
  });

  const initialView = window.location.hash.slice(1);
  if (initialView && titles[initialView] && initialView !== "dashboard") renderView(initialView);
  else refreshDashboard();
})();