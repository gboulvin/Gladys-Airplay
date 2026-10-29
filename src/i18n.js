// -----------------------------------------------------------------------------
// Languages and the integration's own messages.
//
// Every text the integration produces at runtime (action messages, widget
// toasts and labels, connection status) is a multi-language object: Gladys
// picks the language of the user who reads it, falling back to English.
// -----------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  initializationFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, prüfen Sie die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  speakerNotFound: {
    en: 'Unknown AirPlay speaker: run a new scan from the Discovery tab.',
    fr: "Enceinte AirPlay inconnue : relancez une recherche depuis l'onglet Découverte.",
    de: 'Unbekannter AirPlay-Lautsprecher: Starten Sie eine neue Suche im Tab Erkennung.',
    es: 'Altavoz AirPlay desconocido: inicie una nueva búsqueda en la pestaña Descubrimiento.',
  },
  testPlaying: {
    en: 'The test chime is playing on {name}.',
    fr: 'Le carillon de test est joué sur {name}.',
    de: 'Der Testgong wird auf {name} abgespielt.',
    es: 'El timbre de prueba se está reproduciendo en {name}.',
  },
  playing: {
    en: 'Playing on {name}.',
    fr: 'Lecture en cours sur {name}.',
    de: 'Wiedergabe auf {name}.',
    es: 'Reproduciendo en {name}.',
  },
  playFailed: {
    en: '{name} could not play: {reason}',
    fr: "{name} n'a pas pu jouer : {reason}",
    de: '{name} konnte nicht abspielen: {reason}',
    es: '{name} no pudo reproducir: {reason}',
  },
  stopped: {
    en: 'Playback stopped on {name}.',
    fr: 'Lecture arrêtée sur {name}.',
    de: 'Wiedergabe auf {name} gestoppt.',
    es: 'Reproducción detenida en {name}.',
  },
  nothingPlaying: {
    en: 'Nothing is playing on {name}.',
    fr: "Rien n'est en cours de lecture sur {name}.",
    de: 'Auf {name} wird nichts abgespielt.',
    es: 'No se está reproduciendo nada en {name}.',
  },
  availabilityChecked: {
    en: '{online} of {total} speakers reachable.',
    fr: '{online} enceinte(s) joignable(s) sur {total}.',
    de: '{online} von {total} Lautsprechern erreichbar.',
    es: '{online} de {total} altavoces accesibles.',
  },
};

// Reasons of a failed playback (PlaybackError codes, see src/player.js).
export const ERROR_REASONS = {
  INVALID_URL: {
    en: 'only http:// and https:// audio URLs can be played.',
    fr: 'seules les URL audio http:// et https:// peuvent être jouées.',
    de: 'nur http://- und https://-Audio-URLs können abgespielt werden.',
    es: 'solo se pueden reproducir URL de audio http:// y https://.',
  },
  UNREACHABLE: {
    en: 'the speaker does not answer (off, asleep or on another network).',
    fr: "l'enceinte ne répond pas (éteinte, en veille ou sur un autre réseau).",
    de: 'der Lautsprecher antwortet nicht (aus, im Ruhezustand oder in einem anderen Netz).',
    es: 'el altavoz no responde (apagado, en reposo o en otra red).',
  },
  PASSWORD_REQUIRED: {
    en: 'the speaker asks for a password: fill in the AirPlay password of the configuration.',
    fr: "l'enceinte demande un mot de passe : renseignez le mot de passe AirPlay de la configuration.",
    de: 'der Lautsprecher verlangt ein Passwort: Tragen Sie das AirPlay-Passwort in der Konfiguration ein.',
    es: 'el altavoz pide una contraseña: indique la contraseña AirPlay en la configuración.',
  },
  PAIRING_FAILED: {
    en: 'the speaker refused the pairing (check its access settings in the Home app).',
    fr: "l'enceinte a refusé l'appairage (vérifiez ses réglages d'accès dans l'app Maison).",
    de: 'der Lautsprecher hat die Kopplung abgelehnt (Zugriffseinstellungen in der Home-App prüfen).',
    es: 'el altavoz rechazó el emparejamiento (revise sus ajustes de acceso en la app Casa).',
  },
  FFMPEG_MISSING: {
    en: 'the audio decoder (ffmpeg) is missing from the image.',
    fr: "le décodeur audio (ffmpeg) est absent de l'image.",
    de: 'der Audiodecoder (ffmpeg) fehlt im Image.',
    es: 'falta el decodificador de audio (ffmpeg) en la imagen.',
  },
  DECODER_ERROR: {
    en: 'the audio file could not be read (URL unreachable or format not supported).',
    fr: "le fichier audio n'a pas pu être lu (URL injoignable ou format non pris en charge).",
    de: 'die Audiodatei konnte nicht gelesen werden (URL nicht erreichbar oder Format nicht unterstützt).',
    es: 'no se pudo leer el archivo de audio (URL inaccesible o formato no compatible).',
  },
  CONNECTION_FAILED: {
    en: 'the AirPlay session was refused or interrupted.',
    fr: 'la session AirPlay a été refusée ou interrompue.',
    de: 'die AirPlay-Sitzung wurde abgelehnt oder unterbrochen.',
    es: 'la sesión AirPlay fue rechazada o interrumpida.',
  },
  STOPPED: {
    en: 'the playback was stopped.',
    fr: 'la lecture a été arrêtée.',
    de: 'die Wiedergabe wurde gestoppt.',
    es: 'la reproducción se detuvo.',
  },
};

// Labels of the dashboard widget, as multi-language objects (the core picks
// the reader's language).
export const LABELS = {
  volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  reachability: { en: 'Network', fr: 'Réseau', de: 'Netzwerk', es: 'Red' },
  online: { en: 'Reachable', fr: 'Joignable', de: 'Erreichbar', es: 'Accesible' },
  offline: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  unknown: {
    en: 'Not checked yet',
    fr: 'Pas encore vérifié',
    de: 'Noch nicht geprüft',
    es: 'Aún sin comprobar',
  },
  playback: { en: 'Playback', fr: 'Lecture', de: 'Wiedergabe', es: 'Reproducción' },
  playingNow: { en: 'Playing', fr: 'En cours', de: 'Läuft', es: 'Reproduciendo' },
  idle: { en: 'Idle', fr: 'Inactive', de: 'Inaktiv', es: 'Inactivo' },
  address: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
  protocol: { en: 'Protocol', fr: 'Protocole', de: 'Protokoll', es: 'Protocolo' },
  speakers: { en: 'Speakers', fr: 'Enceintes', de: 'Lautsprecher', es: 'Altavoces' },
  reachable: { en: 'Reachable', fr: 'Joignables', de: 'Erreichbar', es: 'Accesibles' },
  noSpeaker: {
    en: 'No AirPlay speaker yet: add one from the Discovery tab of the integration.',
    fr: "Aucune enceinte AirPlay pour l'instant : ajoutez-en une depuis l'onglet Découverte de l'intégration.",
    de: 'Noch kein AirPlay-Lautsprecher: Fügen Sie einen im Tab Erkennung der Integration hinzu.',
    es: 'Aún no hay altavoces AirPlay: añada uno desde la pestaña Descubrimiento de la integración.',
  },
  chime: { en: 'Chime', fr: 'Carillon', de: 'Gong', es: 'Timbre' },
  stop: { en: 'Stop', fr: 'Arrêter', de: 'Stopp', es: 'Detener' },
  playUrl: { en: 'Play a URL', fr: 'Jouer une URL', de: 'URL abspielen', es: 'Reproducir URL' },
  checkNow: { en: 'Check now', fr: 'Vérifier', de: 'Jetzt prüfen', es: 'Comprobar' },
  audioUrl: { en: 'Audio URL', fr: 'URL audio', de: 'Audio-URL', es: 'URL de audio' },
};

/**
 * @description Fill the `{placeholders}` of a multi-language text.
 * @param {Record<string, string>} texts - Multi-language object.
 * @param {Record<string, string|number|object>} [vars] - Values; a
 * multi-language value is substituted language by language.
 * @returns {Record<string, string>} A new multi-language object.
 */
export function format(texts, vars = {}) {
  return Object.fromEntries(
    Object.entries(texts).map(([language, text]) => [
      language,
      text.replace(/\{(\w+)\}/g, (match, key) => {
        const value = vars[key];
        if (value === undefined || value === null) {
          return match;
        }
        return typeof value === 'object' ? (value[language] ?? value.en) : String(value);
      }),
    ]),
  );
}

/**
 * @description Build one of the integration's messages.
 * @param {keyof typeof MESSAGES} key - Message key.
 * @param {Record<string, string|number|object>} [vars] - Placeholder values.
 * @returns {Record<string, string>} Multi-language message.
 */
export function message(key, vars) {
  return format(MESSAGES[key], vars);
}

/**
 * @description The user-facing reason of a playback error code.
 * @param {string} code - PlaybackError code.
 * @returns {Record<string, string>} Multi-language reason.
 */
export function errorReason(code) {
  return ERROR_REASONS[code] ?? ERROR_REASONS.CONNECTION_FAILED;
}
