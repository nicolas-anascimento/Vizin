// ================= FORMATAÇÃO DE PREÇO (PADRÃO BR) =================
// Centraliza a formatação de valores monetários pra manter consistência
// em todas as páginas (2 casas decimais, separador de milhar, etc).
function formatarPreco(valor) {
    return `R$ ${Number(valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

window.formatarPreco = formatarPreco;
