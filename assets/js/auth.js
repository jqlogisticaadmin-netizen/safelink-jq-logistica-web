(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const authScreen = byId("authScreen");
  const appShell = byId("appShell");
  const form = byId("loginForm");
  const message = byId("authMessage");
  const submit = byId("loginSubmit");
  let client = null;

  function showMessage(text, isError = true) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
    message.classList.toggle("is-success", !isError);
  }

  function showLogin(text = "") {
    authScreen.hidden = false;
    appShell.hidden = true;
    if (text) showMessage(text);
  }

  async function activateSession(session) {
    if (!session?.user?.id) {
      showLogin();
      return;
    }
    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("full_name,is_active")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (profileError || !profile || profile.is_active !== true) {
      await client.auth.signOut();
      showLogin("Este usuário não possui perfil ativo autorizado. Contate o MASTER.");
      return;
    }
    const { data: roles, error: roleError } = await client
      .from("user_roles")
      .select("role_code,organization_id")
      .eq("user_id", session.user.id);
    if (roleError || !Array.isArray(roles) || roles.length === 0) {
      await client.auth.signOut();
      showLogin("Nenhum perfil de acesso foi atribuído a este usuário.");
      return;
    }
    authScreen.hidden = true;
    appShell.hidden = false;
    byId("sessionUser").textContent = profile.full_name || session.user.email || "Usuário";
    const tag = document.querySelector(".environment-tag");
    if (tag) tag.textContent = roles.some((r) => r.role_code === "MASTER" && r.organization_id === null)
      ? "MASTER"
      : roles.map((r) => r.role_code).join(" · ");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const cfg = window.SAFELINK_SUPABASE_CONFIG;
    if (!window.supabase?.createClient || !cfg?.url || !cfg?.publishableKey) {
      showLogin("Não foi possível carregar a conexão segura. Recarregue a página ou contate o suporte.");
      submit.disabled = true;
      return;
    }
    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = "Validando…";
      showMessage("");
      try {
        const email = byId("loginEmail").value.trim();
        const password = byId("loginPassword").value;
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          showMessage("Não foi possível entrar. Confira o e-mail e a senha.");
          return;
        }
        await activateSession(data.session);
      } catch (_) {
        showMessage("Falha de comunicação com o serviço de autenticação.");
      } finally {
        submit.disabled = false;
        submit.textContent = "Entrar";
      }
    });
    byId("signOutButton").addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) {
        showMessage("Não foi possível encerrar a sessão. Tente novamente.");
        return;
      }
      showLogin("Sessão encerrada.", false);
      byId("loginPassword").value = "";
    });
    client.auth.onAuthStateChange((_event, session) => {
      // Avoid querying the database synchronously inside the auth callback.
      if (!session) showLogin();
      else queueMicrotask(() => activateSession(session));
    });
    const { data, error } = await client.auth.getSession();
    if (error) showLogin("Não foi possível recuperar a sessão.");
    else await activateSession(data.session);
  });
})();
