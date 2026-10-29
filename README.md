# AirPlay for Gladys Assistant

**AirPlay** is a Gladys Assistant external integration of type `device`. It
plays voice notifications, built-in chimes and audio URLs on AirPlay and
AirPlay 2 speakers (HomePod, Apple TV, AirPort Express, and third-party
speakers and receivers), and replaces the AirPlay service built into Gladys.

| Capability          | Details                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Discovery           | mDNS browse of `_airplay._tcp` and `_raop._tcp`, through the Gladys core (Discovery tab).           |
| Devices             | One device per speaker: `play_notification`, `volume`, `playback_state` and `title` music features. |
| Voice notifications | The core **Play a notification** scene action (text-to-speech URL decoded by ffmpeg).               |
| Scene actions       | Play an audio URL, play a built-in chime (no internet needed), stop the playback.                   |
| Scene triggers      | Speaker went offline, speaker back online.                                                          |
| Dashboard widget    | Overview of every speaker, or the volume, state and buttons of one speaker.                         |
| Transport           | `local` only: no account, no cloud. A per-device badge shows `local` or `unreachable`.              |
| Countries           | Worldwide (no `countries` in the manifest): AirPlay works on any local network.                     |
| Languages           | English, French, German and Spanish (manifest, runtime messages, widget, documentation).            |

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Compared to the built-in AirPlay service

| Built-in service (Gladys core)           | This integration                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `play_notification` only                 | `play_notification`, `volume`, `playback_state`, `title` (now-playing card)       |
| Volume of the scene action, 70 otherwise | Volume stored per speaker, configurable default, applied live during a playback   |
| Speaker reached by its name, rescanned   | Speaker keyed by its MAC address, IP kept in the device params and re-scanned     |
| AirPlay 2 forced, port 5000              | Lane per speaker from the mDNS records: AirPlay 1 (RAOP), AirPlay 2 on PTP or NTP |
| No feedback on failures                  | Reasons in four languages (unreachable, password, pairing, unreadable URL…)       |
| —                                        | Chimes, audio URLs, stop, offline/online triggers, dashboard widget, test button  |

The external ids differ (`ext:<selector>:speaker:<mac>` instead of
`airplay:<name>`): the user re-creates the speakers from the Discovery tab and
re-selects them in the scenes. The documentation explains it.

## How it works

1. **Discovery.** The integration container runs on a Docker bridge network
   that mDNS never reaches. The manifest declares two `network_discovery`
   entries; the Gladys core browses them on the host network and relays the
   raw records (`scanNetwork('mdns')`). [`src/discovery.js`](src/discovery.js)
   merges the `_airplay._tcp` and `_raop._tcp` records of a speaker on its MAC
   address, reads the AirPlay 2 feature bit and builds the devices.
2. **Playback.** [`src/player.js`](src/player.js) runs one playback per
   speaker: an audio URL is decoded to PCM by `ffmpeg` at real-time pace,
   restricted to `http`/`https`; a chime is synthesized in memory
   ([`src/sounds.js`](src/sounds.js)). A new playback on a speaker replaces
   the current one; a maximum duration cuts endless streams.
3. **AirPlay session.** [`src/airplay.js`](src/airplay.js) assembles the
   pieces of
   [`@sonn-audio/node-airplay`](https://github.com/sonn-audio/node-airplay)
   (Apache-2.0, no dependencies) into one session per playback and picks the
   lane from the mDNS records:
   - **AirPlay 1 (RAOP)** for receivers without AirPlay 2, with the MFi
     `/auth-setup` exchange when their `et` asks for it;
   - **AirPlay 2 over PTP** for HomePod and Apple TV, which render nothing
     else: the process serves one PTP grandmaster (UDP 319/320) shared by
     every session. When it cannot bind those ports, an Apple receiver gets a
     `PTP_UNAVAILABLE` error instead of a silent session;
   - **AirPlay 2 over NTP** for the other receivers without PTP, for those
     whose SETUP reply asks for NTP (the session is re-established on that
     lane), and as the fallback when PTP cannot be served.

   PCM is cut into 352-frame packets; the session ends with a `TEARDOWN`.

4. **Volume.** AirPlay cannot read the volume of an idle speaker: the volume
   is the integration's own state, stored in `/data/volumes.json` and
   confirmed to Gladys with `publishState`.
5. **Reachability.** Every `availability_interval` seconds, the integration
   re-scans, then opens a TCP connection to each speaker
   ([`src/availability.js`](src/availability.js)). It publishes the transport
   badge, and fires `speaker_offline` / `speaker_online` on transitions only.
6. **Voice notifications.** The core turns the text into a speech URL (Gladys
   Plus or a local TTS integration) and sends it to the `play_notification`
   feature. The set-value ack is due in 5 s: the URL and the speaker are
   checked synchronously, the stream runs in the background.

## Development

The project follows the
[official Gladys JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and uses [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
0.16. Node.js 22 or later is required; the Docker image ships Node.js 24 and
ffmpeg.

```bash
npm ci
npm test              # node --test, against the SDK's fake Gladys
npm run lint          # ESLint
npm run format:check  # Prettier
```

| Path                       | Role                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ |
| `index.js`                 | Bootstrap: creates the SDK client, registers the handlers, connects.           |
| `src/app.js`               | SDK wiring: discovery, set value, actions, scenes, widget, lifecycle.          |
| `src/service.js`           | Speakers, playback, volumes and reachability shared by every handler.          |
| `src/discovery.js`         | mDNS records → speakers → Gladys devices.                                      |
| `src/player.js`            | Playbacks: ffmpeg or in-memory source, pacing, timeouts, errors.               |
| `src/airplay.js`           | AirPlay sender: lane choice (RAOP, AirPlay 2 PTP/NTP), packets, teardown.      |
| `src/availability.js`      | TCP reachability probe, transport badges, offline/online triggers.             |
| `src/scenes.js`            | Scene actions `play_audio`, `play_chime`, `stop_playback`.                     |
| `src/widgets.js`           | Dashboard widget `airplay_speakers`.                                           |
| `src/sounds.js`            | Built-in chimes (PCM synthesis).                                               |
| `src/store.js`             | Volumes persisted under `/data`.                                               |
| `src/i18n.js`              | Languages and runtime messages (en, fr, de, es).                               |
| `src/config.js`            | Defaults (mirror the manifest) and normalization.                              |
| `docs/<en\|fr\|de\|es>.md` | User documentation, re-hosted by Gladys.                                       |
| `test/`                    | Unit and end-to-end tests: fake Gladys, fake senders, fake ffmpeg, no network. |

Run it against a Gladys instance in developer mode:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="airplay" \
DATA_DIR=./data LOG_LEVEL=debug \
npm start
```

Before a release, run the store validator: `npx github:GladysAssistant/integration-store .`

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (`patch`, `minor` or `major`). The
workflow bumps `package.json` and the manifest, tags, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/gboulvin/gladys-airplay`, and
publishes the GitHub Release. Add the `gladys-assistant-integration` topic to
the repository so the store indexes it, and make the GHCR package public.

## Known limitations

- Audio only, one speaker per playback (no synchronized multi-room).
- The core relays only the URL of a **Play a notification** action to an
  external integration, not its `volume`: the notification plays at the
  speaker's `volume` feature, which a scene sets with a **Control a device**
  action beforehand.
- **HomePod and Apple TV behind the Docker bridge.** Gladys runs every
  integration on a bridge network (no host network mode, all capabilities
  dropped). Apple receivers only render AirPlay 2 timed by PTP, and they
  query the grandmaster at the address the session SETUP announces: the
  container's own address, which the LAN cannot reach. They may accept the
  session and stay silent. RAOP and NTP receivers are more forgiving (they
  answer the sender at the address they see), without guarantee. Binding UDP
  319/320 as the unprivileged `node` user relies on Docker's default
  `net.ipv4.ip_unprivileged_port_start=0` in the container namespace. A
  network option for such integrations in the Gladys core is the real fix.
- The AirPlay password only reaches AirPlay 2 receivers: the RAOP lane of
  the library has no password support.
- A speaker restricted to "people sharing this home" refuses the session (no
  HomeKit pairing).

## License

[Apache-2.0](LICENSE), like the official template and the AirPlay library it
uses.
