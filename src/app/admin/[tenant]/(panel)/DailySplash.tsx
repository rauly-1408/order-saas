import NorappSplash from "../NorappSplash";

// La primera vez de cada día que se abre el panel en un dispositivo, NorApp
// aparece 0,8 s sin sonido. El script corre antes de pintar (va al principio
// del panel) para que no se vea el panel y luego la pantalla. Se lo salta quien
// tenga activado «reducir movimiento». Ver docs/MARCA-NORAPP.md
const SCRIPT = `(function(){try{var k="norapp-splash-day",d=new Date().toLocaleDateString("sv");if(localStorage.getItem(k)===d||matchMedia("(prefers-reduced-motion: reduce)").matches)return;localStorage.setItem(k,d);var h=document.getElementById("nsplash-day");if(!h)return;h.setAttribute("data-on","");setTimeout(function(){h.removeAttribute("data-on")},900)}catch(e){}})();`;

export default function DailySplash() {
  return (
    <>
      <NorappSplash mode="short" id="nsplash-day" />
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
