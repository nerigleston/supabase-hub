export const THEME_KEY = "theme";

/** Roda no <head> antes da pintura: lê a preferência e aplica a classe .dark. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)}})()`;
