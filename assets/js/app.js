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

  const content = document.getElementById("appContent");
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("menuToggle");
  const breadcrumb = document.getElementById("breadcrumbCurrent");

  function renderView(view) {
    const title = titles[view] || titles.dashboard;
    document.querySelectorAll("[data-view]").forEach((link) => {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    breadcrumb.textContent = title;

    if (view === "dashboard") {
      window.location.hash = "dashboard";
      window.location.reload();
      return;
    }

    content.innerHTML = `
      <div class="page-heading">
        <div><p class="eyebrow">SAFELINK · MÓDULO</p><h1>${title}</h1>
        <p class="page-description">Fundação inicial do módulo ${title.toLowerCase()}.</p></div>
        <span class="date-chip">Implementação funcional pendente</span>
      </div>
      <div class="notice" role="status"><span class="notice-icon">i</span><div>
        <strong>Módulo ainda não conectado aos dados reais</strong>
        <p>Esta área está reservada para a implementação definida no Script Mestre. Nenhum dado operacional fictício será apresentado como real.</p>
      </div></div>
      <section class="placeholder-page">
        <h2>Próximos passos deste módulo</h2>
        <p>Antes de ativar operações, será necessário definir o modelo de dados, as permissões de backend, os estados de carregamento e erro e os testes de aceitação.</p>
        <p><strong>Status:</strong> <code>Não iniciada</code></p>
      </section>
    `;
    sidebar.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    content.focus();
  }

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      if (view === "dashboard") {
        window.location.hash = "dashboard";
        window.location.reload();
        return;
      }
      window.location.hash = view;
      renderView(view);
    });
  });

  menuToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  const initialView = window.location.hash.slice(1);
  if (initialView && titles[initialView] && initialView !== "dashboard") renderView(initialView);
})();