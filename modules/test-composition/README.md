# Cross-module composition test suite

Node build-output assertions for the ONE surface that `modules/seo`, `modules/agent-readiness` and `modules/search` share: the consuming site's single `[outputs]` table. This directory is a test suite, not a Hugo module -- it ships no `layouts/`, no `assets/` and no `go.mod` of its own, and nothing imports it. Only [`fixture/`](fixture/) carries a `go.mod`, because a Hugo consumer site needs one.

## Why this suite exists

Each module is proven on its own by its own suite, against a fixture that imports that module alone. No single-module fixture can see what happens when a site imports two or three of them at once, and that is exactly where the modules interact:

- `[outputFormats]` and `[mediaTypes]` shipped in a module's `hugo.toml` merge ADDITIVELY into the consumer configuration. A site that imports `agent-readiness` and `search` can name `llmstxt`, `llmsindex`, `agentfacts`, `agentskills`, `searchindex` and `opensearch` without defining any of them.
- `[outputs]` does NOT. Hugo replaces the output list per page kind rather than merging it, and a module's own `[outputs]` table never reaches the consumer configuration at all, so every module README has to show an `[outputs]` block of its own.

A consumer who follows two of those READMEs literally lands in one of two states. Two `[outputs]` tables in one file is a hard configuration-load failure (`unmarshal failed: toml: table outputs already exists`), which is loud and self-correcting. One table replacing the other loads cleanly, exits 0, prints no warning -- and silently stops publishing every document the replaced list asked for. The second shape is what this suite catches.

## What the one build asserts

| Assertion | What it holds |
| --- | --- |
| every module document is published side by side | `/llms.txt`, `/llms-index.txt`, `/about.md`, `/index.md`, `/searchindex.json`, `/opensearch.xml`, `/robots.txt` and `/index.html` all exist, non-empty, out of ONE build |
| the merged home list carries every format the three modules define | the list is checked against the `[outputFormats.*]` names read out of `modules/agent-readiness/hugo.toml` and `modules/search/hugo.toml`, so a module that adds a format a consumer must wire fails here until the fixture wires it |
| exactly one `[outputs]` table | the merged single table is the only shape that can hold all three modules |
| the twins describe the page the index holds | the agent-readiness `llms.txt` / `about.md` entries and the search index record name the same page |
| the seo head surface and the search body markup coexist | the seo module contributes head markup only, so its composition evidence is that its markup renders on the same page through the same `baseof.html` |
| ONE build stamp reaches every dated document | the twins' `build_time`, both link indexes' and `/about.md`'s `> Build time:` line, and the search index's `generated` field are one string, although two different modules write them |
| the search module reaches that stamp by DELEGATION | equality is not enough to prove it -- the fixture builds in under a second while the stamp's precision is one second, so a search module computing its own value would print the same string. A white-box probe reads both modules' `hugo.Store` keys: the search module's own must be EMPTY (it delegated) while agent-readiness's holds the value. Deleting the delegation changes no published byte and fails only here. It is also the one place the repository verifies that `templates.Exists` sees a partial mounted from a MODULE, which the whole soft-dependency design rests on |
| the build log carries no `WARN`, `ERROR` or deprecation line | every module in the chain degrades by warning rather than failing, so a composition regression surfaces as an exit-0 build with a warning in it |

`agentskills` is wired in the merged home list but publishes no document here: every `[[params.agent.skills]]` entry names a remote source the module fetches at build time, and this suite stays offline. The merged-list assertion still covers the format name, which is the part a replacing `[outputs]` table would drop.

## Running

```bash
bash modules/test-composition/run-tests.sh
```

or, on Windows:

```text
modules\test-composition\run-tests.cmd
```

Either script performs the pre-launch hugo process check, builds `fixture/` once into `fixture/public/`, fails on any deprecation or error line in `hugo-build.log`, and then runs the specs against the published tree. The suite has no npm dependencies: `node --test` and `node:assert` are enough, so no `npm install` is needed in this directory.

The fixture resolves the three modules through `fixture/hugo.work` plus a `replace` in `fixture/go.mod`, both pointing at the sibling module directories in this repository, so the suite always tests the working tree rather than a published tag.
