# AirPlay

Spielen Sie Sprachansagen, Gongs und Audiodateien aus Gladys auf Ihren
AirPlay-Lautsprechern ab: HomePod und HomePod mini, Apple TV, AirPort
Express sowie Lautsprecher und Receiver anderer Hersteller mit AirPlay oder
AirPlay 2 (Sonos, Bose, Denon/Marantz, Yamaha, Bang & Olufsen, Libratone…).

Diese Integration ersetzt den in Gladys eingebauten AirPlay-Dienst und bietet
zusätzlich eine Lautstärke pro Lautsprecher, eingebaute Gongs,
Szenen-Aktionen und -Auslöser sowie ein Dashboard-Widget.

## Wo sie funktioniert

- **Länder:** überall. Die Integration spricht nur im lokalen Netzwerk mit
  den Lautsprechern; sie hängt von keinem Land, keinem Herstellerkonto und
  keinem Onlinedienst ab.
- **Netzwerk:** Die Lautsprecher müssen sich im **selben lokalen Netzwerk**
  (gleiches Subnetz) wie der Gladys-Server befinden. Lautsprecher in einem
  Gast-WLAN, einem separaten VLAN oder hinter einem VPN werden nicht gefunden.
- **Internet:** nicht nötig, um einen Gong, eine Datei oder einen Stream aus
  Ihrem lokalen Netzwerk abzuspielen. Sprachansagen nutzen die in Gladys
  gewählte Sprachausgabe: standardmäßig **Gladys Plus** (Internet
  erforderlich) oder eine lokale Text-to-Speech-Integration.
- **Sprachen:** Englisch, Französisch, Deutsch und Spanisch.

## Voraussetzungen

- Gladys Assistant **5.3.0 oder neuer**.
- In der **Home**-App Ihres iPhones (Zuhause-Einstellungen > **Lautsprecher
  & TV**) muss **Zugriff auf Lautsprecher & TV erlauben** auf **Alle** oder
  **Alle im selben Netzwerk** stehen. „Nur Personen, die dieses Zuhause
  teilen“ blockiert Gladys.
- Wenn Sie ein AirPlay-Passwort festgelegt haben, tragen Sie es in der
  Konfiguration ein.

## Installation

1. Installieren Sie **AirPlay** aus dem Integrationskatalog von Gladys.
2. Öffnen Sie den Tab **Erkennung**: Ihre Lautsprecher erscheinen nach
   wenigen Sekunden. Klicken Sie bei jedem gewünschten Lautsprecher auf
   **Erstellen**.
3. Nutzen Sie die Schaltfläche **Lautsprecher testen** im Tab
   **Konfiguration**: Der gewählte Lautsprecher spielt einen Zweiklang-Gong.

### Umstieg vom eingebauten AirPlay-Dienst

Die Lautsprecher des eingebauten Dienstes und die dieser Integration sind
verschiedene Geräte. Sobald Ihre Lautsprecher hier erstellt sind:

1. Bearbeiten Sie Ihre Szenen mit **Benachrichtigung abspielen** und wählen
   Sie die neuen Lautsprecher.
2. Löschen Sie die alten Lautsprecher der eingebauten AirPlay-Integration.

## Konfiguration

| Einstellung                    | Standard    | Wirkung                                                                                           |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------- |
| **Standardlautstärke (%)**     | 70          | Lautstärke eines Lautsprechers, dessen Lautstärke nie in Gladys eingestellt wurde.                |
| **Maximale Dauer (s)**         | 300         | Jede Wiedergabe wird nach dieser Zeit gestoppt (10 bis 1.800 s).                                  |
| **Erreichbarkeitsprüfung (s)** | 300         | Wie oft die Lautsprecher geprüft werden (60 bis 3.600 s). Steuert die Auslöser offline/online.    |
| **AirPlay-Protokoll**          | Automatisch | Automatisch liest, was jeder Lautsprecher ankündigt. AirPlay 1 für einen alten stummen Empfänger. |
| **Name des Senders**           | Gladys      | Name, den Lautsprecher anzeigen, die den Absender darstellen.                                     |
| **AirPlay-Passwort**           | _(leer)_    | Nur für passwortgeschützte Lautsprecher.                                                          |

## Ihre Lautsprecher in Gladys

Jeder Lautsprecher ist ein Gerät mit vier Funktionen:

- **Benachrichtigung** — wird von der Gladys-Szenen-Aktion
  **Benachrichtigung abspielen** genutzt: Der Text wird in Sprache umgewandelt
  und auf dem Lautsprecher abgespielt.
- **Lautstärke** — die Wiedergabelautstärke von Gladys (0 bis 100 %). AirPlay
  kann die Lautstärke eines ruhenden Lautsprechers nicht auslesen; es ist
  daher eine eigene Einstellung von Gladys, pro Lautsprecher gespeichert. Eine
  Änderung während der Wiedergabe wird sofort angewendet.
- **Wiedergabestatus** — spielt oder inaktiv.
- **Aktuelle Wiedergabe** — was Gladys gerade abspielt.

Die Gerätekarte zeigt ein Abzeichen **lokal**, wenn der Lautsprecher
antwortet, sonst **nicht erreichbar**.

## Szenen

### Aktionen

- **Benachrichtigung abspielen** (in Gladys eingebaut) — spricht einen Text
  auf einem Lautsprecher.
- **Audio-URL über AirPlay abspielen** — spielt eine Audiodatei oder einen
  Stream (MP3, AAC, WAV, OGG, FLAC, Internetradio…) von einer `http://`- oder
  `https://`-Adresse ab, mit optionaler Lautstärke. Mit **Bis zum Ende
  warten** wartet die Szene auf das Ende des Audios (höchstens 100 s).
  Ausgaben: **Wiedergabe gestartet** und **Gespielte Dauer**.
- **Gong über AirPlay abspielen** — ein eingebauter Ton: **Türklingel**,
  **Benachrichtigung** oder **Alarm**. Er braucht weder Internet noch
  Sprachausgabe: ideal für eine Türklingel oder einen Alarm.
- **AirPlay-Wiedergabe stoppen** — stoppt, was Gladys auf einem Lautsprecher
  abspielt.

Ein Lautsprecher, der nicht antwortet, hält die Szene nicht an:
**Wiedergabe gestartet** ist dann falsch — nutzen Sie es in einer Bedingung,
um stattdessen eine Nachricht zu senden.

### Auslöser

- **AirPlay-Lautsprecher offline** — ein Lautsprecher antwortet nicht mehr
  (ausgesteckt, WLAN verloren…).
- **AirPlay-Lautsprecher wieder online** — ein Lautsprecher antwortet wieder.

Lassen Sie den Lautsprecher leer, um auf jeden Lautsprecher zu reagieren. Der
Name des Lautsprechers steht als `{{triggerEvent.data.name}}` zur Verfügung.
Die Erkennung folgt dem Intervall der **Erreichbarkeitsprüfung**.

## Dashboard

Fügen Sie das Widget **AirPlay-Lautsprecher** hinzu:

- ohne gewählten Lautsprecher listet es Ihre Lautsprecher mit ihrem Status
  (erreichbar, nicht erreichbar, spielt) und eine Schaltfläche **Jetzt
  prüfen**;
- mit gewähltem Lautsprecher zeigt es Lautstärke, Status, Adresse und
  Protokoll sowie die Schaltflächen **Gong**, **URL abspielen** und **Stopp**.

## Einschränkungen

- Nur Audio: kein Video, keine Bildschirmspiegelung.
- Ein Lautsprecher pro Wiedergabe: kein synchronisiertes Multiroom.
- Gladys gibt die in **Benachrichtigung abspielen** gewählte Lautstärke
  nicht an externe Integrationen weiter: Die Ansage läuft mit der
  **Lautstärke** des Lautsprechers. Um in einer Szene lauter oder leiser zu
  sprechen, stellen Sie die Lautstärke zuvor mit einer Aktion **Gerät
  steuern** ein.
- Gladys streamt in einer eigenen AirPlay-Sitzung: Eine Wiedergabe
  unterbricht, was der Lautsprecher gerade spielte (Apple Music, Spotify…),
  und dies wird danach nicht fortgesetzt.
- **HomePod und Apple TV** spielen nur AirPlay 2 (seit ihrem OS 27
  akzeptieren sie eine AirPlay-1-Sitzung, bleiben aber stumm), und nur mit
  einer **PTP-Uhr**, die Gladys auf den UDP-Ports 319 und 320 bereitstellt.
  Die Integration läuft in einem Docker-Container in einem eigenen Netzwerk:
  Erreicht der Lautsprecher diese Uhr nicht, akzeptiert er die Sitzung und
  bleibt stumm, oder die Integration meldet, dass die PTP-Uhr nicht
  bereitgestellt werden kann. AirPlay-2-Lautsprecher anderer Hersteller
  weichen auf eine NTP-Uhr aus, AirPlay-1-Empfänger brauchen keine.
- Das **AirPlay-Passwort** gilt nur für AirPlay-2-Lautsprecher.
- Ein Apple TV oder HomePod mit „Nur Personen, die dieses Zuhause teilen“
  lehnt Gladys ab (siehe Voraussetzungen).

## Fehlerbehebung

| Symptom                                       | Lösung                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kein Lautsprecher im Tab Erkennung            | Prüfen Sie, ob der Lautsprecher eingeschaltet und im selben Netzwerk wie Gladys ist, und öffnen Sie den Tab erneut.                                            |
| „Der Lautsprecher antwortet nicht“            | Wecken Sie den Lautsprecher auf (Wiedergabe vom Telefon starten), prüfen Sie, ob sich seine IP geändert hat.                                                   |
| „Der Lautsprecher verlangt ein Passwort“      | Tragen Sie das AirPlay-Passwort in der Konfiguration ein.                                                                                                      |
| „Der Lautsprecher hat die Kopplung abgelehnt“ | Home-App > Zuhause-Einstellungen > Lautsprecher & TV > Zugriff für alle im selben Netzwerk erlauben.                                                           |
| Die Benachrichtigung läuft ohne Stimme        | Prüfen Sie die in Gladys gewählte Stimme (Einstellungen Künstliche Intelligenz) und ihr Abonnement.                                                            |
| Der Testgong bleibt stumm                     | Lautsprecher anderer Hersteller: Protokoll auf **AirPlay 1 (RAOP)** oder **AirPlay 2** stellen und erneut testen. HomePod und Apple TV: siehe Einschränkungen. |
| „braucht eine PTP-Uhr“                        | Die UDP-Ports 319/320 sind auf dem Gladys-Server belegt oder gesperrt: siehe Einschränkungen.                                                                  |

Die Integration protokolliert jede Wiedergabe (Lautsprecher, Adresse,
Protokoll, Fehlerursache) im Tab **Protokolle**.
