// Preferências da conta autenticada. O backend aplica a privacidade dos perfis públicos.
window.PrivacidadeVizin = {
    obterPrivacidade: () => window.ApiVizin.get('/usuarios/privacidade'),
    salvarPrivacidade: (config) => window.ApiVizin.put('/usuarios/privacidade', config)
};
