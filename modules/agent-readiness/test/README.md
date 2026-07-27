# agent-readiness module test suite

Node build-output assertions for `modules/agent-readiness`, run against the files that nine Hugo builds publish. The module ships zero JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency.

## Running

```bash
bash modules/agent-readiness/test/run-tests.sh
```

or, on Windows:

```text
modules\agent-readiness\test\run-tests.cmd
```

Both runners validate the shipped data files, perform the repository's pre-launch Hugo process check, build all nine fixtures, fail hard on any `deprecat`, `ERROR`, or `found no layout file` line in any build log, and then run the assertions.

> **These specs need network access.** The Agent Skills specs exercise a real build-time `resources.GetRemote`, because the digest guarantee -- that the advertised hash matches the bytes actually served -- cannot be proven without one. On a run with no network, the module correctly omits every skill and emits no index file at all, and the first skills spec reports that as the cause rather than as a mysterious missing file.

## The data-file check runs first, deliberately

`tests/00-data.spec.js` runs on its own, **before either fixture is built**. A malformed `data/agent-readiness/*.toml` otherwise surfaces as an opaque Hugo build failure at some unrelated template, leaving the reader to work backwards to the registry. Run first, it is reported as itself.

## Nine builds

| Build | Fixture | Environment | What it proves |
| --- | --- | --- | --- |
| baseline | `fixture/` | default | Every `[params.agent.license]` key is unset and both switches are off, so no twin carries a `license:` line and `llms.txt` carries no license line. This is what proves the license surfaces are inert until a consumer opts in. It also carries every deliberately-broken config shape, so each guard has something to refuse. |
| configured | `fixture/` | `configured` | The license table is filled and both switches are on, so every license surface appears exactly once. |
| minimal | `fixture/` | `minimal` | Almost nothing is configured, which is the shape a consumer gets on import. It is the only build that can reach the unconfigured `robots.txt`, the zero-skills gate, and a facts document with no sections. |
| notwins | `fixture/` | `notwins` | Twins switched off site-wide while `markdown` stays wired in `[outputs]`. The only shape in which `llms.txt` and `about.md` can be caught advertising twin URLs for files that were never written. |
| multilingual | `fixture/` | `multilingual` | Two languages, the only shape in which the agent-skills index's `site.Language.IsDefault` gate does anything at all. |
| llmsoff | `fixture/` | `llmsoff` | `llms.txt` switched off while `llmstxt` stays wired. The counterpart of `notwins` for the other document the twins and `about.md` point at. |
| edge | `fixture/` | `edge` | A **subpath** `baseURL`, plus the misconfigurations no other build reaches: a license `url` with no `name`, an unrecognized `sitemap_section_target`, and two pages publishing to one URL. |
| off | `fixture/` | `off` | The master switch and every surface switch false, with all four formats still wired. The only shape that exercises the `enable` conjunct in any renderer. |
| shadow | `fixture-shadow/` | default | The fixture ships its own `layouts/robots.txt`, proving the documented silent-override hazard. |

**Why so many.** Each extra environment exists because a real contract is unreachable without it, and the pattern behind all of them is the same: a fixture that configures everything cannot test what happens when something is not configured. The `robots.txt` defect fixed in `d0bdfe7` lived in exactly the default shape and the whole suite stayed green through it. `notwins`, `multilingual` and `edge` each isolate gates whose deletion changes no byte in any other build; each was verified by deleting the gate and watching the suite go red. The `edge` build's subpath `baseURL` is the clearest case: every other fixture sits at a domain root, where Hugo's `absURL` treats a leading-slash input identically to a correct implementation, so a URL bug that 404s on every subpath deployment is invisible.

Environments are used rather than extra fixture directories so the content tree, the module import and the `[outputs]` wiring stay defined in one place.

## What the fixtures cover

The default fixture wires `markdown` into `home`, `section` **and** `page`, which is the only way `home.markdown.md` and `section.markdown.md` execute before a consuming site becomes their first caller. It restates `html` and `rss` on the `section` list so the suite can prove the same-list-replacement rule: dropping `RSS` there silently deletes every section feed with no error.

It deliberately configures things that must fail gracefully:

- one **unknown `bots` key**, proving the warn-and-skip path emits no literal `User-agent` line;
- a `[params.agent.frontmatter.blog]` map that **repeats `title`**, a key the twin builder always emits itself, proving the duplicate-key guard skips it with exactly one warning while every published twin still parses under a strict YAML loader with duplicate-key detection enabled;
- one `[[llms.sections]]` entry written as a **bare name** and one written in **slashed form**, proving both normalize identically -- an unnormalized mismatch renders an empty `##` heading with no warning, no error, and exit 0;
- a page carrying `agent: false`, a page carrying `robots: noindex`, and a search page, proving all three vanish from every surface together;
- an identity row whose key **is absent** from the page it reads, proving a missing optional fact is omitted silently rather than fabricated;
- a project carrying `period_to: 'present'`, proving the sentinel is **omitted** from twin front matter (it is not a date) while rendering **as prose** in the facts document (where it is true and useful);
- four `[[params.agent.skills]]` entries covering every outcome: one that fetches and publishes, one whose source 404s (which `resources.GetRemote` reports as an absent resource rather than a failure), one whose name breaks the field rules, and one that repeats an earlier entry's name;
- a page using the map opt-out `agent: {exclude: true}` and a noindexed page using the `agent: {exclude: false}` override, so both documented forms are exercised rather than only the bare shorthand;
- surface `enable` keys set on the HOME page, where a page tier would do real damage, proving all of them are discarded with a warning.

**The default fixture ships no `layouts/robots.txt`, and a spec asserts that it does not.** If it ever acquired one, every robots assertion would pass for the wrong reason -- against the fixture's own file rather than against the module's generator.

## Specs

| File | Covers |
| --- | --- |
| `tests/00-data.spec.js` | The shipped data files: both TOMLs parse, the registry holds exactly 21 entries with no retired token, every license value ships inert, facts sections carry no `limit` key, and both i18n files carry the same four keys. |
| `tests/01-robots.spec.js` | The generated `robots.txt`, the registry lookup and its warn-and-skip path, and the shadowing hazard proven against the shadow fixture. |
| `tests/02-twins.spec.js` | Markdown twins: fixed field order, strict YAML with duplicate-key detection, `jsonify` quoting, the `present` sentinel, `last_updated`, body source, home and section twins, section feed survival, the opt-outs, sitemap purity, and the license variants. |
| `tests/03-llms-facts.spec.js` | `llms.txt` and `about.md`, including the exact license line, both authored section shapes, the complete-by-construction bullet counts, and the cross-surface invariant that the twin set equals the set `llms.txt` lists. |
| `tests/04-skills.spec.js` | The Agent Skills index: schema, published URLs, the SHA-256 digest verified against the bytes actually published, every omission path, and the default-language gate under two languages. |
| `tests/05-guards.spec.js` | The configuration guards and the cross-surface invariants they protect: twin links falling back to HTML URLs when twins are off, nothing pointing at `llms.txt` when it is off, a subpath `baseURL` surviving into every consumer-authored URL, the section-entry refusals, both halves of the `limit` contract, the twin's trailing pointer bytes, site-scoped keys set at the page tier, a license `url` with no `name`, an unrecognized `sitemap_section_target`, colliding permalinks, a non-map `agent:` value, and skill-name uniqueness. |

Re-run the assertions alone against existing builds with:

```bash
FIXTURE_PUBLIC=fixture/public/baseline \
FIXTURE_PUBLIC_CONFIGURED=fixture/public/configured \
FIXTURE_PUBLIC_MINIMAL=fixture/public/minimal \
FIXTURE_PUBLIC_NOTWINS=fixture/public/notwins \
FIXTURE_PUBLIC_MULTILINGUAL=fixture/public/multilingual FIXTURE_PUBLIC_LLMSOFF=fixture/public/llmsoff FIXTURE_PUBLIC_EDGE=fixture/public/edge FIXTURE_PUBLIC_OFF=fixture/public/off \
FIXTURE_PUBLIC_SHADOW=fixture-shadow/public \
HUGO_BUILD_LOG=hugo-build.log \
HUGO_BUILD_LOG_CONFIGURED=hugo-build-configured.log \
HUGO_BUILD_LOG_MINIMAL=hugo-build-minimal.log \
HUGO_BUILD_LOG_NOTWINS=hugo-build-notwins.log \
HUGO_BUILD_LOG_MULTILINGUAL=hugo-build-multilingual.log HUGO_BUILD_LOG_LLMSOFF=hugo-build-llmsoff.log HUGO_BUILD_LOG_EDGE=hugo-build-edge.log HUGO_BUILD_LOG_OFF=hugo-build-off.log \
HUGO_BUILD_LOG_SHADOW=hugo-build-shadow.log \
npm test
```
