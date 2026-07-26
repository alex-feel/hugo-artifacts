# agent-readiness module test suite

Node build-output assertions for `modules/agent-readiness`, run against the files that four Hugo builds publish. The module ships zero JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency.

## Running

```bash
bash modules/agent-readiness/test/run-tests.sh
```

or, on Windows:

```text
modules\agent-readiness\test\run-tests.cmd
```

Both runners validate the shipped data files, perform the repository's pre-launch Hugo process check, build all four fixtures, fail hard on any `deprecat`, `ERROR`, or `found no layout file` line in any build log, and then run the assertions.

> **These specs need network access.** The Agent Skills specs exercise a real build-time `resources.GetRemote`, because the digest guarantee -- that the advertised hash matches the bytes actually served -- cannot be proven without one. On a run with no network, the module correctly omits every skill and emits no index file at all, and the first skills spec reports that as the cause rather than as a mysterious missing file.

## The data-file check runs first, deliberately

`tests/00-data.spec.js` runs on its own, **before either fixture is built**. A malformed `data/agent-readiness/*.toml` otherwise surfaces as an opaque Hugo build failure at some unrelated template, leaving the reader to work backwards to the registry. Run first, it is reported as itself.

## Four builds

| Build | Fixture | Environment | What it proves |
| --- | --- | --- | --- |
| baseline | `fixture/` | default | Every `[params.agent.license]` key is unset and both switches are off, so no twin carries a `license:` line and `llms.txt` carries no license line. This is what proves the license surfaces are inert until a consumer opts in. |
| configured | `fixture/` | `configured` | The license table is filled and both switches are on, so every license surface appears exactly once. |
| minimal | `fixture/` | `minimal` | Almost nothing is configured, which is the shape a consumer gets on import. It is the only build that can reach the unconfigured `robots.txt`, the zero-skills gate, and a facts document with no sections. |
| shadow | `fixture-shadow/` | default | The fixture ships its own `layouts/robots.txt`, proving the documented silent-override hazard. |

The `minimal` build exists because the other two deliberately configure **everything**, which left three of Plan A's acceptance criteria -- all of them about the _unconfigured_ case -- with no build to be asserted against. That gap is not hypothetical: the `robots.txt` defect fixed in `d0bdfe7` was in exactly the default shape, and the whole suite stayed green through it.

## What the fixtures cover

The default fixture wires `markdown` into `home`, `section` **and** `page`, which is the only way `home.markdown.md` and `section.markdown.md` execute before a consuming site becomes their first caller. It restates `html` and `rss` on the `section` list so the suite can prove the same-list-replacement rule: dropping `RSS` there silently deletes every section feed with no error.

It deliberately configures things that must fail gracefully:

- one **unknown `bots` key**, proving the warn-and-skip path emits no literal `User-agent` line;
- a `[params.agent.frontmatter.blog]` map that **repeats `title`**, a key the twin builder always emits itself, proving the duplicate-key guard skips it with exactly one warning while every published twin still parses under a strict YAML loader with duplicate-key detection enabled;
- one `[[llms.sections]]` entry written as a **bare name** and one written in **slashed form**, proving both normalize identically -- an unnormalized mismatch renders an empty `##` heading with no warning, no error, and exit 0;
- a page carrying `agent: false`, a page carrying `robots: noindex`, and a search page, proving all three vanish from every surface together;
- an identity row whose key **is absent** from the page it reads, proving a missing optional fact is omitted silently rather than fabricated;
- a project carrying `period_to: 'present'`, proving the sentinel is **omitted** from twin front matter (it is not a date) while rendering **as prose** in the facts document (where it is true and useful);
- three `[[params.agent.skills]]` entries covering all three outcomes: one that fetches and publishes, one whose source 404s (which `resources.GetRemote` reports as an absent resource rather than a failure), and one whose name breaks the field rules.

**The default fixture ships no `layouts/robots.txt`, and a spec asserts that it does not.** If it ever acquired one, every robots assertion would pass for the wrong reason -- against the fixture's own file rather than against the module's generator.

## Specs

| File | Covers |
| --- | --- |
| `tests/00-data.spec.js` | The shipped data files: both TOMLs parse, the registry holds exactly 21 entries with no retired token, every license value ships inert, facts sections carry no `limit` key, and both i18n files carry the same four keys. |
| `tests/01-robots.spec.js` | The generated `robots.txt`, the registry lookup and its warn-and-skip path, and the shadowing hazard proven against the shadow fixture. |
| `tests/02-twins.spec.js` | Markdown twins: fixed field order, strict YAML with duplicate-key detection, `jsonify` quoting, the `present` sentinel, `last_updated`, body source, home and section twins, section feed survival, the opt-outs, sitemap purity, and the license variants. |
| `tests/03-llms-facts.spec.js` | `llms.txt` and `about.md`, including the exact license line, both authored section shapes, the complete-by-construction bullet counts, and the cross-surface invariant that the twin set equals the set `llms.txt` lists. |
| `tests/04-skills.spec.js` | The Agent Skills index: schema, published URLs, the SHA-256 digest verified against the bytes actually published, and every omission path. |

Re-run the assertions alone against existing builds with:

```bash
FIXTURE_PUBLIC=fixture/public/baseline \
FIXTURE_PUBLIC_CONFIGURED=fixture/public/configured \
FIXTURE_PUBLIC_MINIMAL=fixture/public/minimal \
FIXTURE_PUBLIC_SHADOW=fixture-shadow/public \
HUGO_BUILD_LOG=hugo-build.log \
HUGO_BUILD_LOG_CONFIGURED=hugo-build-configured.log \
HUGO_BUILD_LOG_MINIMAL=hugo-build-minimal.log \
HUGO_BUILD_LOG_SHADOW=hugo-build-shadow.log \
npm test
```
