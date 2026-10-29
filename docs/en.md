# AirPlay

Play voice notifications, chimes and audio files on your AirPlay speakers
from Gladys: HomePod and HomePod mini, Apple TV, AirPort Express, and the
third-party speakers and receivers that support AirPlay or AirPlay 2 (Sonos,
Bose, Denon/Marantz, Yamaha, Bang & Olufsen, Libratone…).

This integration replaces the AirPlay service built into Gladys, and adds a
volume per speaker, built-in chimes, scene actions and triggers, and a
dashboard widget.

## Where it works

- **Countries:** everywhere. The integration talks to the speakers on your
  local network only; it does not depend on a country, a vendor account or
  an online service.
- **Network:** the speakers must be on the **same local network** (same
  subnet) as the Gladys server. Speakers on a guest Wi-Fi, a separate VLAN or
  behind a VPN are not found.
- **Internet:** not needed to play a chime, a file or a stream of your local
  network. The voice notifications use the text-to-speech voice selected in
  Gladys: **Gladys Plus** by default (internet required), or a local
  text-to-speech integration.
- **Languages:** English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.3.0 or later**.
- In the **Home** app of your iPhone (Home settings > **Speakers & TV**),
  **Allow speaker & TV access** must be set to **Everyone** or **Anyone on
  the same network**. "Only people sharing this home" blocks Gladys.
- If you set a password for AirPlay, enter it in the configuration.

## Installation

1. Install **AirPlay** from the integration catalog of Gladys.
2. Open the **Discovery** tab: your speakers are listed after a few seconds.
   Click **Create** on each speaker you want in Gladys.
3. Use the **Test a speaker** button of the **Configuration** tab: the chosen
   speaker plays a two-tone chime.

### Coming from the built-in AirPlay service

The speakers of the built-in service and those of this integration are
different devices. Once your speakers are created here:

1. Edit your scenes using **Play a notification** and pick the new speakers.
2. Delete the old speakers from the built-in AirPlay integration.

## Configuration

| Setting                    | Default   | Effect                                                                                   |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| **Default volume (%)**     | 70        | Volume of a speaker whose volume was never set in Gladys.                                |
| **Maximum duration (s)**   | 300       | Any playback is stopped after this time (10 to 1,800 s).                                 |
| **Availability check (s)** | 300       | How often the speakers are checked (60 to 3,600 s). Drives the offline/online triggers.  |
| **AirPlay protocol**       | Automatic | Automatic reads what each speaker announces. Force AirPlay 1 for an old silent receiver. |
| **Sender name**            | Gladys    | Name shown by the speakers that display who is playing.                                  |
| **AirPlay password**       | _(empty)_ | Only for password-protected speakers.                                                    |

## Your speakers in Gladys

Each speaker is a device with four features:

- **Notification** — what the **Play a notification** scene action of Gladys
  uses: the text is turned into speech and played on the speaker.
- **Volume** — the volume Gladys plays at (0 to 100 %). AirPlay cannot read
  the volume of a speaker at rest, so this is Gladys' own setting, kept per
  speaker; changing it during a playback applies it immediately.
- **Playback state** — playing or idle.
- **Now playing** — what Gladys is playing.

The device card shows a **local** badge when the speaker answers, and
**unreachable** when it does not.

## Scenes

### Actions

- **Play a notification** (built into Gladys) — speaks a text on a speaker.
- **Play an audio URL on AirPlay** — plays a sound file or a stream
  (MP3, AAC, WAV, OGG, FLAC, internet radio…) from an `http://` or `https://`
  address, at an optional volume. With **Wait until the end**, the scene
  waits for the end of the audio (100 s at most). Outputs: **Playback
  started** and **Duration played**.
- **Play a chime on AirPlay** — a built-in sound: **Doorbell**,
  **Notification** or **Alert**. It needs neither internet nor text-to-speech:
  ideal for a doorbell or an alarm.
- **Stop AirPlay playback** — stops what Gladys is playing on a speaker.

A speaker that does not answer does not stop the scene: **Playback started**
is then false, use it in a condition to send a message instead.

### Triggers

- **AirPlay speaker went offline** — a speaker stopped answering (unplugged,
  Wi-Fi lost…).
- **AirPlay speaker back online** — a speaker answers again.

Leave the speaker empty to react to any speaker. The name of the speaker is
available as `{{triggerEvent.data.name}}`. The detection follows the
**Availability check** interval.

## Dashboard

Add the **AirPlay speakers** widget:

- without a speaker chosen, it lists your speakers with their state
  (reachable, unreachable, playing) and a **Check now** button;
- with a speaker chosen, it shows its volume, its state, its address and
  protocol, and **Chime**, **Play a URL** and **Stop** buttons.

## Limitations

- Audio only: no video, no screen mirroring.
- One speaker per playback: no synchronized multi-room.
- Gladys does not pass the volume chosen in **Play a notification** to
  external integrations: the notification plays at the speaker's **Volume**.
  To speak louder or softer in a scene, set the volume with a **Control a
  device** action first.
- Gladys streams through its own AirPlay session: a playback interrupts what
  the speaker was playing (Apple Music, Spotify…), which does not resume
  afterwards.
- The integration runs in a Docker container. Some AirPlay 2 receivers need
  to reach the sender back for their clock synchronization; if a speaker is
  found and tested but stays silent, try **AirPlay 1 (RAOP)** in the
  configuration.
- An Apple TV or HomePod set to "Only people sharing this home" refuses
  Gladys (see the requirements).

## Troubleshooting

| Symptom                                | What to do                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| No speaker in the Discovery tab        | Check that the speaker is on and on the same network as Gladys, then reopen the tab.        |
| "The speaker does not answer"          | Wake the speaker up (play something from your phone), check its IP address has not changed. |
| "The speaker asks for a password"      | Enter the AirPlay password in the configuration.                                            |
| "The speaker refused the pairing"      | Home app > Home settings > Speakers & TV > allow everyone on the same network.              |
| The notification plays without a voice | Check the voice selected in Gladys (Artificial intelligence settings) and its subscription. |
| The test chime plays but stays silent  | Set the protocol to **AirPlay 1 (RAOP)**, or **AirPlay 2**, and test again.                 |

The integration logs each playback (speaker, address, protocol, reason of a
failure) in its **Logs** tab.
