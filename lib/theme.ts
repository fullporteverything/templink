export const THEME_KEY = "templink:theme";

/** Runs before paint (inlined in <head>) so a saved theme never flashes. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
