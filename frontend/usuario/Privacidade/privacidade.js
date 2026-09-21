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

baixarDados.addEventListener('click', async () => {
    baixarDados.disabled = true;
    try {
        const dados = await window.ApiVizin.get('/usuarios/me/exportar');
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'meus-dados-vizin.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (erro) {
        alert(erro.message || 'Não foi possível exportar seus dados.');
    } finally { baixarDados.disabled = false; }
});
