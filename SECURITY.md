# Security Policy

## Supported Versions

This is a multi-module monorepo; each module is versioned and tagged independently as `<module-path>/vX.Y.Z`. Security fixes target the latest released version of each affected module and the current `main` branch.

| Scope                                   | Supported          |
| --------------------------------------- | ------------------ |
| Latest tagged release of each module    | :white_check_mark: |
| `main` (latest commit / pseudo-version) | :white_check_mark: |
| Older tagged releases / pseudo-versions | :x:                |

## Reporting a Vulnerability

Please do **NOT** open a public issue for security vulnerabilities. Report them privately:

1. Use [GitHub Security Advisories](https://github.com/alex-feel/hugo-artifacts/security/advisories/new).
2. Include a description of the vulnerability, steps to reproduce, the affected module(s) and version(s), the potential impact, and a suggested fix if you have one.

We will acknowledge your report, investigate, and coordinate a fix and a disclosure timeline with you.

## Scope and Threat Model

These modules run at **Hugo build time** on the consuming site's machine or CI and emit static HTML and assets; this repository ships no long-running server component. The security-relevant areas are:

- **Build-time remote fetches.** Modules that call `resources.GetRemote` (for example `shortcodes/github-repo` and `shortcodes/hf-space`) reach third-party APIs at build time. They are designed to degrade gracefully and never to embed untrusted remote data without escaping. Report any case where remote data can inject markup, exfiltrate secrets, or break a build.
- **API tokens.** Tokens are read only from `HUGO_`-prefixed environment variables (Hugo's default security policy). Never commit a token to this repository or to a consuming site's configuration.
- **Generated markup.** Modules emit semantic HTML from user-supplied parameters. Report any parameter that is not correctly escaped in the rendered output, since that is a potential cross-site-scripting vector for every consuming site.
- **Supply chain.** Modules are consumed via Go module paths and some wrap non-Go upstreams (for example `modules/workbox` and `modules/idb`). Pin pseudo-versions or vendor with `hugo mod vendor` for hermetic builds, and report any integrity concern with a published tag, pseudo-version, or wrapped upstream.

## For Contributors

- Never commit secrets: API keys, tokens, or private certificates.
- Read tokens only via `HUGO_`-prefixed environment variables.
- Escape all user-supplied and remote data in template output.
- Keep remote-fetch modules on the graceful-degradation contract: a failed, slow, or malicious fetch must never break the build or inject unescaped markup.

## Security Updates

Security patches are released as soon as possible after a fix is verified, as a new tagged version of each affected module. Watch this repository to be notified of new releases.
