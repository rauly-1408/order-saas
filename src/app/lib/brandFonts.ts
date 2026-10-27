// Fuentes de marca servidas desde nuestro propio dominio (next/font las descarga
// al compilar). Así el navegador del cliente nunca llama a Google Fonts y Google
// no recibe su IP (RGPD). Solo se declaran: el navegador descarga únicamente la
// que el restaurante tenga elegida.
import { Archivo_Black, Bebas_Neue, DM_Sans, DM_Serif_Display, Lora, Montserrat, Nunito, Oswald, Pacifico, Playfair_Display, Poppins } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-dm-sans" });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--font-poppins" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-montserrat" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-nunito" });
const bebas = Bebas_Neue({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-bebas" });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-oswald" });
const archivoBlack = Archivo_Black({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-archivo-black" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-playfair" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-dm-serif" });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-lora" });
const pacifico = Pacifico({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-pacifico" });

export const brandFontsClass = [dmSans, poppins, montserrat, nunito, bebas, oswald, archivoBlack, playfair, dmSerif, lora, pacifico]
  .map((f) => f.variable)
  .join(" ");
