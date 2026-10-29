# AirPlay

Reproduzca notificaciones de voz, timbres y archivos de audio en sus
altavoces AirPlay desde Gladys: HomePod y HomePod mini, Apple TV, AirPort
Express, y los altavoces y receptores de otras marcas compatibles con AirPlay
o AirPlay 2 (Sonos, Bose, Denon/Marantz, Yamaha, Bang & Olufsen,
Libratone…).

Esta integración sustituye al servicio AirPlay integrado en Gladys y añade un
volumen por altavoz, timbres integrados, acciones y disparadores de escena y
un widget para el panel.

## Dónde funciona

- **Países:** en todas partes. La integración solo se comunica con los
  altavoces en su red local; no depende de ningún país, cuenta de fabricante
  ni servicio en línea.
- **Red:** los altavoces deben estar en la **misma red local** (misma
  subred) que el servidor Gladys. Un altavoz en una Wi-Fi de invitados, una
  VLAN separada o detrás de una VPN no se encuentra.
- **Internet:** no hace falta para reproducir un timbre, un archivo o un
  flujo de su red local. Las notificaciones de voz usan la voz sintetizada
  elegida en Gladys: **Gladys Plus** por defecto (requiere internet), o una
  integración local de síntesis de voz.
- **Idiomas:** inglés, francés, alemán y español.

## Requisitos

- Gladys Assistant **5.3.0 o posterior**.
- En la app **Casa** de su iPhone (Ajustes de la casa > **Altavoces y TV**),
  **Permitir acceso a altavoces y TV** debe estar en **Todos** o
  **Cualquiera en la misma red**. «Solo las personas que comparten esta
  casa» bloquea a Gladys.
- Si definió una contraseña AirPlay, indíquela en la configuración.

## Instalación

1. Instale **AirPlay** desde el catálogo de integraciones de Gladys.
2. Abra la pestaña **Descubrimiento**: sus altavoces aparecen en unos
   segundos. Pulse **Crear** en cada altavoz que quiera añadir.
3. Use el botón **Probar un altavoz** de la pestaña **Configuración**: el
   altavoz elegido reproduce un timbre de dos tonos.

### Desde el servicio AirPlay integrado

Los altavoces del servicio integrado y los de esta integración son
dispositivos distintos. Una vez creados aquí sus altavoces:

1. Edite las escenas que usan **Reproducir una notificación** y elija los
   nuevos altavoces.
2. Elimine los altavoces antiguos de la integración AirPlay integrada.

## Configuración

| Ajuste                                 | Por defecto | Efecto                                                                                      |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| **Volumen por defecto (%)**            | 70          | Volumen de un altavoz cuyo volumen nunca se ajustó en Gladys.                               |
| **Duración máxima (s)**                | 300         | Toda reproducción se detiene tras este tiempo (10 a 1800 s).                                |
| **Comprobación de disponibilidad (s)** | 300         | Frecuencia de comprobación (60 a 3600 s). Alimenta los disparadores desconectado/conectado. |
| **Protocolo AirPlay**                  | Automático  | Automático lee lo que anuncia cada altavoz. Fuerce AirPlay 1 para un receptor antiguo mudo. |
| **Nombre del emisor**                  | Gladys      | Nombre que muestran los altavoces que indican quién reproduce.                              |
| **Contraseña AirPlay**                 | _(vacío)_   | Solo para altavoces protegidos con contraseña.                                              |

## Sus altavoces en Gladys

Cada altavoz es un dispositivo con cuatro funciones:

- **Notificación** — la usa la acción de escena **Reproducir una
  notificación** de Gladys: el texto se convierte en voz y se reproduce en el
  altavoz.
- **Volumen** — el volumen de reproducción de Gladys (0 a 100 %). AirPlay no
  puede leer el volumen de un altavoz en reposo: es un ajuste propio de
  Gladys, guardado por altavoz; cambiarlo durante una reproducción lo aplica
  al instante.
- **Estado de reproducción** — reproduciendo o inactivo.
- **Reproduciendo ahora** — lo que Gladys está reproduciendo.

La tarjeta del dispositivo muestra una insignia **local** cuando el altavoz
responde, e **inaccesible** cuando no.

## Escenas

### Acciones

- **Reproducir una notificación** (integrada en Gladys) — dice un texto en un
  altavoz.
- **Reproducir una URL de audio en AirPlay** — reproduce un archivo de sonido
  o un flujo (MP3, AAC, WAV, OGG, FLAC, radio por internet…) desde una
  dirección `http://` o `https://`, con un volumen opcional. Con **Esperar
  hasta el final**, la escena espera al final del audio (100 s como máximo).
  Salidas: **Reproducción iniciada** y **Duración reproducida**.
- **Reproducir un timbre en AirPlay** — un sonido integrado: **Timbre**,
  **Notificación** o **Alerta**. No necesita internet ni síntesis de voz:
  ideal para un timbre de puerta o una alarma.
- **Detener la reproducción AirPlay** — detiene lo que Gladys reproduce en un
  altavoz.

Un altavoz que no responde no detiene la escena: **Reproducción iniciada**
vale entonces falso; úsela en una condición para enviar un mensaje en su
lugar.

### Disparadores

- **Altavoz AirPlay desconectado** — un altavoz dejó de responder
  (desenchufado, Wi-Fi perdido…).
- **Altavoz AirPlay conectado de nuevo** — un altavoz vuelve a responder.

Deje el altavoz vacío para reaccionar a cualquiera. El nombre del altavoz
está disponible como `{{triggerEvent.data.name}}`. La detección sigue el
intervalo de **Comprobación de disponibilidad**.

## Panel

Añada el widget **Altavoces AirPlay**:

- sin altavoz elegido, lista sus altavoces con su estado (accesible,
  inaccesible, reproduciendo) y un botón **Comprobar**;
- con un altavoz elegido, muestra su volumen, su estado, su dirección y su
  protocolo, y los botones **Timbre**, **Reproducir URL** y **Detener**.

## Limitaciones

- Solo audio: sin vídeo ni duplicación de pantalla.
- Un altavoz por reproducción: sin multiroom sincronizado.
- Gladys no transmite a las integraciones externas el volumen elegido en
  **Reproducir una notificación**: la notificación suena al **Volumen** del
  altavoz. Para hablar más alto o más bajo en una escena, ajuste antes el
  volumen con una acción **Controlar un dispositivo**.
- Gladys emite en su propia sesión AirPlay: una reproducción interrumpe lo
  que sonaba en el altavoz (Apple Music, Spotify…), que no se reanuda
  después.
- La integración se ejecuta en un contenedor Docker. Algunos receptores
  AirPlay 2 necesitan contactar de vuelta con el emisor para sincronizar su
  reloj: si un altavoz se encuentra y se prueba pero no suena, pruebe
  **AirPlay 1 (RAOP)** en la configuración.
- Un Apple TV o HomePod configurado en «Solo las personas que comparten esta
  casa» rechaza a Gladys (vea los requisitos).

## Solución de problemas

| Síntoma                                     | Qué hacer                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Ningún altavoz en la pestaña Descubrimiento | Compruebe que el altavoz está encendido y en la misma red que Gladys, y vuelva a abrir la pestaña. |
| «El altavoz no responde»                    | Despierte el altavoz (reproduzca algo desde su teléfono), compruebe que su IP no ha cambiado.      |
| «El altavoz pide una contraseña»            | Indique la contraseña AirPlay en la configuración.                                                 |
| «El altavoz rechazó el emparejamiento»      | App Casa > Ajustes de la casa > Altavoces y TV > permita a todos en la misma red.                  |
| La notificación suena sin voz               | Compruebe la voz elegida en Gladys (ajustes de Inteligencia artificial) y su suscripción.          |
| El timbre de prueba no suena                | Cambie el protocolo a **AirPlay 1 (RAOP)** o **AirPlay 2** y vuelva a probar.                      |

La integración registra cada reproducción (altavoz, dirección, protocolo,
causa de un fallo) en su pestaña **Registros**.
