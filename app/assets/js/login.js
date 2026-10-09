import { supabase } from "./supabase-client.js";
import { checkSafeLinkAccess } from "./auth-access.js";

const loginForm = document.getElementById("loginForm");
const recoveryForm = document.getElementById("recoveryForm");
const signInPanel = document.getElementById("signInPanel");
const recoveryPanel = document.getElementById("recoveryPanel");
const message = document.getElementById("formMessage");
const signInButton = document.getElementById("signInButton");
const savePasswordButton = document.getElementById("savePasswordButton");
const params = new URLSearchParams(window.location.search);

const accessMessages = {
  profile_missing: "A autenticação existe, mas o perfil SafeLink ainda não foi provisionado. O acesso operacional continua bloqueado.",
  profile_inactive: "Esta conta está desativada no SafeLink. Procure o administrador responsável.",
  role_missing: "Sua conta ainda não possui um perfil de acesso SafeLink atribuído. O acesso operacional continua bloqueado.",
  profile_check_failed: "Não foi possível validar seu perfil. Tente novamente mais tarde.",
  role_check_failed: "Não foi possível validar suas permissões. Tente novamente mais tarde."
};

function showMessage(text, type = "info") {
  message.textContent = text;
  message.className = `message ${type}`;
  message.hidden = false;
}

function clearMessage() {
  message.textContent = "";
  message.hidden = true;
  message.className = "message";
}

function setBusy(button, busy, busyText) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

async function routeAuthenticatedUser(user) {
  const access = await checkSafeLinkAccess(user.id);
  if (!access.allowed) {
    await supabase.auth.signOut();
    showMessage(accessMessages[access.reason] || "Acesso não autorizado. Procure o administrador do SafeLink.", "error");
    return false;
  }
  window.location.replace("./index.html");
  return true;
}

document.getElementById("togglePassword").addEventListener("click", () => {
  const input = document.getElementById("password");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  const button = document.getElementById("togglePassword");
  button.textContent = showing ? "Mostrar" : "Ocultar";
  button.setAttribute("aria-pressed", String(!showing));
});

document.getElementById("forgotPassword").addEventListener("click", async () => {
  clearMessage();
  const email = document.getElementById("email").value.trim();
  if (!email) {
    showMessage("Informe seu e-mail para receber o link de recuperação.", "error");
    document.getElementById("email").focus();
    return;
  }

  const button = document.getElementById("forgotPassword");
  button.disabled = true;
  try {
    const redirectTo = new URL("./login.html?recovery=1", window.location.href).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    showMessage("Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação. Confira também a pasta de spam.", "success");
  } catch (error) {
    showMessage("Não foi possível solicitar a recuperação. Verifique a configuração de redirecionamento do Supabase Auth e tente novamente.", "error");
  } finally {
    button.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!loginForm.reportValidity()) return;

  setBusy(signInButton, true, "Validando acesso…");
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage("Não foi possível entrar. Confira o e-mail e a senha.", "error");
      return;
    }
    await routeAuthenticatedUser(data.user);
  } catch (error) {
    showMessage("Falha de comunicação com o serviço de autenticação. Tente novamente.", "error");
  } finally {
    setBusy(signInButton, false);
  }
});

document.getElementById("backToLogin").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.replace("./login.html");
});

recoveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!recoveryForm.reportValidity()) return;

  const password = document.getElementById("newPassword").value;
  const confirmation = document.getElementById("confirmPassword").value;
  if (password !== confirmation) {
    showMessage("As senhas informadas não são iguais.", "error");
    return;
  }

  setBusy(savePasswordButton, true, "Salvando…");
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      showMessage("O link de recuperação é inválido ou expirou. Solicite um novo link.", "error");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      showMessage("Não foi possível atualizar a senha. Verifique os requisitos configurados e tente novamente.", "error");
      return;
    }
    await supabase.auth.signOut();
    recoveryPanel.hidden = true;
    signInPanel.hidden = false;
    loginForm.reset();
    showMessage("Senha atualizada. Entre com a nova senha.", "success");
  } catch (error) {
    showMessage("Falha ao atualizar a senha. Solicite um novo link de recuperação se o problema persistir.", "error");
  } finally {
    setBusy(savePasswordButton, false);
  }
});

async function initialize() {
  const recoveryMode = params.get("recovery") === "1";
  signInPanel.hidden = recoveryMode;
  recoveryPanel.hidden = !recoveryMode;

  const accessReason = params.get("access");
  if (accessReason) {
    showMessage(accessMessages[accessReason] || "Acesso não autorizado. Procure o administrador do SafeLink.", "error");
  }

  if (recoveryMode) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      showMessage("O link de recuperação é inválido ou expirou. Solicite um novo link.", "error");
    }
    return;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return;

  await routeAuthenticatedUser(session.user);
}

initialize().catch(() => {
  // Keep the page fail-closed if session initialization or the access check throws.
  showMessage("Não foi possível validar a sessão com segurança. Atualize a página ou tente novamente mais tarde.", "error");
});
