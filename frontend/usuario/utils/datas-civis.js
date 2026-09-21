// Dia civil usado nas regras de locação, independente do fuso do navegador.
window.DatasCivisVizin = {
    hojeSaoPaulo() {
        const partes = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const valores = Object.fromEntries(partes.map(p => [p.type, p.value]));
        return `${valores.year}-${valores.month}-${valores.day}`;
    }
};
