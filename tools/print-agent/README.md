# Agente de impresión (instalar en el local)

Programa pequeño que corre en un ordenador del local (el PC de Windows que ya tiene la impresora vale) y hace de puente: pregunta a la app cada 2 segundos si hay comandas o tickets pendientes y los manda a la impresora por la red. Sin él, la app no puede llegar a la impresora, porque está en la red del local y la app en internet.

## Qué hace falta

- Un ordenador en la **misma wifi o red** que la impresora, encendido mientras el local esté abierto. Un PC con Windows, un Mac o una Raspberry.
- La impresora conectada por **red (Ethernet o Wi-Fi)** con IP fija (en Estafetén: 192.168.1.31). Las impresoras solo USB no sirven con el agente.
- El **token** de Configuración → Impresoras.

## Instalación en Windows (una vez, 5 minutos)

1. Instala Node.js: entra en https://nodejs.org, descarga la versión **LTS** y ejecútala con «Siguiente» hasta el final.
2. Crea una carpeta, por ejemplo `C:\impresion`, y copia dentro el archivo `agent.js` (está en este mismo directorio del proyecto; también se puede descargar desde el panel).
3. Abre el **Símbolo del sistema** (tecla Windows, escribe `cmd`) y ejecuta, cambiando el token por el tuyo:

   ```
   cd C:\impresion
   node agent.js --url https://order-saas-delta.vercel.app --token TU_TOKEN
   ```

   Tiene que decir «Agente de impresión en marcha». En el panel, Configuración → Impresoras pasará a «Agente conectado» en menos de un minuto. Pulsa «Imprimir prueba».

4. Para que arranque solo al encender el PC: crea un archivo `C:\impresion\agente.bat` con estas líneas (con tu token). Así el token va en una variable y no se ve en la lista de procesos:

   ```
   set ORDER_SAAS_URL=https://order-saas-delta.vercel.app
   set ORDER_SAAS_PRINT_TOKEN=TU_TOKEN
   node C:\impresion\agent.js
   ```

   Con **varios locales**, cada local tiene su agente: añade `set ORDER_SAAS_STORE=ID_DEL_LOCAL` (el identificador sale en Configuración → Sucursales) y en Configuración → Impresoras asigna cada impresora a su local.

   y pon un acceso directo a ese `.bat` en la carpeta de inicio: tecla Windows + R, escribe `shell:startup`, Intro, y arrastra ahí el acceso directo. Si quieres que no se vea la ventana negra, usa en su lugar el Programador de tareas (Crear tarea básica → Al iniciar sesión → Iniciar un programa → `node` con argumentos `C:\impresion\agent.js --url … --token …`).

## En Mac o Linux

```
node agent.js --url https://order-saas-delta.vercel.app --token TU_TOKEN
```

Para dejarlo fijo en un Mac: Ajustes → General → Ítems de inicio, o un `launchd` plist. En Raspberry: un servicio `systemd`.

## Seguridad

- El agente solo se conecta a impresoras de la red del local (direcciones 192.168.x.x, 10.x.x.x o 172.16–31.x.x, puertos 9100–9109) y solo habla con la app por `https://`.
- El token es como una contraseña: no lo compartas ni lo mandes en fotos. Si se ve, pulsa «Nuevo token» en Configuración → Impresoras y cámbialo en el `.bat`.
- La impresora abre el cajón solo al cobrar en efectivo, nunca al reimprimir un ticket.

## Si algo falla

- **«Token no válido»**: cópialo de nuevo desde Configuración → Impresoras (si pulsaste «Nuevo token», el anterior deja de valer).
- **«No se llega a la impresora»**: el ordenador no está en la misma red, o la IP ha cambiado. Imprime la página de autotest de la impresora (mantén pulsado FEED al encenderla) para ver su IP, o fíjala en el router.
- **Imprime símbolos raros en los acentos**: en Configuración → Impresoras cambia la codificación de esa impresora a «Sin acentos».
- **Nada se imprime pero el agente dice «Impreso»**: comprueba el ancho (80 mm = 48 caracteres) y que la impresora no esté en pausa (luz de error).

El agente reintenta cada trabajo hasta 5 veces; después lo marca como fallido y se ve en Configuración → Impresoras.
