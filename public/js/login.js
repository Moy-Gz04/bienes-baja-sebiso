async function login(){

    const usuario =
    document.getElementById("usuario").value;

    const password =
    document.getElementById("password").value;

    const error =
    document.getElementById("error");

    error.innerText = "";

    try{

        const response = await fetch(
            '/api/auth/login',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    usuario,
                    password
                })
            }
        );

        const data = await response.json();

        if(response.ok){

            // GUARDAR TOKEN

            localStorage.setItem(
                'token',
                data.token
            );

            localStorage.setItem(
                'area',
                data.area
            );
            localStorage.setItem('rol', data.rol || 'completo');

            // REDIRECCIÓN

            window.location.href =
            (data.rol === 'mudanza' ? "mudanza.html" : data.rol === 'resguardos' ? "resguardos.html" : "bienes.html");

        }

        else{

            error.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>${data.error || "Error login"}</span>
            `;

        }

    }

    catch(err){

        error.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>No se pudo conectar al servidor.</span>
        `;

    }

}

function togglePassword(){

    const passwordInput =
    document.getElementById("password");

    const ojoAbierto =
    document.querySelector(".icono-ojo-abierto");

    const ojoCerrado =
    document.querySelector(".icono-ojo-cerrado");

    if(passwordInput.type === "password"){

        passwordInput.type = "text";

        if(ojoAbierto) ojoAbierto.style.display = "none";
        if(ojoCerrado) ojoCerrado.style.display = "block";

    }else{

        passwordInput.type = "password";

        if(ojoAbierto) ojoAbierto.style.display = "block";
        if(ojoCerrado) ojoCerrado.style.display = "none";

    }

}

/* =========================
   LOGIN CON ENTER
   Permite iniciar sesión presionando Enter
   desde el campo de usuario o de contraseña.
========================= */

document.addEventListener("DOMContentLoaded", () => {

    const campoUsuario =
    document.getElementById("usuario");

    const campoPassword =
    document.getElementById("password");

    [campoUsuario, campoPassword].forEach((campo) => {

        if(!campo) return;

        campo.addEventListener("keydown", (evento) => {

            if(evento.key === "Enter"){

                evento.preventDefault();

                login();

            }

        });

    });

});