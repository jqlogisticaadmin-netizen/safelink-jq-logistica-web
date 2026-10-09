import { supabase } from "./supabase-client.js";

const roleOptions = [
  { value: "GESTOR", label: "Gestor" },
  { value: "ADMINISTRATIVO", label: "Administrativo" },
  { value: "MOTORISTA", label: "Motorista" }
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function setNotice(message, type = "info") {
  const notice = document.getElementById("adminNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.type = type;
  notice.hidden = false;
}

function statusLabel(status) {
  return status === "active" ? "Ativa" : "Inativa";
}

async function requireMaster(userId) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role_code")
    .eq("user_id", userId)
    .eq("role_code", "MASTER")
    .maybeSingle();
  return !error && data?.role_code === "MASTER";
}

function options(items, selected, valueKey = "id", labelKey = "name") {
  return items.map((item) => {
    const value = String(item[valueKey] ?? "");
    const label = String(item[labelKey] || value);
    return `<option value="${escapeHtml(value)}" ${value === String(selected ?? "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function shell(title, description, form, table) {
  return `
    <div class="page-heading">
      <div><p class="eyebrow">SAFELINK · ADMINISTRAÇÃO</p><h1>${escapeHtml(title)}</h1>
      <p class="page-description">${escapeHtml(description)}</p></div>
      <span class="date-chip">Acesso restrito a MASTER</span>
    </div>
    <div id="adminNotice" class="notice" role="status" hidden><span class="notice-icon">i</span><div></div></div>
    <div class="admin-layout">
      <section class="panel"><div class="panel-heading"><div><h2>Cadastro</h2><p>Campos obrigatórios marcados com *.</p></div></div>${form}</section>
      <section class="panel"><div class="panel-heading"><div><h2>Registros</h2><p>Dados consultados no Supabase sob RLS.</p></div></div><div class="admin-table-wrap">${table}</div></section>
    </div>`;
}

async function renderOrganizations(content, userId) {
  const [orgsResult] = await Promise.all([
    supabase.from("organizations").select("id,name,slug,status,created_at").order("name")
  ]);
  if (orgsResult.error) throw orgsResult.error;
  const orgs = orgsResult.data || [];
  content.innerHTML = shell("Organizações", "Cadastro e ativação de organizações.", `
    <form id="organizationForm" class="admin-form">
      <input type="hidden" name="id">
      <label>Nome *<input name="name" required maxlength="160" autocomplete="organization"></label>
      <label>Identificador (slug) *<input name="slug" required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="exemplo-organizacao"></label>
      <label>Status<select name="status"><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
      <div class="admin-actions"><button class="admin-primary" type="submit">Salvar organização</button><button class="admin-secondary" type="reset">Limpar</button></div>
      <p class="admin-help">Não há exclusão física nesta tela. Slugs devem usar letras minúsculas, números e hífens.</p>
    </form>`, `
      <table class="admin-table"><thead><tr><th>Organização</th><th>Slug</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody>${orgs.map((org) => `<tr><td>${escapeHtml(org.name)}</td><td><code>${escapeHtml(org.slug)}</code></td><td>${escapeHtml(statusLabel(org.status))}</td><td><button type="button" class="admin-secondary" data-edit-org="${escapeHtml(org.id)}">Editar</button></td></tr>`).join("") || '<tr><td colspan="4">Nenhuma organização visível para esta conta.</td></tr>'}</tbody></table>`);
  const form = document.getElementById("organizationForm");
  form.addEventListener("reset", () => { form.elements.id.value = ""; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = { name: data.name.trim(), slug: data.slug.trim(), status: data.status };
    const result = data.id
      ? await supabase.from("organizations").update(payload).eq("id", data.id)
      : await supabase.from("organizations").insert({ ...payload, created_by: userId });
    if (result.error) return setNotice(`Não foi possível salvar. ${result.error.message}`, "error");
    await renderOrganizations(content, userId);
    setNotice("Organização salva.", "success");
  });
  content.querySelectorAll("[data-edit-org]").forEach((button) => button.addEventListener("click", () => {
    const item = orgs.find((org) => org.id === button.dataset.editOrg);
    if (!item) return;
    form.elements.id.value = item.id;
    form.elements.name.value = item.name;
    form.elements.slug.value = item.slug;
    form.elements.status.value = item.status;
    form.elements.name.focus();
  }));
}

async function renderBases(content, userId) {
  const [orgsResult, basesResult] = await Promise.all([
    supabase.from("organizations").select("id,name").order("name"),
    supabase.from("bases").select("id,organization_id,name,code,cnpj,address,cep,region,client_operation,operation_type,status").order("name")
  ]);
  if (orgsResult.error) throw orgsResult.error;
  if (basesResult.error) throw basesResult.error;
  const orgs = orgsResult.data || [];
  const bases = basesResult.data || [];
  const orgName = (id) => orgs.find((org) => org.id === id)?.name || "Organização indisponível";
  content.innerHTML = shell("Bases", "Cadastro e ativação de bases logísticas por organização.", `
    <form id="baseForm" class="admin-form">
      <input type="hidden" name="id">
      <label>Organização *<select name="organization_id" required><option value="">Selecione...</option>${options(orgs, "", "id", "name")}</select></label>
      <label>Nome da base *<input name="name" required maxlength="160"></label>
      <label>Código<input name="code" maxlength="80"></label>
      <label>CNPJ<input name="cnpj" inputmode="numeric" maxlength="18"></label>
      <label>Endereço<input name="address" maxlength="240"></label>
      <label>CEP<input name="cep" inputmode="numeric" maxlength="9"></label>
      <label>Região<input name="region" maxlength="120"></label>
      <label>Cliente/operação<input name="client_operation" maxlength="160"></label>
      <label>Tipo de operação<input name="operation_type" maxlength="120"></label>
      <label>Status<select name="status"><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
      <div class="admin-actions"><button class="admin-primary" type="submit">Salvar base</button><button class="admin-secondary" type="reset">Limpar</button></div>
      <p class="admin-help">A alteração de status é reversível. Não há exclusão física para preservar a rastreabilidade.</p>
    </form>`, `
      <table class="admin-table"><thead><tr><th>Base</th><th>Organização</th><th>Operação</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody>${bases.map((base) => `<tr><td><strong>${escapeHtml(base.name)}</strong><small>${escapeHtml(base.code || "Sem código")}</small></td><td>${escapeHtml(orgName(base.organization_id))}</td><td>${escapeHtml(base.client_operation || "—")}</td><td>${escapeHtml(statusLabel(base.status))}</td><td><button type="button" class="admin-secondary" data-edit-base="${escapeHtml(base.id)}">Editar</button></td></tr>`).join("") || '<tr><td colspan="5">Nenhuma base visível para esta conta.</td></tr>'}</tbody></table>`);
  const form = document.getElementById("baseForm");
  form.addEventListener("reset", () => { form.elements.id.value = ""; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      organization_id: data.organization_id, name: data.name.trim(),
      code: data.code.trim() || null, cnpj: data.cnpj.trim() || null,
      address: data.address.trim() || null, cep: data.cep.trim() || null,
      region: data.region.trim() || null, client_operation: data.client_operation.trim() || null,
      operation_type: data.operation_type.trim() || null, status: data.status
    };
    const result = data.id
      ? await supabase.from("bases").update(payload).eq("id", data.id)
      : await supabase.from("bases").insert({ ...payload, created_by: userId });
    if (result.error) return setNotice(`Não foi possível salvar. ${result.error.message}`, "error");
    await renderBases(content, userId);
    setNotice("Base salva.", "success");
  });
  content.querySelectorAll("[data-edit-base]").forEach((button) => button.addEventListener("click", () => {
    const item = bases.find((base) => base.id === button.dataset.editBase);
    if (!item) return;
    Object.entries(item).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value ?? "";
    });
    form.elements.name.focus();
  }));
}

async function renderUsers(content, userId) {
  const [profilesResult, rolesResult, orgsResult, basesResult] = await Promise.all([
    supabase.from("user_profiles").select("user_id,full_name,is_active,created_at").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("id,user_id,role_code,organization_id").neq("role_code", "MASTER"),
    supabase.from("organizations").select("id,name").order("name"),
    supabase.from("bases").select("id,name,organization_id").order("name")
  ]);
  for (const result of [profilesResult, rolesResult, orgsResult, basesResult]) if (result.error) throw result.error;
  const profiles = profilesResult.data || [];
  const roles = rolesResult.data || [];
  const orgs = orgsResult.data || [];
  const bases = basesResult.data || [];
  const profileName = (id) => profiles.find((profile) => profile.user_id === id)?.full_name || id;
  const orgName = (id) => orgs.find((org) => org.id === id)?.name || "—";
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">SAFELINK · ADMINISTRAÇÃO</p><h1>Usuários e acessos</h1><p class="page-description">Perfis e papéis de usuários Auth já existentes.</p></div><span class="date-chip">MASTER obrigatório</span></div>
    <div id="adminNotice" class="notice" role="status" hidden><span class="notice-icon">i</span><div></div></div>
    <div class="notice"><span class="notice-icon">i</span><div><strong>Criação de contas desabilitada nesta etapa</strong><p>O navegador não recebe a chave administrativa. Convites/criação de usuários exigem um fluxo de backend seguro ou provisionamento administrativo controlado. Nenhum usuário será promovido a MASTER por esta tela.</p></div></div>
    <div class="admin-layout">
      <section class="panel"><div class="panel-heading"><div><h2>Perfil e papel</h2><p>Selecione uma conta Auth existente.</p></div></div>
        <form id="userForm" class="admin-form">
          <label>Usuário *<select name="user_id" required><option value="">Selecione...</option>${options(profiles, "", "user_id", "full_name")}</select></label>
          <label>Nome completo<input name="full_name" maxlength="160" autocomplete="name" placeholder="Nome para exibição"></label>
          <label>Status da conta<select name="is_active"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
          <label>Papel a adicionar<select name="role_code"><option value="">Não adicionar papel</option>${roleOptions.map((role) => `<option value="${role.value}">${role.label}</option>`).join("")}</select></label>
          <label>Organização do papel<select name="organization_id"><option value="">Selecione...</option>${options(orgs, "", "id", "name")}</select></label>
          <label>Base opcional<select name="base_id"><option value="">Sem alteração de base</option>${options(bases, "", "id", "name")}</select></label>
          <div class="admin-actions"><button class="admin-primary" type="submit">Salvar perfil e papel</button></div>
          <p class="admin-help">Atribuir papel é uma elevação de acesso, permitida pelo banco apenas a MASTER. MASTER não pode ser atribuído por esta interface.</p>
        </form>
      </section>
      <section class="panel"><div class="panel-heading"><div><h2>Usuários existentes</h2><p>${profiles.length} perfil(is) visível(is).</p></div></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Usuário</th><th>Status</th><th>Papéis</th></tr></thead><tbody>
        ${profiles.map((profile) => `<tr><td><strong>${escapeHtml(profile.full_name || "Sem nome")}</strong><small><code>${escapeHtml(profile.user_id)}</code></small></td><td>${profile.is_active ? "Ativo" : "Inativo"}</td><td>${escapeHtml(roles.filter((role) => role.user_id === profile.user_id).map((role) => `${role.role_code} · ${orgName(role.organization_id)}`).join(", ") || "Sem papel")}</td></tr>`).join("") || '<tr><td colspan="3">Nenhum perfil visível.</td></tr>'}
        </tbody></table></div>
      </section>
    </div>`;
  const form = document.getElementById("userForm");
  form.elements.user_id.addEventListener("change", () => {
    const selected = profiles.find((profile) => profile.user_id === form.elements.user_id.value);
    form.elements.full_name.value = selected?.full_name || "";
    form.elements.is_active.value = String(selected?.is_active ?? true);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.user_id) return setNotice("Selecione um usuário existente.", "error");
    if (data.user_id === userId && data.is_active === "false") return setNotice("Você não pode desativar a própria conta MASTER durante a sessão.", "error");
    if (data.base_id && !data.role_code) return setNotice("Para vincular uma base, selecione também um papel.", "error");
    const profileResult = await supabase.from("user_profiles").update({ full_name: data.full_name.trim() || null, is_active: data.is_active === "true" }).eq("user_id", data.user_id);
    if (profileResult.error) return setNotice(`Não foi possível atualizar o perfil. ${profileResult.error.message}`, "error");
    if (data.role_code) {
      if (!data.organization_id) return setNotice("Selecione uma organização para o papel.", "error");
      const duplicate = roles.some((role) => role.user_id === data.user_id && role.role_code === data.role_code && role.organization_id === data.organization_id);
      if (!duplicate) {
        const roleResult = await supabase.from("user_roles").insert({
          user_id: data.user_id, role_code: data.role_code,
          organization_id: data.organization_id, assigned_by: userId
        });
        if (roleResult.error) return setNotice(`Não foi possível atribuir o papel. ${roleResult.error.message}`, "error");
      }
      if (data.base_id) {
        const membership = await supabase.from("base_memberships").select("id").eq("user_id", data.user_id).eq("base_id", data.base_id).maybeSingle();
        if (membership.error) return setNotice(`Papel salvo; não foi possível verificar vínculo de base. ${membership.error.message}`, "error");
        if (!membership.data) {
          const addMembership = await supabase.from("base_memberships").insert({
            user_id: data.user_id, base_id: data.base_id, assigned_by: userId, status: "active"
          });
          if (addMembership.error) return setNotice(`O papel foi salvo, mas o vínculo de base não foi criado. ${addMembership.error.message}`, "error");
        }
      }
    }
    await renderUsers(content, userId);
    setNotice("Atribuições solicitadas foram processadas.", "success");
  });
}

export async function renderAdminView(view, content, userId) {
  const isMaster = await requireMaster(userId);
  if (!isMaster) {
    content.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">SAFELINK · ACESSO RESTRITO</p><h1>Permissão insuficiente</h1>
      <p class="page-description">Este módulo exige o papel MASTER.</p></div></div>
      <div class="notice" role="alert"><span class="notice-icon">!</span><div><strong>Operação bloqueada</strong><p>O controle real é aplicado pelo PostgreSQL/RLS. Esta verificação de interface não substitui as políticas do banco.</p></div></div>`;
    return;
  }
  try {
    if (view === "organizacoes") await renderOrganizations(content, userId);
    else if (view === "bases") await renderBases(content, userId);
    else if (view === "usuarios") await renderUsers(content, userId);
  } catch (error) {
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">SAFELINK · ADMINISTRAÇÃO</p><h1>Falha ao carregar</h1></div></div>
      <div class="notice" role="alert"><span class="notice-icon">!</span><div><strong>Não foi possível consultar os dados</strong><p>${escapeHtml(error?.message || "Erro inesperado.")}</p><p>Nenhuma operação foi considerada concluída.</p></div></div>`;
  }
}
