/* =========================================================
   CONFIGURAÇÃO DE API — AJUSTAR COM O TIME DE BACK-END
   =========================================================
   Troque os endpoints abaixo pelos endpoints reais da API.
   O contrato de dados (payload) enviado em cada POST já está
   pronto e documentado nos comentários de cada função.
 
   IMPORTANTE PARA O BACK-END: o payload de denúncia agora usa o
   MESMO formato (motivo + contra + produtoId + aluguelId) que o
   modal "Denunciar conversa" da página de Mensagens (ver
   api.js -> reportConversation). Se possível, as duas devem cair
   na mesma fila/tabela de moderação — hoje são dois pontos de
   entrada (chat e este formulário) para o mesmo tipo de chamado.
   ========================================================= */
const API_BASE_URL = "/api"; // TODO: back-end define a base real
const ENDPOINTS = {
  ajuda: `${API_BASE_URL}/suporte/ajuda`,        // POST { assunto, mensagem }
  denuncia: `${API_BASE_URL}/suporte/denuncia`,  // POST ver montarPayloadDenuncia()
  upload: `${API_BASE_URL}/uploads`              // POST multipart/form-data, campo "file" (evidência)
};
 
/* =========================================================
   MODO SIMULAÇÃO (SEM BACK-END)
   =========================================================
   Com MOCK_MODE = true, os formulários não chamam a API de
   verdade — eles simulam um envio com sucesso (com um pequeno
   delay) e disparam o toast, só para você visualizar o fluxo.
   Troque para false quando os endpoints reais estiverem prontos.
   ========================================================= */
const MOCK_MODE = true;
 
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
// ---------- Navegação entre abas ----------
const tabAjuda = document.getElementById('tab-ajuda');
const tabDenuncia = document.getElementById('tab-denuncia');
const panelAjuda = document.getElementById('panel-ajuda');
const panelDenuncia = document.getElementById('panel-denuncia');
 
function setActiveTab(tab){
  const isAjuda = tab === 'ajuda';
 
  tabAjuda.classList.toggle('active', isAjuda);
  tabDenuncia.classList.toggle('active', !isAjuda);
 
  panelAjuda.classList.toggle('show', isAjuda);
  panelDenuncia.classList.toggle('show', !isAjuda);
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
 
// Gera um número de protocolo simples pro usuário guardar/referenciar
// depois. No back-end real isso deve vir pronto na resposta do POST.
function gerarProtocolo(){
  return Date.now().toString(36).toUpperCase().slice(-8);
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
 
// ---------- Notificação de resposta por e-mail ----------
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Essa notificação deve ser criada pelo back-end no momento em que a
// resposta por e-mail for realmente enviada (ex: quando o atendente
// responde a dúvida/denúncia pelo painel de suporte, ou via webhook do
// serviço de e-mail) — não no momento do envio do formulário. Aqui, como
// ainda não existe back-end, simulamos a chegada da resposta com um
// setTimeout só para você visualizar o fluxo da notificação.
function avisarRespostaPorEmail(origem){
  if (!window.NotificacoesVizin) return;
 
  const descricao = origem === 'denuncia'
    ? 'Sua denúncia foi respondida. Verifique seu e-mail para ver os detalhes.'
    : 'Sua dúvida foi respondida. Verifique seu e-mail para ver os detalhes.';
 
  setTimeout(() => {
    window.NotificacoesVizin.adicionarNotificacao({
      tipo: 'resposta_email',
      titulo: 'Você recebeu uma resposta por e-mail',
      descricao,
      data: new Date().toLocaleDateString('pt-BR')
    });
  }, 8000); // tempo de simulação — remover/ajustar quando integrar com o back-end real
}
 
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
  motivo: params.get('motivo') || null
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
  if (!usuarioLogado?.email || !window.SolicitacoesVizin) return [];
 
  return window.SolicitacoesVizin.obterTodas()
    .filter(s => s.solicitanteEmail === usuarioLogado.email || s.proprietarioEmail === usuarioLogado.email)
    .map(s => {
      const souSolicitante = s.solicitanteEmail === usuarioLogado.email;
      return {
        id: s.id,
        produtoTitulo: s.produtoTitulo || 'Objeto',
        outraParteNome: souSolicitante ? (s.proprietarioNome || 'Proprietário') : (s.solicitanteNome || 'Locatário'),
        dataRetirada: formatarDataCurta(s.dataRetirada)
      };
    })
    .sort((a, b) => b.id - a.id);
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
}
 
// Botão "x" do chip: some com o contexto visual (a pessoa quer denunciar
// outra coisa, não precisa recarregar a página), mas mantém o que ela já
// tiver preenchido no formulário.
contextoChipLimpar.addEventListener('click', () => {
  contextoChip.classList.add('hidden');
});
 
popularSelectAlugueis();
aplicarContexto();
 
/* =========================================================
   ANEXO DE EVIDÊNCIA (opcional)
   =========================================================
   Reaproveita as mesmas regras de validação usadas em Mensagens
   (ver api.js -> validateFile): imagem/vídeo/pdf/doc, até 25MB.
   Aqui não existe back-end de upload ainda, então só validamos e
   guardamos o arquivo em memória para mandar junto do POST de
   denúncia quando MOCK_MODE for desligado.
   ========================================================= */
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
    if (MOCK_MODE) {
      // ---- Simulação (sem back-end) ----
      await new Promise(resolve => setTimeout(resolve, 600));
    } else {
      // ---- Integração real com o back-end ----
      const response = await fetch(ENDPOINTS.ajuda, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
 
      if (!response.ok) throw new Error('Falha ao enviar mensagem.');
    }
 
    const protocolo = gerarProtocolo();
    showStatus(ajudaStatus, 'success', 'Mensagem enviada com sucesso! Nossa equipe vai te responder em breve.', protocolo);
    showToast('Mensagem enviada ✔');
    formAjuda.reset();
    avisarRespostaPorEmail('ajuda');
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
    anexoNome: anexoSelecionado ? anexoSelecionado.name : null
    // TODO (back-end real): se houver anexo, subir primeiro via
    // ENDPOINTS.upload (multipart/form-data) e mandar o id retornado
    // aqui no lugar de anexoNome — mesmo padrão do upload de anexos
    // do chat (ver Mensagens/api.js -> uploadFile).
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
    if (MOCK_MODE) {
      // ---- Simulação (sem back-end) ----
      await new Promise(resolve => setTimeout(resolve, 600));
    } else {
      const response = await fetch(ENDPOINTS.denuncia, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
 
      if (!response.ok) throw new Error('Falha ao enviar denúncia.');
    }
 
    const protocolo = gerarProtocolo();
    registrarEnvio(assinatura);
    showStatus(denunciaStatus, 'success', 'Denúncia enviada com sucesso. Nossa equipe vai analisar o caso. Guarde o protocolo para acompanhar.', protocolo);
    showToast('Denúncia enviada ✔');
    formDenuncia.reset();
    limparAnexo();
    contextoChip.classList.add('hidden');
    avisarRespostaPorEmail('denuncia');
  } catch (err) {
    showStatus(denunciaStatus, 'error', 'Não foi possível enviar a denúncia agora. Tente novamente em instantes.');
  } finally {
    denunciaBtn.disabled = false;
    denunciaBtn.innerHTML = '<span>&#9992;</span> Enviar Denúncia';
  }
});
 