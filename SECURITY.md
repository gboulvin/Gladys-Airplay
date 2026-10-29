# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes,
including:

- the audio URLs the integration decodes: only `http` and `https` reach
  ffmpeg (`-protocol_whitelist`), so a URL typed in a scene cannot read a file
  of the container nor open another protocol;
- the AirPlay password: stored by Gladys as a `secret` field, never logged and
  never written under `/data`;
- what the integration writes under `/data` (the volume of each speaker only).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the AirPlay speakers and their firmware, and the third-party libraries
(report those to their maintainers: the AirPlay sender library at
[lox-audioserver/node-airplay-sender](https://github.com/lox-audioserver/node-airplay-sender),
ffmpeg at [ffmpeg.org](https://ffmpeg.org/security.html)).
