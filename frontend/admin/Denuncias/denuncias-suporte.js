/* =========================================================
   INTEGRAÇÃO COM O BACK-END (endpoints ainda não existem)
   =========================================================
   Contrato esperado, no mesmo espírito do /suporte/* já usado no front
   do usuário (ver Suporte/suporte.js):

     GET  /admin/ocorrencias?page=&limit=&busca=&tipo=&status=&prioridade=
          -> { itens: [ {
                id,                         // "DEN-001" / "SUP-001"
                tipo,                       // 'denuncia' | 'suporte'
                denuncianteNome, denuncianteId,
                denunciadoNome, denunciadoId,   // null quando tipo === 'suporte'
                motivo,                     // assunto curto (título da linha)
                descricao,                  // texto completo enviado pelo usuário
                prioridade,                 // 'critica' | 'alta' | 'media' | 'baixa'
                status,                     // 'aberta' | 'andamento' | 'resolvida' | 'fechada'
                protocolo,
                criadoEm,                   // ISO
                aluguelId, produtoId,        // opcionais, quando aplicável
                // De onde a denúncia partiu — é o que une num só lugar as
                // denúncias feitas pelo formulário de Suporte (anúncio,
                // avaliação, aluguel, perfil) E as feitas pelo botão
                // "Denunciar conversa" do Mensagens (ver comentário em
                // Mensagens/app.js: as duas telas usam o mesmo vocabulário
                // de motivo e devem cair na mesma fila de moderação).
                // Front-end não inventa esse dado — ele só existe se o
                // back-end gravar as duas origens no mesmo recurso.
                origem: { tipo: 'anuncio'|'avaliacao'|'aluguel'|'conversa'|'perfil', id, label },
                respostas: [{ autor, mensagem, criadoEm }]
              } ],
              paginacao: { pagina, porPagina, total } }

     PATCH /admin/ocorrencias/:id/status   body: { status }
          -> ocorrência atualizada

     POST  /admin/ocorrencias/:id/resposta body: { mensagem }
          -> { ok: true }  (deve também notificar o usuário — mesmo
             mecanismo da notificação de "resposta por e-mail" do
             Suporte do usuário)

   Enquanto o back não existe, as três funções chamarApi* abaixo rodam
   em cima do array MOCK_OCORRENCIAS (dados de exemplo) simulando
   filtro/paginação/atualização do servidor. É o ÚNICO lugar que
   precisa mudar quando o back estiver pronto: troque o corpo de cada
   uma pela chamada real a window.ApiVizin (get/patch/post) mantendo a
   mesma assinatura e o mesmo formato de retorno — o resto do arquivo
   não precisa mudar.
   ========================================================= */

const MOCK_OCORRENCIAS = [
  {
    id: 'DEN-001', tipo: 'denuncia',
    denuncianteNome: 'Maria Santos', denuncianteId: 'u_101',
    denunciadoNome: 'Carlos Mendes', denunciadoId: 'u_102',
    motivo: 'Item não conforme',
    descricao: 'O item estava em péssimo estado, diferente das fotos do anúncio. Recebi o objeto com riscos visíveis e uma peça faltando, o que não foi informado antes do aluguel.',
    prioridade: 'alta', status: 'aberta', protocolo: '48213',
    criadoEm: '2024-05-20T10:00:00Z', aluguelId: 'a_501',
    origem: { tipo: 'aluguel', id: 'a_501', label: 'Aluguel #a_501' },
    respostas: []
  },
  {
    id: 'DEN-002', tipo: 'denuncia',
    denuncianteNome: 'Pedro Costa', denuncianteId: 'u_103',
    denunciadoNome: 'Ana Paula', denunciadoId: 'u_104',
    motivo: 'Atraso na devolução',
    descricao: 'Item não foi devolvido no prazo acordado. Já se passaram 3 dias e não obtive resposta da outra parte.',
    prioridade: 'media', status: 'andamento', protocolo: '48219',
    criadoEm: '2024-05-22T14:30:00Z', aluguelId: 'a_502',
    origem: { tipo: 'aluguel', id: 'a_502', label: 'Aluguel #a_502' },
    respostas: []
  },
  {
    id: 'DEN-003', tipo: 'denuncia',
    denuncianteNome: 'Ana Paula', denuncianteId: 'u_104',
    denunciadoNome: 'João Silva', denunciadoId: 'u_105',
    motivo: 'Comportamento inadequado',
    descricao: 'Comunicação ofensiva durante a negociação. O usuário utilizou linguagem agressiva no chat da plataforma.',
    prioridade: 'critica', status: 'resolvida', protocolo: '48180',
    criadoEm: '2024-05-18T09:15:00Z', aluguelId: null,
    // Exemplo de denúncia originada pelo botão "Denunciar conversa" do
    // Mensagens (POST /conversations/:id/report), não pelo formulário de
    // Suporte — por isso a origem aponta pra conversa, não pra um aluguel.
    origem: { tipo: 'conversa', id: 'c_77', label: 'Conversa #c_77' },
    respostas: [{ autor: 'Equipe Vizin', mensagem: 'Após análise das conversas, o usuário denunciado recebeu uma advertência.', criadoEm: '2024-05-19T11:00:00Z' }]
  },
  {
    id: 'DEN-004', tipo: 'denuncia',
    denuncianteNome: 'João Silva', denuncianteId: 'u_105',
    denunciadoNome: 'Lucia Silva', denunciadoId: 'u_106',
    motivo: 'Problema com pagamento',
    descricao: 'Pagamento não foi processado corretamente. O valor foi debitado duas vezes no cartão.',
    prioridade: 'baixa', status: 'fechada', protocolo: '48095',
    criadoEm: '2024-05-15T16:45:00Z', aluguelId: 'a_498',
    origem: { tipo: 'aluguel', id: 'a_498', label: 'Aluguel #a_498' },
    respostas: [{ autor: 'Equipe Vizin', mensagem: 'Estorno confirmado junto à operadora do cartão.', criadoEm: '2024-05-16T10:00:00Z' }]
  },
  {
    id: 'DEN-005', tipo: 'denuncia',
    denuncianteNome: 'Beatriz Alves', denuncianteId: 'u_109',
    denunciadoNome: 'Carlos Mendes', denunciadoId: 'u_102',
    motivo: 'Anúncio falso ou enganoso',
    descricao: 'O anúncio prometia uma furadeira profissional, mas o item recebido era um modelo bem mais simples e antigo.',
    prioridade: 'alta', status: 'aberta', protocolo: '48241',
    criadoEm: '2024-05-24T12:00:00Z', aluguelId: null,
    origem: { tipo: 'anuncio', id: 'p_310', label: 'Anúncio: Furadeira Bosch 650W' },
    respostas: []
  },
  {
    id: 'DEN-006', tipo: 'denuncia',
    denuncianteNome: 'Lucia Silva', denuncianteId: 'u_106',
    denunciadoNome: 'Pedro Costa', denunciadoId: 'u_103',
    motivo: 'Avaliação ofensiva ou falsa',
    descricao: 'Deixaram uma avaliação com xingamentos e acusações falsas sobre o estado do meu objeto.',
    prioridade: 'media', status: 'andamento', protocolo: '48246',
    criadoEm: '2024-05-25T09:40:00Z', aluguelId: null,
    origem: { tipo: 'avaliacao', id: 'av_88', label: 'Avaliação de Pedro Costa' },
    respostas: []
  },
  {
    id: 'SUP-001', tipo: 'suporte',
    denuncianteNome: 'Fernanda Lima', denuncianteId: 'u_107',
    denunciadoNome: null, denunciadoId: null,
    motivo: 'Dúvida sobre repasse de pagamento',
    descricao: 'Não entendi quando o valor do aluguel do meu objeto cai na minha conta. Pode me explicar o prazo?',
    prioridade: 'baixa', status: 'aberta', protocolo: '48230',
    criadoEm: '2024-05-23T08:20:00Z', aluguelId: null, origem: null, respostas: []
  },
  {
    id: 'SUP-002', tipo: 'suporte',
    denuncianteNome: 'Rafael Souza', denuncianteId: 'u_108',
    denunciadoNome: null, denunciadoId: null,
    motivo: 'Erro ao anexar foto no anúncio',
    descricao: 'Ao tentar publicar um anúncio novo, a foto não é salva e aparece um erro genérico.',
    prioridade: 'media', status: 'resolvida', protocolo: '48140',
    criadoEm: '2024-05-17T13:10:00Z', aluguelId: null, origem: null,
    respostas: [{ autor: 'Equipe Vizin', mensagem: 'Corrigido — pedimos para tentar novamente e confirmar.', criadoEm: '2024-05-17T17:40:00Z' }]
  }
];

async function chamarApiListarOcorrencias({ pagina, porPagina, busca, tipo, status, prioridade }) {
  // TODO (back-end pronto): trocar por
  //   const q = new URLSearchParams({ page: pagina, limit: porPagina, busca, tipo, status, prioridade });
  //   return window.ApiVizin.get(`/admin/ocorrencias?${q}`);
  const termo = (busca || '').trim().toLowerCase();
  let itens = MOCK_OCORRENCIAS.filter(o => {
    if (tipo && o.tipo !== tipo) return false;
    if (status && o.status !== status) return false;
    if (prioridade && o.prioridade !== prioridade) return false;
    if (termo) {
      const alvo = `${o.id} ${o.denuncianteNome} ${o.denunciadoNome || ''} ${o.motivo}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
  itens.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  const total = itens.length;
  const inicio = (pagina - 1) * porPagina;
  itens = itens.slice(inicio, inicio + porPagina);
  return Promise.resolve({ itens, paginacao: { pagina, porPagina, total } });
}

async function chamarApiAtualizarStatus(id, novoStatus) {
  // TODO (back-end pronto): trocar por
  //   return window.ApiVizin.patch(`/admin/ocorrencias/${encodeURIComponent(id)}/status`, { status: novoStatus });
  const ocorrencia = MOCK_OCORRENCIAS.find(o => o.id === id);
  if (!ocorrencia) throw new Error('Ocorrência não encontrada.');
  ocorrencia.status = novoStatus;
  return Promise.resolve(ocorrencia);
}

async function chamarApiEnviarResposta(id, mensagem) {
  // TODO (back-end pronto): trocar por
  //   return window.ApiVizin.post(`/admin/ocorrencias/${encodeURIComponent(id)}/resposta`, { mensagem });
  const ocorrencia = MOCK_OCORRENCIAS.find(o => o.id === id);
  if (!ocorrencia) throw new Error('Ocorrência não encontrada.');
  ocorrencia.respostas.push({ autor: 'Você', mensagem, criadoEm: new Date().toISOString() });
  return Promise.resolve({ ok: true });
}

/* ========================================================= */

const ROTULO_STATUS = { aberta: 'Aberta', andamento: 'Em Progresso', resolvida: 'Resolvida', fechada: 'Fechada' };
const ROTULO_PRIORIDADE = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const ROTULO_TIPO = { denuncia: 'Denúncia', suporte: 'Suporte' };
// Ícone por origem — de qual tela do usuário a denúncia partiu
// (formulário de Suporte ou botão "Denunciar conversa" do Mensagens).
const ICONE_ORIGEM = { anuncio: 'bi-megaphone', avaliacao: 'bi-star', aluguel: 'bi-box-seam', conversa: 'bi-chat-left-text', perfil: 'bi-person' };

const state = {
  pagina: 1,
  porPagina: 4,
  busca: '',
  filtroTipo: '',
  filtroStatus: '',
  filtroPrioridade: '',
  total: 0,
  ocorrenciaSelecionada: null
};

// ---------- Elementos ----------
const buscaInput = document.getElementById('buscaInput');
const filtrosBtn = document.getElementById('filtrosBtn');
const filtrosDropdown = document.getElementById('filtrosDropdown');
const filtroTipoEl = document.getElementById('filtroTipo');
const filtroStatusEl = document.getElementById('filtroStatus');
const filtroPrioridadeEl = document.getElementById('filtroPrioridade');
const filtrosLimparBtn = document.getElementById('filtrosLimparBtn');

const tbody = document.getElementById('ocorrenciasTbody');
const tabelaCarregando = document.getElementById('tabelaCarregando');
const tabelaVazio = document.getElementById('tabelaVazio');
const tabelaErro = document.getElementById('tabelaErro');

const paginacaoInfo = document.getElementById('paginacaoInfo');
const paginacaoNumeros = document.getElementById('paginacaoNumeros');
const paginaAnteriorBtn = document.getElementById('paginaAnteriorBtn');
const paginaProximaBtn = document.getElementById('paginaProximaBtn');

const pendentesBadge = document.getElementById('pendentesBadge');
const resumoAbertasNum = document.getElementById('resumoAbertasNum');
const resumoResolvidasNum = document.getElementById('resumoResolvidasNum');
const resumoTicketsNum = document.getElementById('resumoTicketsNum');

// ---------- Formatação ----------
function formatarData(dataStr) {
  const d = new Date(dataStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------- Cards de resumo ----------
// Calculados sobre TODA a base (não sobre a página/filtro atual da
// tabela) — por isso usam MOCK_OCORRENCIAS direto. Quando o back tiver
// um endpoint de totais globais, troque este cálculo pela resposta dele.
function atualizarResumo() {
  const todas = MOCK_OCORRENCIAS;
  const abertas = todas.filter(o => o.tipo === 'denuncia' && (o.status === 'aberta' || o.status === 'andamento')).length;
  const resolvidas = todas.filter(o => o.status === 'resolvida').length;
  const tickets = todas.filter(o => o.tipo === 'suporte').length;
  const pendentesTotal = todas.filter(o => o.status === 'aberta' || o.status === 'andamento').length;

  resumoAbertasNum.textContent = abertas;
  resumoResolvidasNum.textContent = resolvidas;
  resumoTicketsNum.textContent = tickets;

  if (pendentesTotal > 0) {
    pendentesBadge.textContent = `${pendentesTotal} caso${pendentesTotal > 1 ? 's' : ''} pendente${pendentesTotal > 1 ? 's' : ''}`;
    pendentesBadge.classList.remove('hidden');
  } else {
    pendentesBadge.classList.add('hidden');
  }
}

// ---------- Tabela ----------
function criarLinha(o) {
  const tr = document.createElement('tr');

  const denunciado = o.denunciadoNome
    ? escapeHtml(o.denunciadoNome)
    : '<span class="col-vazio">—</span>';

  tr.innerHTML = `
    <td class="col-id">#${escapeHtml(o.id)}</td>
    <td>${escapeHtml(o.denuncianteNome)}</td>
    <td>${denunciado}</td>
    <td>
      <div class="col-motivo-titulo">${escapeHtml(o.motivo)}</div>
      <div class="col-motivo-desc">${escapeHtml(o.descricao)}</div>
      ${o.origem ? `<div class="origem-tag"><i class="bi ${ICONE_ORIGEM[o.origem.tipo] || 'bi-dot'}"></i> ${escapeHtml(o.origem.label)}</div>` : ''}
    </td>
    <td><span class="badge badge-prioridade-${o.prioridade}">${ROTULO_PRIORIDADE[o.prioridade] || o.prioridade}</span></td>
    <td class="col-data">${formatarData(o.criadoEm)}</td>
    <td><span class="badge badge-status-${o.status}">${ROTULO_STATUS[o.status] || o.status}</span></td>
    <td>
      <div class="acoes-row">
        <button type="button" class="acao-btn acao-ver" title="Ver detalhes" data-acao="ver" data-id="${escapeHtml(o.id)}"><i class="bi bi-eye"></i></button>
        <button type="button" class="acao-btn acao-responder" title="Responder" data-acao="responder" data-id="${escapeHtml(o.id)}"><i class="bi bi-chat-dots"></i></button>
        <button type="button" class="acao-btn acao-resolver" title="Marcar como resolvida" data-acao="resolver" data-id="${escapeHtml(o.id)}" ${o.status === 'resolvida' ? 'disabled' : ''}><i class="bi bi-check-circle"></i></button>
        <button type="button" class="acao-btn acao-rejeitar" title="Rejeitar" data-acao="rejeitar" data-id="${escapeHtml(o.id)}" ${o.status === 'fechada' ? 'disabled' : ''}><i class="bi bi-slash-circle"></i></button>
        <button type="button" class="acao-btn acao-fechar" title="Fechar caso" data-acao="fechar" data-id="${escapeHtml(o.id)}" ${o.status === 'fechada' ? 'disabled' : ''}><i class="bi bi-x-circle"></i></button>
      </div>
    </td>
  `;
  return tr;
}

function renderPaginacao() {
  const totalPaginas = Math.max(1, Math.ceil(state.total / state.porPagina));
  const inicio = state.total === 0 ? 0 : (state.pagina - 1) * state.porPagina + 1;
  const fim = Math.min(state.pagina * state.porPagina, state.total);

  paginacaoInfo.textContent = `Mostrando ${inicio}-${fim} de ${state.total} ocorrência${state.total === 1 ? '' : 's'}`;

  paginacaoNumeros.replaceChildren();
  for (let p = 1; p <= totalPaginas; p++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(p);
    btn.className = p === state.pagina ? 'active' : '';
    btn.addEventListener('click', () => { state.pagina = p; carregarOcorrencias(); });
    paginacaoNumeros.appendChild(btn);
  }

  paginaAnteriorBtn.disabled = state.pagina <= 1;
  paginaProximaBtn.disabled = state.pagina >= totalPaginas;
}

async function carregarOcorrencias() {
  tabelaCarregando.classList.remove('hidden');
  tabelaVazio.classList.add('hidden');
  tabelaErro.classList.add('hidden');
  tbody.replaceChildren();

  try {
    const resposta = await chamarApiListarOcorrencias({
      pagina: state.pagina,
      porPagina: state.porPagina,
      busca: state.busca,
      tipo: state.filtroTipo,
      status: state.filtroStatus,
      prioridade: state.filtroPrioridade
    });

    state.total = resposta.paginacao.total;
    tabelaCarregando.classList.add('hidden');

    if (!resposta.itens.length) {
      tabelaVazio.classList.remove('hidden');
    } else {
      for (const o of resposta.itens) tbody.appendChild(criarLinha(o));
    }
    renderPaginacao();
  } catch (erro) {
    tabelaCarregando.classList.add('hidden');
    tabelaErro.textContent = erro.message || 'Não foi possível carregar as ocorrências.';
    tabelaErro.classList.remove('hidden');
  }
}

// ---------- Busca ----------
let buscaTimeoutId;
buscaInput.addEventListener('input', () => {
  clearTimeout(buscaTimeoutId);
  buscaTimeoutId = setTimeout(() => {
    state.busca = buscaInput.value;
    state.pagina = 1;
    carregarOcorrencias();
  }, 300);
});

// ---------- Filtros ----------
filtrosBtn.addEventListener('click', () => {
  filtrosDropdown.classList.toggle('hidden');
  filtrosBtn.classList.toggle('active', !filtrosDropdown.classList.contains('hidden'));
});

document.addEventListener('click', (e) => {
  if (!filtrosDropdown.contains(e.target) && e.target !== filtrosBtn && !filtrosBtn.contains(e.target)) {
    filtrosDropdown.classList.add('hidden');
    filtrosBtn.classList.remove('active');
  }
});

function aplicarFiltros() {
  state.filtroTipo = filtroTipoEl.value;
  state.filtroStatus = filtroStatusEl.value;
  state.filtroPrioridade = filtroPrioridadeEl.value;
  state.pagina = 1;
  carregarOcorrencias();
}
[filtroTipoEl, filtroStatusEl, filtroPrioridadeEl].forEach(el => el.addEventListener('change', aplicarFiltros));

filtrosLimparBtn.addEventListener('click', () => {
  filtroTipoEl.value = '';
  filtroStatusEl.value = '';
  filtroPrioridadeEl.value = '';
  aplicarFiltros();
});

// ---------- Paginação ----------
paginaAnteriorBtn.addEventListener('click', () => { state.pagina = Math.max(1, state.pagina - 1); carregarOcorrencias(); });
paginaProximaBtn.addEventListener('click', () => { state.pagina += 1; carregarOcorrencias(); });

// ---------- Ações da linha / Modal ----------
const modalOverlay = document.getElementById('modalOverlay');
const modalFecharBtn = document.getElementById('modalFecharBtn');
const modalTipoBadge = document.getElementById('modalTipoBadge');
const modalStatusBadge = document.getElementById('modalStatusBadge');
const modalTitulo = document.getElementById('modalTitulo');
const modalProtocolo = document.getElementById('modalProtocolo');
const modalInfoGrid = document.getElementById('modalInfoGrid');
const modalDescricao = document.getElementById('modalDescricao');
const modalStatusBotoes = document.getElementById('modalStatusBotoes');
const modalResposta = document.getElementById('modalResposta');
const modalEnviarBtn = document.getElementById('modalEnviarBtn');
const modalStatusMsg = document.getElementById('modalStatusMsg');

function infoItem(label, valor) {
  return `<div class="modal-info-item"><span class="info-label">${escapeHtml(label)}</span><span class="info-valor">${escapeHtml(valor)}</span></div>`;
}

function abrirModal(ocorrencia, { focoResposta = false } = {}) {
  state.ocorrenciaSelecionada = ocorrencia;

  modalTipoBadge.textContent = ROTULO_TIPO[ocorrencia.tipo] || ocorrencia.tipo;
  modalTipoBadge.className = `badge badge-tipo-${ocorrencia.tipo}`;

  modalStatusBadge.textContent = ROTULO_STATUS[ocorrencia.status] || ocorrencia.status;
  modalStatusBadge.className = `badge badge-status-${ocorrencia.status}`;

  modalTitulo.textContent = `#${ocorrencia.id} — ${ocorrencia.motivo}`;
  modalProtocolo.textContent = `Protocolo: #${ocorrencia.protocolo}`;

  const infos = [infoItem('Denunciante', ocorrencia.denuncianteNome)];
  if (ocorrencia.denunciadoNome) infos.push(infoItem('Denunciado', ocorrencia.denunciadoNome));
  infos.push(infoItem('Prioridade', ROTULO_PRIORIDADE[ocorrencia.prioridade] || ocorrencia.prioridade));
  infos.push(infoItem('Data', formatarData(ocorrencia.criadoEm)));
  if (ocorrencia.origem) infos.push(infoItem('Origem', ocorrencia.origem.label));
  modalInfoGrid.innerHTML = infos.join('');

  let descricaoHtml = escapeHtml(ocorrencia.descricao);
  if (ocorrencia.respostas.length) {
    descricaoHtml += '<br><br><strong>Respostas anteriores:</strong>';
    for (const r of ocorrencia.respostas) {
      descricaoHtml += `<br>— ${escapeHtml(r.mensagem)} <span style="color:var(--text-muted); font-size:12px;">(${escapeHtml(r.autor)}, ${formatarData(r.criadoEm)})</span>`;
    }
  }
  modalDescricao.innerHTML = descricaoHtml;

  modalStatusBotoes.replaceChildren();
  Object.entries(ROTULO_STATUS).forEach(([valor, rotulo]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = rotulo;
    btn.className = `status-${valor}`;
    btn.disabled = ocorrencia.status === valor;
    btn.addEventListener('click', () => mudarStatus(ocorrencia.id, valor));
    modalStatusBotoes.appendChild(btn);
  });

  modalResposta.value = '';
  modalStatusMsg.className = 'modal-status-msg';
  modalStatusMsg.textContent = '';

  modalOverlay.classList.remove('hidden');
  if (focoResposta) modalResposta.focus();
}

function fecharModal() {
  modalOverlay.classList.add('hidden');
  state.ocorrenciaSelecionada = null;
}
modalFecharBtn.addEventListener('click', fecharModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) fecharModal(); });

async function mudarStatus(id, novoStatus) {
  try {
    const atualizada = await chamarApiAtualizarStatus(id, novoStatus);
    atualizarResumo();
    carregarOcorrencias();
    if (state.ocorrenciaSelecionada && state.ocorrenciaSelecionada.id === id) {
      abrirModal(atualizada);
    }
  } catch (erro) {
    modalStatusMsg.textContent = erro.message || 'Não foi possível atualizar o status.';
    modalStatusMsg.className = 'modal-status-msg error';
  }
}

modalEnviarBtn.addEventListener('click', async () => {
  const mensagem = modalResposta.value.trim();
  if (!mensagem || !state.ocorrenciaSelecionada) return;

  modalEnviarBtn.disabled = true;
  modalEnviarBtn.textContent = 'Enviando...';

  try {
    await chamarApiEnviarResposta(state.ocorrenciaSelecionada.id, mensagem);
    modalStatusMsg.textContent = 'Resposta enviada ao usuário.';
    modalStatusMsg.className = 'modal-status-msg success';
    abrirModal(state.ocorrenciaSelecionada);
  } catch (erro) {
    modalStatusMsg.textContent = erro.message || 'Não foi possível enviar a resposta.';
    modalStatusMsg.className = 'modal-status-msg error';
  } finally {
    modalEnviarBtn.disabled = false;
    modalEnviarBtn.innerHTML = '<i class="bi bi-send"></i> Enviar resposta';
  }
});

// Delegação de clique nas ações da tabela (ver / responder / resolver / rejeitar / fechar)
tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('.acao-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const ocorrencia = MOCK_OCORRENCIAS.find(o => o.id === id);
  if (!ocorrencia) return;

  switch (btn.dataset.acao) {
    case 'ver': abrirModal(ocorrencia); break;
    case 'responder': abrirModal(ocorrencia, { focoResposta: true }); break;
    case 'resolver': mudarStatus(id, 'resolvida'); break;
    case 'rejeitar': mudarStatus(id, 'fechada'); break;
    case 'fechar': mudarStatus(id, 'fechada'); break;
  }
});

// ---------- Início ----------
atualizarResumo();
carregarOcorrencias();