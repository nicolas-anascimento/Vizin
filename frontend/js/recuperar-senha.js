document.getElementById("formRecuperar")
.addEventListener("submit", async (e)=>{

    e.preventDefault();

    const email =
    document.getElementById("email").value;

    const mensagem =
    document.getElementById("mensagem");

    try{

        // BACK-END FUTURO:
        await fetch("/api/contas/recuperar-senha",{
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({email})
        });
        

        mensagem.innerHTML =
        "✅ Se existir uma conta com este email, você receberá instruções para redefinir sua senha.";

    }catch{

        mensagem.innerHTML =
        "❌ Erro ao solicitar recuperação.";

    }

});