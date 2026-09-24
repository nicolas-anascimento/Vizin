const togglePerfilPublico = document.getElementById('toggle-perfil-publico');
const baixarDados = document.getElementById('btn-baixar-dados');

(async () => {
    try {
        const config = await window.PrivacidadeVizin.obterPrivacidade();
        togglePerfilPublico.checked = config?.perfilPublico !== false;
    } catch (erro) {
        togglePerfilPublico.disabled = true;
        alert(erro.message || 'Não foi possível carregar a privacidade.');
    }
})();

togglePerfilPublico.addEventListener('change', async () => {
    const anterior = !togglePerfilPublico.checked;
    togglePerfilPublico.disabled = true;
    try {
        const salvo = await window.PrivacidadeVizin.salvarPrivacidade({ perfilPublico: togglePerfilPublico.checked });
        togglePerfilPublico.checked = salvo.perfilPublico;
    } catch (erro) {
        togglePerfilPublico.checked = anterior;
        alert(erro.message || 'Não foi possível salvar a preferência.');
    } finally { togglePerfilPublico.disabled = false; }
});

// Monta um PDF legível a partir do pacote completo de
// /usuarios/me/exportar e das preferências de notificação.
function formatarChave(chave) {
    return chave
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, c => c.toUpperCase());
}

function formatarValor(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
    if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '—';
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
}

function adicionarSecaoChaveValor(doc, y, objeto) {
    const linhaAltura = 7;
    const margemEsquerda = 15;
    Object.entries(objeto || {}).forEach(([chave, valor]) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold');
        doc.text(`${formatarChave(chave)}:`, margemEsquerda, y);
        doc.setFont(undefined, 'normal');
        const textoValor = doc.splitTextToSize(formatarValor(valor), 130);
        doc.text(textoValor, margemEsquerda + 55, y);
        y += linhaAltura * Math.max(1, textoValor.length);
    });
    return y;
}

function adicionarTitulo(doc, y, texto) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(texto, 15, y);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    return y + 9;
}

baixarDados.addEventListener('click', async () => {
    baixarDados.disabled = true;
    try {
        const [dados, preferenciasNotificacao] = await Promise.all([
            window.ApiVizin.get('/usuarios/me/exportar'),
            window.NotificacoesVizin?.carregarPreferencias().catch(() => null) ?? Promise.resolve(null)
        ]);
        const objetos = Array.isArray(dados?.perfil?.itens) ? dados.perfil.itens : [];

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Meus dados — Vizin', 15, y);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(120);
        y += 6;
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 15, y);
        doc.setTextColor(0);
        y += 10;

        // Perfil (dados básicos vindos do exportar)
        y = adicionarTitulo(doc, y, 'Perfil');
        y = adicionarSecaoChaveValor(doc, y, dados?.usuario || dados?.perfil || dados);
        y += 4;

        // Avaliações (se vierem dentro do exportar)
        const avaliacoes = dados?.avaliacoes;
        if (Array.isArray(avaliacoes)) {
            y = adicionarTitulo(doc, y, `Avaliações (${avaliacoes.length})`);
            if (avaliacoes.length === 0) {
                doc.text('Nenhuma avaliação ainda.', 15, y);
                y += 9;
            } else {
                avaliacoes.forEach((avaliacao, i) => {
                    y = adicionarSecaoChaveValor(doc, y, { [`Avaliação ${i + 1}`]: '' });
                    y = adicionarSecaoChaveValor(doc, y, avaliacao);
                    y += 3;
                });
            }
        }

        // Objetos anunciados
        y = adicionarTitulo(doc, y, 'Objetos anunciados');
        if (objetos.length === 0) {
            doc.text('Nenhum objeto anunciado.', 15, y);
            y += 9;
        } else {
            objetos.forEach((objeto, i) => {
                y = adicionarSecaoChaveValor(doc, y, { [`Objeto ${i + 1}`]: '' });
                y = adicionarSecaoChaveValor(doc, y, objeto);
                y += 3;
            });
        }
        y += 4;

        // Preferências de notificação
        y = adicionarTitulo(doc, y, 'Preferências de notificação');
        if (!window.NotificacoesVizin) {
            doc.setTextColor(150);
            doc.text('Não foi possível carregar essa seção.', 15, y);
            doc.setTextColor(0);
            y += 9;
        } else {
            y = adicionarSecaoChaveValor(doc, y, preferenciasNotificacao);
        }

        doc.save('meus-dados-vizin.pdf');
    } catch (erro) {
        alert(erro.message || 'Não foi possível exportar seus dados.');
    } finally { baixarDados.disabled = false; }
});
