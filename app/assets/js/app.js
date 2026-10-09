import { supabase } from "./supabase-client.js";
import { checkSafeLinkAccess } from "./auth-access.js";
import { renderAdminView } from "./admin-data.js";
import { renderImportPreview } from "./import-preview.js";
import { renderDashboard } from "./dashboard-data.js";
import { renderOperationalView } from "./data-views.js";

let safeLinkAccessAllowed = false;
let authenticatedUserId = null;

try {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && session) {
    authenticatedUserId = session.user.id;
    const access = await checkSafeLinkAccess(session.user.id);
    if (access.allowed) {
      safeLinkAccessAllowed = true;
      document.body.classList.remove("auth-pending");
    } else {
      await supabase.auth.signOut();
      window.location.replace(`./login.html?access=${encodeURIComponent(access.reason)}`);
    }
  } else {
    window.location.replace("./login.html");
  }
} catch {
  // Fail closed on unexpected auth/network errors; never reveal the app shell.
  window.location.replace("./login.html?access=profile_check_failed");
}

if (safeLinkAccessAllowed) {
(() => {
  "use strict";

  const titles = {
    dashboard: "Dashboard",
    organizacoes: "Organizações",
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
  const logoutButton = document.getElementById("logoutButton");

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Saindo…";
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace("./login.html");
    }
  });

  async function renderView(view) {
    const title = titles[view] || titles.dashboard;
    document.querySelectorAll("[data-view]").forEach((link) => {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    breadcrumb.textContent = title;

    if (view === "importacao") {
      renderImportPreview(content);
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      content.focus();
      return;
    }

    if (["organizacoes", "bases", "usuarios", "auditoria"].includes(view)) {
      await renderAdminView(view, content, authenticatedUserId);
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      content.focus();
      return;
    }

    if (view === "dashboard") {
      await renderDashboard(content);
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      content.focus();
      return;
    }

    if (["clientes", "pacotes", "motoristas", "expedicoes", "rotas", "relatorios", "auditoria", "administracao"].includes(view)) {
      await renderOperationalView(view, content, authenticatedUserId);
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      content.focus();
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
      window.location.hash = view;
      renderView(view);
    });
  });

  menuToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  const initialView = window.location.hash.slice(1);
  if (initialView && titles[initialView]) renderView(initialView);
  else renderDashboard(content);

  window.addEventListener("hashchange", () => {
    const nextView = window.location.hash.slice(1) || "dashboard";
    if (titles[nextView]) renderView(nextView);
  });
})();
}
