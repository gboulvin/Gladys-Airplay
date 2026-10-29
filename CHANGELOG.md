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

### Changed

- AirPlay sessions use `@sonn-audio/node-airplay`, the maintained successor of
  the archived `@lox-audioserver/node-airplay-sender`. The lane is chosen per
  speaker from its mDNS records: AirPlay 2 timed by PTP for HomePod and Apple
  TV (they play nothing over AirPlay 1 since OS 27), AirPlay 2 timed by NTP for
  the other receivers, AirPlay 1 (RAOP, with the MFi exchange) for the older
  ones.
- An Apple speaker that cannot get its PTP clock (UDP ports 319/320) now
  reports it instead of playing silence.
- The AirPlay password only applies to AirPlay 2 speakers.
- License: Apache-2.0, like the official template (was AGPL-3.0-or-later,
  required by the previous AirPlay library).

### Fixed

- A speaker sending a malformed answer no longer stops the whole integration:
  the error raised inside the AirPlay library ends the playbacks only, and the
  test or scene reports the failure. Any other unexpected error still restarts
  the integration, as do repeated library failures (more than 5 in a minute).

[Unreleased]: https://github.com/gboulvin/Gladys-Airplay/commits/main
