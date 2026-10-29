# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

**AirPlay**, a Gladys Assistant **external integration** of manifest
`type: "device"` that replaces the AirPlay service built into Gladys: a Node.js
service (Node 22+, ESM, no build step) running in its own sandboxed Docker
container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the speakers through
[`@lox-audioserver/node-airplay-sender`](https://github.com/lox-audioserver/node-airplay-sender)
plus `ffmpeg` (installed in the image). It follows the official JavaScript
template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/player.test.js           # one file
node --test --test-name-pattern "volume"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          bootstrap only: new GladysIntegration(), registerHandlers, connect()
src/app.js                        SDK wiring: scan, set value, actions, scene actions, widget, lifecycle
src/service.js                    shared state: scanned speakers, player, volumes, availability
src/discovery.js                  mDNS records -> speakers -> device payload (external ids, features, params)
src/player.js                     one AirPlay session per speaker; ffmpeg (URL) or in-memory PCM source
src/availability.js               TCP probe, transport badges, speaker_offline/speaker_online triggers
src/scenes.js                     scene actions (manifest `scene_actions`)
src/widgets.js                    dashboard widget (manifest `widgets`)
src/sounds.js                     built-in chimes, synthesized PCM
src/store.js                      volumes persisted in /data/volumes.json
src/i18n.js                       SUPPORTED_LANGUAGES, MESSAGES, ERROR_REASONS, LABELS
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json manifest
docs/<en|fr|de|es>.md             user documentation, re-hosted by Gladys (mandatory)
test/                             node --test; fake Gladys (SDK), fake senders/ffmpeg/probe (test/helpers.js)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** A speaker is `ext:<selector>:speaker:<mac>`,
  the MAC coming from the mDNS records — never its name, which the user can
  change. Feature keys are the music types (`play_notification`, `volume`,
  `playback_state`, `title`): `publishNowPlaying` relies on that convention.
  Never rename a config key, action, scene trigger/action, widget, widget
  action or sound key either: users and scenes store them.
- **Bridge network.** The container never sees mDNS: discovery goes through
  `scanNetwork('mdns')` and the services declared in `network_discovery`
  (`test/manifest.test.js` ties them to the code). Everything else (RTSP,
  audio, the reachability probe) is unicast.
- **Acks are short.** A set-value is acked under 5 s: validate the URL and
  resolve the speaker synchronously, stream in the background. Scene actions
  and widget actions must resolve before their declared timeout
  (`test/manifest.test.js` checks the waits).
- **Scene contract.** An unreachable speaker is an output (`played: false`),
  a wrong setup throws. Triggers fire on transitions only, never because of a
  received action (loops).
- **Security.** Only `http`/`https` URLs reach ffmpeg, with
  `-protocol_whitelist`. Never log the AirPlay password. Write only under
  `/data`; the rootfs is read-only.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects, `label`, `description` and
  `placeholder` alike. The catalog `description` holds 10 to 100 characters
  per language. `keywords` needs `gladys_version >= 5.3.0`; the scene and
  widget fields 5.1.0. No `countries`: the integration is usable worldwide.
- **User-facing text** exists in four languages: English, French, German and
  Spanish (`SUPPORTED_LANGUAGES` in `src/i18n.js`): manifest texts, messages,
  widget labels and `docs/<lang>.md`, kept in sync. `test/i18n.test.js`
  checks every text has all four.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network nor spawn a process: inject
  `startSender`, `spawn` and `probe` (see `test/helpers.js`).
