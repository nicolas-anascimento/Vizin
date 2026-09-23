// ---------- Navegação entre abas ----------
const tabAjuda = document.getElementById('tab-ajuda');
const tabDenuncia = document.getElementById('tab-denuncia');
const panelAjuda = document.getElementById('panel-ajuda');
const panelDenuncia = document.getElementById('panel-denuncia');
 
function setActiveTab(tab){
  const isAjuda = tab === 'ajuda';
  const isDenuncia = tab === 'denuncia';
 
  tabAjuda.classList.toggle('active', isAjuda);
  tabDenuncia.classList.toggle('active', isDenuncia);
 
  panelAjuda.classList.toggle('show', isAjuda);
  panelDenuncia.classList.toggle('show', isDenuncia);
}
 
tabAjuda.addEventListener('click', () => setActiveTab('ajuda'));
tabDenuncia.addEventListener('click', () => setActiveTab('denuncia'));
 
// Aba "Ajuda" ativa por padrão — só é sobrescrita se a URL trouxer
// contexto de denúncia (ver lerContextoDaURL logo abaixo).
setActiveTab('ajuda');
 
// ---------- Utilitários de validação ----------
function showFieldError(fieldEl, show){
  fieldEl.classList.toggle('invalid', show);
}
 
function showStatus(el, type, message, protocolo){
  el.innerHTML = protocolo
    ? `${message}<span class="protocolo">Protocolo: #${protocolo}</span>`
    : message;
  el.className = `status-msg ${type}`;
}
 
function clearStatus(el){
  el.textContent = '';
  el.className = 'status-msg';
}
 
// ---------- Toast ----------
// Reaproveita o mesmo #toast e as mesmas classes (.toast / .toast.show /
// .toast.sucesso) já definidas no footer.css e usadas no toast de
// "Copiado ✔" do e-mail — assim o visual fica idêntico em toda a plataforma.
const toastEl = document.getElementById('toast');
let toastTimeoutId;
 
function showToast(message, variante = 'sucesso'){
  clearTimeout(toastTimeoutId);
  toastEl.textContent = message;
  toastEl.classList.remove('sucesso');
  if (variante === 'sucesso') toastEl.classList.add('sucesso');
  toastEl.classList.add('show');
  toastTimeoutId = setTimeout(() => toastEl.classList.remove('show'), 2500);
}
 
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// A notificação "Você recebeu uma resposta por e-mail" deve ser criada
// pelo back-end no momento em que a resposta for realmente enviada (ex:
// quando o atendente responde pelo painel de suporte, ou via webhook do
// serviço de e-mail) — não há nada para o front-end fazer aqui além de
// exibir a notificação quando ela chegar (ver Notificacoes-shared.js).
 
/* =========================================================
   CONTEXTO VINDO DE OUTRAS TELAS (Perfil / Produto / Histórico)
   =========================================================
   Cada botão "Denunciar" do resto do site manda pra cá alguns
   parâmetros na URL, pra pessoa não precisar redigitar quem/o que
   está denunciando. Parâmetros aceitos (todos opcionais):
 
     tipo=denuncia            -> força abrir na aba Denúncia
     motivo=<chave>           -> pré-seleciona o <select> de motivo
     usuarioId / usuarioNome  -> denúncia de um usuário (vem do Perfil)
     produtoId / produtoTitulo
     proprietarioId / proprietarioNome  -> denúncia de um anúncio (vem do Produto)
     aluguelId / outraParteNome         -> denúncia ligada a um aluguel
                                            específico (vem do Histórico,
                                            ou do Produto quando já existe
                                            uma locação aprovada)
     assunto / mensagem       -> pré-preenche o campo de texto livre da aba
                                  atual (Ajuda ou Denúncia, o que estiver
                                  ativo). Ex: link "Fale com o Suporte" da
                                  página de Pagamento-multa.
 
   Nenhum desses vem por acaso: back-end recebe motivo + contra +
   produtoId + aluguelId junto do texto livre (ver montarPayloadDenuncia).
   ========================================================= */
const params = new URLSearchParams(window.location.search);
 
const contexto = {
  usuarioId: params.get('usuarioId') || null,
  usuarioNome: params.get('usuarioNome') || null,
  produtoId: params.get('produtoId') || null,
  produtoTitulo: params.get('produtoTitulo') || null,
  proprietarioId: params.get('proprietarioId') || null,
  proprietarioNome: params.get('proprietarioNome') || null,
  aluguelId: params.get('aluguelId') || null,
  outraParteNome: params.get('outraParteNome') || null,
  motivo: params.get('motivo') || null,
  // Pré-preenchimento de texto livre — usado por telas que já sabem
  // exatamente o que a pessoa quer perguntar/denunciar (ex: o link "Fale
  // com o Suporte" da página de Pagamento-multa), pra não fazer ela
  // redigitar o contexto que a própria plataforma já tinha.
  assunto: params.get('assunto') || null,
  mensagem: params.get('mensagem') || null
};
 
const contraId = contexto.usuarioId || contexto.proprietarioId || null;
const contraNome = contexto.usuarioNome || contexto.proprietarioNome || contexto.outraParteNome || null;
 
const temContexto = !!(contraId || contexto.produtoId || contexto.aluguelId || params.get('tipo') === 'denuncia');
 
const motivoSelect = document.getElementById('denuncia-motivo');
const MOTIVOS_VALIDOS = Array.from(motivoSelect.options).map(o => o.value).filter(Boolean);
 
const contextoChip = document.getElementById('denuncia-contexto');
const contextoChipTexto = document.getElementById('denuncia-contexto-texto');
const contextoChipLimpar = document.getElementById('denuncia-contexto-limpar');
const aluguelIdInput = document.getElementById('denuncia-aluguel-id');
 
function montarTextoContexto(){
  const partes = [];
  if (contraNome) partes.push(`usuário <strong>${escapeHtml(contraNome)}</strong>`);
  if (contexto.produtoTitulo) partes.push(`anúncio <strong>${escapeHtml(contexto.produtoTitulo)}</strong>`);
  if (contexto.aluguelId) partes.push(`aluguel <strong>#${escapeHtml(contexto.aluguelId)}</strong>`);
  if (!partes.length) return null;
  return `Denunciando: ${partes.join(' &middot; ')}`;
}
 
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
 
// Formata "aaaa-mm-dd" pra "dd/mm/aaaa" (mesmo formato usado no Histórico).
function formatarDataCurta(dataStr){
  if (!dataStr) return null;
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}
 
/* =========================================================
   SELECT "ALUGUEL RELACIONADO"
   =========================================================
   Antes a pessoa tinha que digitar o ID do aluguel de cabeça. Agora a
   lista vem dos aluguéis reais dela (mesma fonte de dados do Histórico:
   window.SolicitacoesVizin), então ela escolhe em vez de adivinhar um
   número. Continua opcional — a opção "Nenhum específico" cobre quem
   está denunciando algo sem vínculo com uma locação específica (ex: um
   anúncio, antes de existir qualquer aluguel entre as partes).
   ========================================================= */
function obterAlugueisDoUsuario(){
  if (!window.SolicitacoesVizin) return [];
 
  // O cache de SolicitacoesVizin já traz só as locações em que sou parte (o back filtra).
  return window.SolicitacoesVizin.obterTodas()
    .filter(s => s.souSolicitante || s.souProprietario)
    .map(s => {
      const souSolicitante = s.souSolicitante;
      return {
        id: s.id,
        produtoTitulo: s.produtoTitulo || 'Objeto',
        outraParteNome: souSolicitante ? (s.proprietarioNome || 'Proprietário') : (s.solicitanteNome || 'Locatário'),
        dataRetirada: formatarDataCurta(s.dataRetirada),
        criadaEm: s.criadaEm || ''
      };
    })
    // ids são UUID: mais recentes primeiro pela data de criação
    .sort((a, b) => String(b.criadaEm).localeCompare(String(a.criadaEm)));
}
 
function popularSelectAlugueis(){
  const alugueis = obterAlugueisDoUsuario();
 
  alugueis.forEach(a => {
    const option = document.createElement('option');
    option.value = String(a.id);
    option.textContent = a.dataRetirada
      ? `${a.produtoTitulo} — ${a.outraParteNome} (${a.dataRetirada})`
      : `${a.produtoTitulo} — ${a.outraParteNome}`;
    aluguelIdInput.appendChild(option);
  });
 
  // Se o contexto (URL) trouxe um aluguelId que não está na lista acima
  // — ex: dado mock incompleto, ou a pessoa denunciando um aluguel que
  // por algum motivo não apareceu na busca — adiciona ele também, pra
  // não perder a pré-seleção vinda do botão "Denunciar".
  if (contexto.aluguelId && !alugueis.some(a => String(a.id) === contexto.aluguelId)) {
    const option = document.createElement('option');
    option.value = contexto.aluguelId;
    option.textContent = `Aluguel #${contexto.aluguelId}`;
    aluguelIdInput.appendChild(option);
  }
}

function aplicarContexto(){
  if (temContexto) setActiveTab('denuncia');
 
  const texto = montarTextoContexto();
  if (texto) {
    contextoChipTexto.innerHTML = texto;
    contextoChip.classList.remove('hidden');
  }
 
  if (contexto.aluguelId) aluguelIdInput.value = contexto.aluguelId;
 
  if (contexto.motivo && MOTIVOS_VALIDOS.includes(contexto.motivo)) {
    motivoSelect.value = contexto.motivo;
  }
 
  // assunto/mensagem vão pro formulário da aba que a própria URL já ativou
  // acima (Denúncia se temContexto/tipo=denuncia, Ajuda caso contrário).
  if (temContexto) {
    if (contexto.assunto) document.getElementById('denuncia-assunto').value = contexto.assunto;
    if (contexto.mensagem) document.getElementById('denuncia-mensagem').value = contexto.mensagem;
  } else {
    if (contexto.assunto) document.getElementById('ajuda-assunto').value = contexto.assunto;
    if (contexto.mensagem) document.getElementById('ajuda-mensagem').value = contexto.mensagem;
  }
}
 
// Botão "x" do chip: some com o contexto visual (a pessoa quer denunciar
// outra coisa, não precisa recarregar a página), mas mantém o que ela já
// tiver preenchido no formulário.
contextoChipLimpar.addEventListener('click', () => {
  contextoChip.classList.add('hidden');
});
 
// As locações vêm do back (cache de SolicitacoesVizin): espera a 1ª carga antes de
// preencher a lista. A pré-seleção vinda da URL (aluguelId) é reaplicada em seguida.
(window.SolicitacoesVizin ? window.SolicitacoesVizin.pronto : Promise.resolve()).then(() => {
  popularSelectAlugueis();
  if (contexto.aluguelId) aluguelIdInput.value = contexto.aluguelId;
});
aplicarContexto();
 
const MAX_ANEXO_MB = 25;
const TIPOS_ANEXO_PERMITIDOS_PREFIXO = ['image/', 'video/'];
const TIPOS_ANEXO_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
 
const anexoInput = document.getElementById('denuncia-anexo');
const anexoBtn = document.getElementById('denuncia-anexo-btn');
const anexoNomeEl = document.getElementById('denuncia-anexo-nome');
let anexoSelecionado = null;
 
anexoBtn.addEventListener('click', () => anexoInput.click());
 
anexoInput.addEventListener('change', () => {
  const file = anexoInput.files[0];
  if (!file) return;
 
  const tamanhoMb = file.size / (1024 * 1024);
  const tipoOk = TIPOS_ANEXO_PERMITIDOS_PREFIXO.some(p => file.type.startsWith(p)) ||
    TIPOS_ANEXO_PERMITIDOS.includes(file.type);
 
  if (tamanhoMb > MAX_ANEXO_MB) {
    showToast(`Arquivo muito grande. O limite é ${MAX_ANEXO_MB}MB.`, 'erro');
    anexoInput.value = '';
    return;
  }
  if (!tipoOk) {
    showToast('Tipo de arquivo não suportado.', 'erro');
    anexoInput.value = '';
    return;
  }
 
  anexoSelecionado = file;
  anexoNomeEl.textContent = file.name;
  anexoNomeEl.classList.add('preenchido');
});
 
function limparAnexo(){
  anexoSelecionado = null;
  anexoInput.value = '';
  anexoNomeEl.textContent = 'Nenhum arquivo selecionado';
  anexoNomeEl.classList.remove('preenchido');
}
 
// ---------- Formulário: Ajuda ----------
const formAjuda = document.getElementById('form-ajuda');
const ajudaStatus = document.getElementById('ajuda-status');
const ajudaBtn = document.getElementById('ajuda-submit-btn');
 
formAjuda.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearStatus(ajudaStatus);
 
  const assuntoEl = document.getElementById('ajuda-assunto');
  const mensagemEl = document.getElementById('ajuda-mensagem');
  const assunto = assuntoEl.value.trim();
  const mensagem = mensagemEl.value.trim();
 
  const assuntoField = document.getElementById('ajuda-assunto-field');
  const mensagemField = document.getElementById('ajuda-mensagem-field');
 
  let valid = true;
  if (!assunto) { showFieldError(assuntoField, true); valid = false; }
  else { showFieldError(assuntoField, false); }
 
  if (!mensagem) { showFieldError(mensagemField, true); valid = false; }
  else { showFieldError(mensagemField, false); }
 
  if (!valid) return;
 
  const payload = { assunto, mensagem };
 
  ajudaBtn.disabled = true;
  ajudaBtn.textContent = 'Enviando...';
 
  try {
    const data = await window.ApiVizin.post('/suporte/ajuda', payload);
    const protocolo = data.protocolo;
    showStatus(ajudaStatus, 'success', 'Mensagem enviada com sucesso! Nossa equipe vai te responder em breve.', protocolo);
    showToast('Mensagem enviada ✔');
    formAjuda.reset();
    carregarMeusChamados();
  } catch (err) {
    showStatus(ajudaStatus, 'error', 'Não foi possível enviar sua mensagem agora. Tente novamente em instantes.');
  } finally {
    ajudaBtn.disabled = false;
    ajudaBtn.innerHTML = '<span>&#9992;</span> Enviar Mensagem';
  }
});
 
// ---------- Formulário: Denúncia ----------
const formDenuncia = document.getElementById('form-denuncia');
const denunciaStatus = document.getElementById('denuncia-status');
const denunciaBtn = document.getElementById('denuncia-submit-btn');
 
// Guarda de reenvio duplicado: evita mandar a MESMA denúncia (mesmo
// motivo+assunto+mensagem) duas vezes em poucos minutos por clique
// duplo ou reload acidental do formulário antes de recarregar a página.
const CHAVE_ULTIMO_ENVIO = 'vizin_suporte_ultima_denuncia';
const JANELA_DUPLICADO_MS = 5 * 60 * 1000;
 
function assinaturaDenuncia({ motivo, assunto, mensagem }){
  return `${motivo}|${assunto}|${mensagem}`.trim().toLowerCase();
}
 
function jaEnviouRecentemente(assinatura){
  try {
    const bruto = sessionStorage.getItem(CHAVE_ULTIMO_ENVIO);
    if (!bruto) return false;
    const { assinatura: ultimaAssinatura, quando } = JSON.parse(bruto);
    return ultimaAssinatura === assinatura && (Date.now() - quando) < JANELA_DUPLICADO_MS;
  } catch {
    return false;
  }
}
 
function registrarEnvio(assinatura){
  try {
    sessionStorage.setItem(CHAVE_ULTIMO_ENVIO, JSON.stringify({ assinatura, quando: Date.now() }));
  } catch {
    // sessionStorage indisponível (ex: modo privado) — só não bloqueia reenvio, sem quebrar o fluxo
  }
}
 
function montarPayloadDenuncia({ motivo, aluguelId, assunto, mensagem }){
  // aluguelId é opcional — só entra no payload se preenchido
  return {
    motivo,
    contra: contraId,
    produtoId: contexto.produtoId || null,
    aluguelId: aluguelId || null,
    assunto,
    mensagem,
    anexoIds: []
  };
}
 
formDenuncia.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearStatus(denunciaStatus);
 
  const motivoEl = document.getElementById('denuncia-motivo');
  const aluguelIdEl = document.getElementById('denuncia-aluguel-id');
  const assuntoEl = document.getElementById('denuncia-assunto');
  const mensagemEl = document.getElementById('denuncia-mensagem');
 
  const motivo = motivoEl.value;
  const aluguelId = aluguelIdEl.value.trim();
  const assunto = assuntoEl.value.trim();
  const mensagem = mensagemEl.value.trim();
 
  const motivoField = document.getElementById('denuncia-motivo-field');
  const assuntoField = document.getElementById('denuncia-assunto-field');
  const mensagemField = document.getElementById('denuncia-mensagem-field');
 
  let valid = true;
  if (!motivo) { showFieldError(motivoField, true); valid = false; }
  else { showFieldError(motivoField, false); }
 
  if (!assunto) { showFieldError(assuntoField, true); valid = false; }
  else { showFieldError(assuntoField, false); }
 
  if (!mensagem) { showFieldError(mensagemField, true); valid = false; }
  else { showFieldError(mensagemField, false); }
 
  if (!valid) return;
 
  const assinatura = assinaturaDenuncia({ motivo, assunto, mensagem });
  if (jaEnviouRecentemente(assinatura)) {
    showStatus(denunciaStatus, 'success', 'Você já enviou essa denúncia há poucos minutos. Nossa equipe já está analisando — não é preciso enviar de novo.');
    return;
  }
 
  const payload = montarPayloadDenuncia({ motivo, aluguelId, assunto, mensagem });
 
  denunciaBtn.disabled = true;
  denunciaBtn.textContent = 'Enviando...';
 
  try {
    if (anexoSelecionado) {
      const form = new FormData();
      form.append('file', anexoSelecionado);
      const upload = await window.ApiVizin.post('/uploads', form);
      payload.anexoIds = [upload.id];
    }
    const data = await window.ApiVizin.post('/suporte/denuncia', payload);
    const protocolo = data.protocolo;
    registrarEnvio(assinatura);
    showStatus(denunciaStatus, 'success', 'Denúncia enviada com sucesso. Nossa equipe vai analisar o caso. Guarde o protocolo para acompanhar.', protocolo);
    showToast('Denúncia enviada ✔');
    formDenuncia.reset();
    carregarMeusChamados();
    limparAnexo();
    contextoChip.classList.add('hidden');
  } catch (err) {
    showStatus(denunciaStatus, 'error', 'Não foi possível enviar a denúncia agora. Tente novamente em instantes.');
  } finally {
    denunciaBtn.disabled = false;
    denunciaBtn.innerHTML = '<span>&#9992;</span> Enviar Denúncia';
  }
});

// ---------- Meus chamados ----------

// Classifica o texto de status vindo do back num dos 4 "grupos" visuais
// (aberto / andamento / resolvido / rejeitado), só pela presença de
// palavras-chave — assim a UI fica bonita mesmo sem um enum fixo de status.
function classificarStatus(status) {
  const s = (status || '').toLowerCase();
  if (/resolvid|conclu[ií]d|finalizad|aceit/.test(s)) return 'resolvido';
  if (/andamento|an[aá]lise|revis/.test(s)) return 'andamento';
  if (/rejeit|recusad|negad|cancelad/.test(s)) return 'rejeitado';
  return 'aberto';
}

// Formata qualquer data/hora ISO vinda do back (ex: "2026-09-20T14:23:00Z")
// pro formato dd/mm/aaaa usado no resto da plataforma.
function formatarDataChamado(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function criarChamadoItem(chamado) {
  const item = document.createElement('div');
  item.className = 'chamado-item';

  const top = document.createElement('div');
  top.className = 'chamado-top';

  const badges = document.createElement('div');
  badges.className = 'chamado-badges';

  const tipoBadge = document.createElement('span');
  tipoBadge.className = `badge ${chamado.tipo === 'Ajuda' ? 'badge-tipo-ajuda' : 'badge-tipo-denuncia'}`;
  tipoBadge.textContent = chamado.tipo;
  badges.appendChild(tipoBadge);

  const statusTexto = chamado.status || 'Aberto';
  const statusBadge = document.createElement('span');
  statusBadge.className = `badge badge-status-${classificarStatus(statusTexto)}`;
  statusBadge.textContent = statusTexto;
  badges.appendChild(statusBadge);

  top.appendChild(badges);

  const dataFormatada = formatarDataChamado(chamado.criado_em);
  if (dataFormatada) {
    const dataEl = document.createElement('span');
    dataEl.className = 'chamado-data-topo';
    dataEl.textContent = dataFormatada;
    top.appendChild(dataEl);
  }

  item.appendChild(top);

  const desc = document.createElement('p');
  desc.className = 'chamado-desc';
  desc.textContent = chamado.descricao || 'Sem assunto';
  item.appendChild(desc);

  if (chamado.protocolo) {
    const meta = document.createElement('div');
    meta.className = 'chamado-meta';
    const protocoloEl = document.createElement('span');
    protocoloEl.className = 'chamado-protocolo';
    protocoloEl.textContent = `Protocolo: #${chamado.protocolo}`;
    meta.appendChild(protocoloEl);
    item.appendChild(meta);
  }

  return item;
}

async function carregarMeusChamados() {
  const lista = document.getElementById('meus-chamados-lista');
  if (!lista) return;
  try {
    const chamados = [];
    const limit = 50;
    for (let page = 1; ; page++) {
      const resposta = await window.ApiVizin.get(`/suporte/me?page=${page}&limit=${limit}`);
      chamados.push(
        ...resposta.suporte.map(c => ({ ...c, tipo: 'Ajuda', descricao: c.assunto })),
        ...resposta.denuncias.map(c => ({ ...c, tipo: 'Denúncia', descricao: c.assunto || c.motivo }))
      );
      // O sinistro foi removido do front — ignoramos resposta.sinistros e a
      // contagem dele na paginação, considerando só os totais que exibimos.
      const totais = resposta.paginacao.totais || {};
      const maiorTotal = Math.max(totais.suporte || 0, totais.denuncias || 0);
      if (page * limit >= maiorTotal) break;
    }
    chamados.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    lista.replaceChildren();
    if (!chamados.length) {
      const vazio = document.createElement('p');
      vazio.className = 'chamados-vazio';
      vazio.textContent = 'Você ainda não abriu chamados.';
      lista.appendChild(vazio);
      return;
    }
    for (const chamado of chamados) {
      lista.appendChild(criarChamadoItem(chamado));
    }
  } catch (erro) {
    lista.replaceChildren();
    const erroEl = document.createElement('p');
    erroEl.className = 'chamados-erro';
    erroEl.textContent = erro.message || 'Não foi possível carregar seus chamados.';
    lista.appendChild(erroEl);
  }
}
carregarMeusChamados();