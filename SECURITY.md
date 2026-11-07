# Security policy

## Supported versions

Security fixes go into `main` and the next release. Only the latest release is supported; if you run
an older one, update before reporting.

| Version          | Supported |
| ---------------- | --------- |
| latest release   | yes       |
| older releases   | no        |

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a vulnerability. Report it
privately through GitHub's
[private vulnerability reporting](https://github.com/lorenzoyang/TavoloFlow/security/advisories/new):
only the maintainer can see the report.

A useful report includes:

- what an attacker can do, and which user they need to be (none, guest, staff, owner or platform
  administrator);
- the steps to reproduce it, ideally on the local demo (`docker compose -f demo/compose.yaml up -d`);
- the version or commit you tested.

Never include real passwords, join codes, cookies, connection strings or Data Protection keys.

TavoloFlow is maintained by one person, so replies are best effort. You will get an answer once the
report has been read, and a fix in a release when the issue is confirmed. If you want to be credited
in the advisory, say how.

## Scope

In scope: the code in this repository, including the API, the frontend, the demo and the deployment
templates in `deploy/`.

Out of scope:

- vulnerabilities in dependencies that cannot be reached from TavoloFlow's own code (report them to
  the dependency; Dependabot already tracks published advisories);
- the configuration of a particular self-hosted installation, which is up to whoever runs it
  ([self-hosting guide](docs/en/self-hosting.md));
- the known limitations described in the
  [development notes](docs/en/development-notes.md#current-limits), such as the four-character
  table code protected only by rate limits, unless you find a way around those protections.
