
document.getElementById("formResetar")
.addEventListener("submit", async (e)=>{

    e.preventDefault();

    const senha =
    document.getElementById("novaSenha").value;

    const confirmar =
    document.getElementById("confirmarSenha").value;

    const mensagem =
    document.getElementById("mensagem");

    if(senha !== confirmar){

        mensagem.innerHTML =
        "❌ As senhas não coincidem.";

        return;
    }

    try{

        /*
        BACK-END FUTURO

        const token =
        new URLSearchParams(window.location.search)
        .get("token");

        await fetch("/api/resetar-senha",{
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                token,
                senha
            })
        });
        */

        mensagem.innerHTML =
        "✅ Senha alterada com sucesso!";

        setTimeout(()=>{

            window.location.href="/login";

        },2000);

    }catch{

        mensagem.innerHTML =
        "❌ Erro ao alterar senha.";

    }

});