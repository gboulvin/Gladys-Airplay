# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- AirPlay speaker discovery through the Gladys core (mDNS `_airplay._tcp` and
  `_raop._tcp`), one device per speaker keyed by its MAC address.
- Voice notifications on AirPlay and AirPlay 2 speakers through the core
  **Play a notification** scene action, replacing the built-in AirPlay service.
- A volume per speaker, stored by the integration and applied live during a
  playback, with a configurable default volume.
- Playback state and "now playing" title of each speaker.
- Scene actions: play an audio URL, play a built-in chime (doorbell,
  notification, alert) that needs neither internet nor text-to-speech, stop
  the playback.
- Scene triggers: a speaker went offline, a speaker is back online.
- Dashboard widget **AirPlay speakers**: an overview of every speaker, or the
  volume, state and buttons of one speaker.
- **Test a speaker** button in the Configuration screen.
- Per-device `local` / `unreachable` transport badge.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-Airplay/commits/main
