import { supabase } from "./supabase-client.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const date = (value) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const statusText = (value) => ({active:"Ativo",inactive:"Inativo",pending:"Pendente",planned:"Planejada",in_progress:"Em andamento",dispatched:"Expedida",completed:"Concluída",cancelled:"Cancelada"}[value] || value || "—");

function heading(title, desc) {
  return '<div class="page-heading"><div><p class="eyebrow">SAFELINK · OPERAÇÃO</p><h1>' + esc(title) + '</h1><p class="page-description">' + esc(desc) + '</p></div><span class="date-chip">Dados autorizados do Supabase</span></div>';
}
function notice(message, type="info") {
  return '<div class="notice" role="status" data-type="' + esc(type) + '"><span class="notice-icon">i</span><div>' + esc(message) + '</div></div>';
}
function table(headers, rows, empty) {
  return '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' + headers.map(h=>'<th>'+esc(h)+'</th>').join("") + '</tr></thead><tbody>' +
    (rows.length ? rows.join("") : '<tr><td colspan="' + headers.length + '">' + esc(empty || "Nenhum registro visível para esta conta.") + '</td></tr>') +
    '</tbody></table></div>';
}
async function queryRows(tableName, columns, limit=500) {
  const {data,error} = await supabase.from(tableName).select(columns).order("created_at",{ascending:false}).limit(limit);
  if (error) throw error;
  return data || [];
}
function searchPanel(content, title, desc, headers, records, renderRow, empty) {
  content.innerHTML = heading(title,desc) +
    '<section class="panel"><div class="panel-heading"><div><h2>Registros</h2><p>' + records.length + ' registro(s) carregado(s) conforme suas permissões.</p></div></div>' +
    '<label>Pesquisar <input id="dataViewSearch" type="search" placeholder="Digite para filtrar os registros"></label>' +
    '<div id="dataViewTable">' + table(headers,records.map(renderRow),empty) + '</div></section>';
  const search = content.querySelector("#dataViewSearch");
  search.addEventListener("input",()=>{
    const q=search.value.trim().toLocaleLowerCase("pt-BR");
    const filtered=records.filter(row=>JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(q));
    content.querySelector("#dataViewTable").innerHTML=table(headers,filtered.map(renderRow),empty);
  });
}
async function renderClients(content,userId) {
  const [orgResult, clientResult] = await Promise.all([
    supabase.from("organizations").select("id,name").eq("status","active").order("name"),
    queryRows("clients","id,organization_id,name,code,status,created_at")
  ]);
  if(orgResult.error) throw orgResult.error;
  const orgs=orgResult.data||[];
  const orgName=id=>orgs.find(o=>o.id===id)?.name||"Organização sem acesso";
  content.innerHTML=heading("Clientes","Cadastre e mantenha os clientes da organização.")+
    '<div id="clientNotice" class="notice" role="status" hidden></div><div class="admin-layout">'+
    '<section class="panel"><div class="panel-heading"><div><h2 id="clientFormTitle">Novo cliente</h2><p>Os limites de acesso são aplicados pelo Supabase.</p></div></div>'+
    '<form id="clientForm" class="admin-form"><input type="hidden" name="id">'+
    '<label>Organização *<select name="organization_id" required><option value="">Selecione...</option>'+orgs.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.name)+'</option>').join("")+'</select></label>'+
    '<label>Nome do cliente *<input name="name" required maxlength="160"></label><label>Código<input name="code" maxlength="80"></label>'+
    '<label>Status<select name="status"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>'+
    '<div class="admin-actions"><button class="admin-primary" type="submit">Salvar cliente</button><button class="admin-secondary" type="reset">Limpar</button></div></form></section>'+
    '<section class="panel"><div class="panel-heading"><div><h2>Clientes cadastrados</h2><p>'+clientResult.length+' registro(s) visível(is).</p></div></div>'+
    table(["Cliente","Código","Organização","Status","Ações"],clientResult.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.code||"—")+'</td><td>'+esc(orgName(c.organization_id))+'</td><td>'+esc(statusText(c.status))+'</td><td><button type="button" class="admin-secondary" data-edit-client="'+esc(c.id)+'">Editar</button></td></tr>'),"Nenhum cliente cadastrado.")+
    '</section></div>';
  const form=content.querySelector("#clientForm"), noticeBox=content.querySelector("#clientNotice");
  const msg=(m,type="info")=>{noticeBox.hidden=false;noticeBox.dataset.type=type;noticeBox.textContent=m;};
  form.addEventListener("reset",()=>{form.elements.id.value="";content.querySelector("#clientFormTitle").textContent="Novo cliente";});
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const d=Object.fromEntries(new FormData(form).entries());
    const payload={organization_id:d.organization_id,name:d.name.trim(),code:d.code.trim()||null,status:d.status};
    const result=d.id?await supabase.from("clients").update(payload).eq("id",d.id):await supabase.from("clients").insert({...payload,created_by:userId});
    if(result.error)return msg("Não foi possível salvar: "+result.error.message,"error");
    await renderClients(content,userId);
  });
  content.querySelectorAll("[data-edit-client]").forEach(btn=>btn.addEventListener("click",()=>{
    const c=clientResult.find(x=>x.id===btn.dataset.editClient);if(!c)return;
    for(const [k,v] of Object.entries(c))if(form.elements[k])form.elements[k].value=v??"";
    content.querySelector("#clientFormTitle").textContent="Editar cliente";
    form.elements.name.focus();
  }));
}
async function renderDrivers(content,userId) {
  const [baseResult, driverRows]=await Promise.all([
    supabase.from("bases").select("id,organization_id,name").eq("status","active").order("name"),
    queryRows("drivers","id,organization_id,base_id,driver_code,full_name,phone,status,created_at")
  ]);
  if(baseResult.error)throw baseResult.error;
  const bases=baseResult.data||[];
  const baseName=id=>bases.find(b=>b.id===id)?.name||"Base sem acesso";
  content.innerHTML=heading("Motoristas","Consulte motoristas por base. Cadastro e alteração dependem das permissões atribuídas à sua conta.")+
    '<div id="driverNotice" class="notice" role="status" hidden></div><div class="admin-layout"><section class="panel"><div class="panel-heading"><div><h2 id="driverFormTitle">Novo motorista</h2><p>O vínculo de base é obrigatório.</p></div></div>'+
    '<form id="driverForm" class="admin-form"><input type="hidden" name="id"><label>Base *<select name="base_id" required><option value="">Selecione...</option>'+bases.map(b=>'<option value="'+esc(b.id)+'" data-org="'+esc(b.organization_id)+'">'+esc(b.name)+'</option>').join("")+'</select></label>'+
    '<label>Código<input name="driver_code" maxlength="80"></label><label>Nome completo *<input name="full_name" required maxlength="160"></label><label>Telefone<input name="phone" maxlength="50"></label>'+
    '<label>Status<select name="status"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label><div class="admin-actions"><button class="admin-primary" type="submit">Salvar motorista</button><button class="admin-secondary" type="reset">Limpar</button></div></form></section>'+
    '<section class="panel"><div class="panel-heading"><div><h2>Motoristas cadastrados</h2><p>'+driverRows.length+' registro(s) visível(is).</p></div></div>'+
    table(["Motorista","Código","Telefone","Base","Status","Ações"],driverRows.map(d=>'<tr><td>'+esc(d.full_name)+'</td><td>'+esc(d.driver_code||"—")+'</td><td>'+esc(d.phone||"—")+'</td><td>'+esc(baseName(d.base_id))+'</td><td>'+esc(statusText(d.status))+'</td><td><button type="button" class="admin-secondary" data-edit-driver="'+esc(d.id)+'">Editar</button></td></tr>'),"Nenhum motorista cadastrado.")+
    '</section></div>';
  const form=content.querySelector("#driverForm"), noticeBox=content.querySelector("#driverNotice");
  const msg=(m,type="info")=>{noticeBox.hidden=false;noticeBox.dataset.type=type;noticeBox.textContent=m;};
  form.addEventListener("reset",()=>{form.elements.id.value="";content.querySelector("#driverFormTitle").textContent="Novo motorista";});
  form.elements.base_id.addEventListener("change",()=>{});
  form.addEventListener("submit",async e=>{
    e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());
    const base=bases.find(b=>b.id===d.base_id);if(!base)return msg("Selecione uma base válida.","error");
    const payload={organization_id:base.organization_id,base_id:base.id,driver_code:d.driver_code.trim()||null,full_name:d.full_name.trim(),phone:d.phone.trim()||null,status:d.status};
    const result=d.id?await supabase.from("drivers").update(payload).eq("id",d.id):await supabase.from("drivers").insert({...payload,created_by:userId});
    if(result.error)return msg("Não foi possível salvar: "+result.error.message,"error");
    await renderDrivers(content,userId);
  });
  content.querySelectorAll("[data-edit-driver]").forEach(btn=>btn.addEventListener("click",()=>{
    const d=driverRows.find(x=>x.id===btn.dataset.editDriver);if(!d)return;
    for(const [k,v] of Object.entries(d))if(form.elements[k])form.elements[k].value=v??"";
    content.querySelector("#driverFormTitle").textContent="Editar motorista";form.elements.full_name.focus();
  }));
}
async function renderPackages(content) {
  const rows=await queryRows("packages","id,base_id,label,last_status_source,source_last_read_at,sla_reference_date,station_source,source_driver_name,postal_code,destination_neighborhood,created_at");
  const headers=["Etiqueta","Status da fonte","Data última leitura","Data SLA","Estação","Motorista (fonte)","CEP","Bairro","Criado em"];
  searchPanel(content,"Pacotes","Consulte pacotes importados. Horários não são usados nos indicadores D+0.",headers,rows,p=>
    '<tr><td><strong>'+esc(p.label)+'</strong></td><td>'+esc(p.last_status_source||"—")+'</td><td>'+esc(p.source_last_read_at?.slice(0,10)||"—")+'</td><td>'+esc(p.sla_reference_date||"—")+'</td><td>'+esc(p.station_source||"—")+'</td><td>'+esc(p.source_driver_name||"—")+'</td><td>'+esc(p.postal_code||"—")+'</td><td>'+esc(p.destination_neighborhood||"—")+'</td><td>'+esc(date(p.created_at))+'</td>'
  ,"Nenhum pacote importado ainda.");
}
async function renderExpeditions(content) {
  const [rows,drivers]=await Promise.all([queryRows("expeditions","id,base_id,code,driver_id,status,planned_at,dispatched_at,closed_at,notes,created_at"),queryRows("drivers","id,full_name")]);
  const driverName=id=>drivers.find(d=>d.id===id)?.full_name||"Não atribuído";
  searchPanel(content,"Expedições","Consulta das expedições existentes. A criação e a distribuição de pacotes ainda exigem o fluxo operacional completo.",["Código","Motorista","Status","Planejada","Expedida","Encerrada","Observações"],rows,e=>
    '<tr><td>'+esc(e.code)+'</td><td>'+esc(driverName(e.driver_id))+'</td><td>'+esc(statusText(e.status))+'</td><td>'+esc(date(e.planned_at))+'</td><td>'+esc(date(e.dispatched_at))+'</td><td>'+esc(date(e.closed_at))+'</td><td>'+esc(e.notes||"—")+'</td>',"Nenhuma expedição cadastrada.");
}
async function renderRoutes(content) {
  const [rows,drivers]=await Promise.all([queryRows("routes","id,base_id,code,name,driver_id,status,sequence_method,planned_at,started_at,completed_at,created_at"),queryRows("drivers","id,full_name")]);
  const driverName=id=>drivers.find(d=>d.id===id)?.full_name||"Não atribuído";
  searchPanel(content,"Rotas e entregas","Consulta de rotas existentes. Otimização geográfica e baixa de entrega ainda não estão ativadas.",["Código","Rota","Motorista","Status","Sequência","Planejada","Início","Conclusão"],rows,r=>
    '<tr><td>'+esc(r.code||"—")+'</td><td>'+esc(r.name||"—")+'</td><td>'+esc(driverName(r.driver_id))+'</td><td>'+esc(statusText(r.status))+'</td><td>'+esc(r.sequence_method||"—")+'</td><td>'+esc(date(r.planned_at))+'</td><td>'+esc(date(r.started_at))+'</td><td>'+esc(date(r.completed_at))+'</td>',"Nenhuma rota cadastrada.");
}
async function renderAudit(content) {
  const rows=await queryRows("audit_events","id,event_type,target_type,target_id,actor_user_id,organization_id,base_id,details,created_at");
  searchPanel(content,"Auditoria e histórico","Eventos administrativos e de segurança visíveis à sua conta MASTER.",["Data","Evento","Alvo","ID do alvo","Usuário","Detalhes"],rows,r=>
    '<tr><td>'+esc(date(r.created_at))+'</td><td>'+esc(r.event_type)+'</td><td>'+esc(r.target_type||"—")+'</td><td><code>'+esc(r.target_id||"—")+'</code></td><td><code>'+esc(r.actor_user_id||"sistema")+'</code></td><td>'+esc(JSON.stringify(r.details||{}))+'</td>',"Nenhum evento de auditoria visível.");
}
async function renderReports(content) {
  const specs=[["Pacotes","packages"],["Motoristas","drivers"],["Expedições","expeditions"],["Rotas","routes"],["Clientes","clients"],["Importações","import_batches"]];
  const counts=await Promise.all(specs.map(async ([label,tableName])=>{
    const {count,error}=await supabase.from(tableName).select("id",{count:"exact",head:true});
    if(error)throw error;return {label,count:count||0};
  }));
  content.innerHTML=heading("Indicadores e relatórios","Contagens reais dos registros visíveis no banco. Não substituem as fórmulas SLA ainda pendentes de validação.")+
    '<div class="metrics-grid">'+counts.map(c=>'<article class="metric-card"><div class="metric-top"><span>'+esc(c.label)+'</span></div><strong class="metric-value">'+c.count.toLocaleString("pt-BR")+'</strong><p>Registros visíveis pela sessão atual</p></article>').join("")+'</div>'+
    notice("Indicadores de SLA, meta de 95%, gap e tolerância não são calculados aqui para evitar apresentar fórmulas não validadas.");
}
async function renderAdministration(content) {
  const [orgs,bases,profiles,roles]=await Promise.all([
    supabase.from("organizations").select("id",{count:"exact",head:true}),
    supabase.from("bases").select("id",{count:"exact",head:true}),
    supabase.from("user_profiles").select("user_id",{count:"exact",head:true}),
    supabase.from("user_roles").select("id",{count:"exact",head:true})
  ]);
  for(const r of [orgs,bases,profiles,roles])if(r.error)throw r.error;
  content.innerHTML=heading("Administração","Resumo de configuração do ambiente SafeLink.")+
    '<div class="metrics-grid">'+[["Organizações",orgs.count],["Bases",bases.count],["Perfis de usuário",profiles.count],["Atribuições de papel",roles.count]].map(([l,n])=>'<article class="metric-card"><div class="metric-top"><span>'+l+'</span></div><strong class="metric-value">'+(n||0)+'</strong></article>').join("")+'</div>'+
    notice("A matriz granular de permissões ainda não está implementada. O acesso atual continua limitado pelas políticas RLS e pelos papéis existentes.","warning");
}
export async function renderOperationalView(view,content,userId) {
  try {
    if(view==="clientes")return await renderClients(content,userId);
    if(view==="motoristas")return await renderDrivers(content,userId);
    if(view==="pacotes")return await renderPackages(content);
    if(view==="expedicoes")return await renderExpeditions(content);
    if(view==="rotas")return await renderRoutes(content);
    if(view==="relatorios")return await renderReports(content);
    if(view==="auditoria")return await renderAudit(content);
    if(view==="administracao")return await renderAdministration(content);
    content.innerHTML=heading("Módulo indisponível","Esta área ainda não possui uma implementação funcional.");
  } catch(error) {
    content.innerHTML=heading("Falha ao carregar módulo","A consulta ao banco não foi concluída.")+
      '<div class="notice" role="alert"><span class="notice-icon">!</span><div><strong>Erro ao consultar dados</strong><p>'+esc(error?.message||"Erro inesperado.")+'</p><p>Nenhuma operação foi considerada concluída.</p><button type="button" class="admin-secondary" id="retryDataView">Tentar novamente</button></div></div>';
    content.querySelector("#retryDataView")?.addEventListener("click",()=>renderOperationalView(view,content,userId));
  }
}
