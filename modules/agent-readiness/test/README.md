# agent-readiness module test suite

Node build-output assertions for `modules/agent-readiness`, run against the files that fourteen Hugo builds publish. The module ships zero JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency.

## Running

```bash
bash modules/agent-readiness/test/run-tests.sh
```

or, on Windows:

```text
modules\agent-readiness\test\run-tests.cmd
```

Both runners validate the shipped data files, perform the repository's pre-launch Hugo process check, build all fourteen fixtures, fail hard on any `deprecat`, `ERROR`, or `found no layout file` line in any build log, and then run the assertions.

> **These specs need network access.** The Agent Skills specs exercise a real build-time `resources.GetRemote`, because the digest guarantee -- that the advertised hash matches the bytes actually served -- cannot be proven without one. On a run with no network, the module correctly omits every skill and emits no index file at all, and the first skills spec reports that as the cause rather than as a mysterious missing file. The widgets build additionally fetches the widget modules' remote APIs (GitHub, the Hugging Face Hub, arXiv, YouTube posters); those fetches degrade with `WARN` lines when tokenless or rate-limited, which the log gates deliberately tolerate, and the widget-twin spec asserts only the baseline lines each markdown shortcode variant derives from the shortcode parameters alone, never fetched-only enrichment.

## The data-file check runs first, deliberately

`tests/00-data.spec.js` runs on its own, **before either fixture is built**. A malformed `data/agent-readiness/*.toml` otherwise surfaces as an opaque Hugo build failure at some unrelated template, leaving the reader to work backwards to the registry. Run first, it is reported as itself.

## Fourteen builds

| Build | Fixture | Environment | What it proves |
| --- | --- | --- | --- |
| baseline | `fixture/` | default | Every `[params.agent.license]` key is unset and both switches are off, so no twin carries a `license:` line and `llms.txt` carries no license line. This is what proves the license surfaces are inert until a consumer opts in. It also carries every deliberately-broken config shape, so each guard has something to refuse. |
| configured | `fixture/` | `configured` | The license table is filled and both switches are on, so every license surface appears exactly once. It also configures `bots_allow` together with `bots_disallow`, the only build in which the bot-group Allow emission path executes -- the module ships the list empty, and `edge` must stay Allow-free to prove the blocking shape. |
| minimal | `fixture/` | `minimal` | Almost nothing is configured, which is the shape a consumer gets on import. It is the only build that can reach the unconfigured `robots.txt`, the zero-skills gate, and a facts document with no sections. |
| notwins | `fixture/` | `notwins` | Twins switched off site-wide while `markdown` stays wired in `[outputs]`. The only shape in which `llms.txt` and `about.md` can be caught advertising twin URLs for files that were never written. |
| multilingual | `fixture/` | `multilingual` | Two languages, the only shape in which the agent-skills index's `site.Language.IsDefault` gate does anything at all. |
| llmsoff | `fixture/` | `llmsoff` | `llms.txt` switched off while `llmstxt` stays wired. The counterpart of `notwins` for the other document the twins and `about.md` point at. It also carries the scalar-for-a-sub-table shapes (`facts` `identity` and `contact` written as bare strings) and a falsy non-map `frontmatter`, which the builds hosting real facts blocks cannot. |
| edge | `fixture/` | `edge` | A **subpath** `baseURL`, plus the misconfigurations no other build reaches: a license `url` with no `name`, an unrecognized `sitemap_section_target`, two pages publishing to one URL, the configured robots directive lists, and a `Disallow` value carrying an embedded line break. |
| off | `fixture/` | `off` | The master switch alone, false, with all four formats still wired. Setting the surface switches too would MASK the conjunct: every renderer gates on one, so deleting `$cfg.enable` from four of six would then change no byte. |
| badtables | `fixture/` | `badtables` | The section arrays written as bare strings instead of arrays of tables, which TOML cannot express alongside the real tables, so they need a build of their own. |
| nsoff | `fixture/` | `nsoff` | The whole `[params]` `agent` namespace written as a bare value, the shorthand a consumer reaches for as a kill switch. Every other environment declares `[agent]` as a table, which TOML cannot reconcile with a bare value. |
| nosectionpages | `fixture/` | `nosectionpages` | The single key `section_pages = false` on top of the default configuration, so every published byte outside the roster blocks is identical to baseline. The only build in which stripping the roster block from a baseline section twin must reproduce the published twin byte for byte, proving the switch restores the pre-roster output and touches nothing else. |
| shadow | `fixture-shadow/` | default | The fixture ships its own `layouts/robots.txt`, proving the documented silent-override hazard. |
| paginated | `fixture-paginated/` | default | A single section of five pages at `pagerSize = 2`, so Hugo publishes `/posts/page/2/` and `/posts/page/3/`. The only shape in which a surface can be caught enumerating a pager shell alongside the pages it lists, or emitting a Markdown twin for one. |
| widgets | `fixture-widgets/` | default | A fixture importing every widget shortcode module (`github-repo`, `github-profile`, `hf-space`, `arxiv-paper`, `callout`, `youtube-embed`, and `images` for `image` and `image-gallery`) next to `agent-readiness`, whose single regular page calls all eight widget shortcodes. The only shape in which a page twin can be caught embedding widget BEM HTML or inline SVG instead of the compact Markdown citations the modules' markdown output-format variants emit. |

**Why so many.** Each extra environment exists because a real contract is unreachable without it, and the pattern behind all of them is the same: a fixture that configures everything cannot test what happens when something is not configured. The `robots.txt` defect fixed in `d0bdfe7` lived in exactly the default shape and the whole suite stayed green through it. `notwins`, `multilingual` and `edge` each isolate gates whose deletion changes no byte in any other build; each was verified by deleting the gate and watching the suite go red. The `edge` build's subpath `baseURL` is the clearest case: every other fixture sits at a domain root, where Hugo's `absURL` treats a leading-slash input identically to a correct implementation, so a URL bug that 404s on every subpath deployment is invisible.

Environments are used rather than extra fixture directories so the content tree, the module import and the `[outputs]` wiring stay defined in one place. The three exceptions are the concerns that config alone cannot express: `shadow` ships a `layouts/robots.txt`; `paginated` needs a `list.html` that calls `.Paginate`, a content tree that spills past `pagerSize`, and no section allow-list -- the default fixture pins `sections` to blog and projects, which would drop a paginated section from every surface and make the assertions pass for the wrong reason; and `widgets` needs the widget module imports themselves, which are per-fixture rather than per-environment and must stay out of the default fixture, whose numeric roster and count expectations are locked and whose lookup path must not carry the widget templates and render hooks.

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
- a post whose **title carries an unbalanced `]`**, whose **description is a multi-line block scalar** with a list-marker continuation line, and whose front matter carries a **key with an embedded line break** (declared in the blog vocabulary too), plus a contact channel whose destination carries parentheses and a URL-only channel whose href carries a line break -- proving no value, key side included, can restructure the line-oriented documents or end its own link syntax early;
- surface `enable` keys set on the HOME page, where a page tier would do real damage, proving all of them are discarded with a warning.

**The default fixture ships no `layouts/robots.txt`, and a spec asserts that it does not.** If it ever acquired one, every robots assertion would pass for the wrong reason -- against the fixture's own file rather than against the module's generator.

## Specs

| File | Covers |
| --- | --- |
| `tests/00-data.spec.js` | The shipped data files: both TOMLs parse, the registry holds exactly 21 entries with no retired token, every license value ships inert, facts sections carry no `limit` key, and both i18n files carry the same ten keys. |
| `tests/01-robots.spec.js` | The generated `robots.txt`, the registry lookup and its warn-and-skip path, and the shadowing hazard proven against the shadow fixture. |
| `tests/02-twins.spec.js` | Markdown twins: fixed field order, strict YAML with duplicate-key detection, `jsonify` quoting on both sides of the mapping (a key carrying a line break is emitted as its JSON-quoted form), the `present` sentinel, `last_updated`, body source, home and section twins, section feed survival, the opt-outs, sitemap purity, and the license variants. |
| `tests/03-llms-facts.spec.js` | `llms.txt` and `about.md`, including the exact license line, both authored section shapes, the complete-by-construction bullet counts, the line-oriented structural integrity locks (a multi-line description stays one line, a bracketed title cannot break its link text, a parenthesized destination is percent-encoded, a URL-only contact channel with a line break stays one line), and the cross-surface invariant that the twin set equals the set `llms.txt` lists. |
| `tests/04-skills.spec.js` | The Agent Skills index: schema, published URLs, the SHA-256 digest verified against the bytes actually published, every omission path, and the default-language gate under two languages. |
| `tests/05-guards.spec.js` | The configuration guards and the cross-surface invariants they protect: twin links falling back to HTML URLs when twins are off, nothing pointing at `llms.txt` when it is off, a subpath `baseURL` surviving into every consumer-authored URL, the section-entry refusals, both halves of the `limit` contract, the twin's trailing pointer bytes, site-scoped keys set at the page tier, a license `url` with no `name`, an unrecognized `sitemap_section_target`, colliding permalinks, a non-map `agent:` value, a robots `Disallow` value carrying an embedded line break, and skill-name uniqueness. |
| `tests/06-pagination.spec.js` | What the enumerating surfaces publish for a paginated section: `llms.txt` and `about.md` list the section's five regular pages and no pager URL, every URL they advertise resolves to a published file, no Markdown twin is published for a pager shell, the section twin's `canonical` names the section rather than a pager, and the Agent Skills index names no pager URL. |
| `tests/07-section-roster.spec.js` | The section twins' member rosters: placement between body and pointer block, count and URL identity with the `llms.txt` listings, absolute twin URLs that resolve, exclusions honored, the hostile-value one-line locks, the paginated section's complete five-member roster, the `section_pages = false` byte-for-byte restoration against the `nosectionpages` build, non-section twins byte-identical across the two builds, and strict YAML front matter in both. |
| `tests/08-widget-twins.spec.js` | The widget-twin structural contract, against the widgets build: the demo page twin carries no `<svg` and no `class=` attribute naming any of the eight widget BEM blocks, each shortcode's network-free baseline line is present (the repo, profile, Space and arXiv citation links, the escaped-bracket titled watch link, the `> [!WARNING]` alert line with title and body, the image and gallery lines with their captions), and the twin still parses as strict-YAML front matter plus body with the surrounding prose intact. |
| `tests/09-public-partials.spec.js` | The two public partials, through the fixture-only `twindump` surface (`/twindump.txt` per language records every page's `twin-url.html` result plus the `surfaces.html` enumeration): across all eleven environment builds, the non-empty twin URLs equal exactly the published twin set and the surfaces set equals exactly the surfaces present in the tree, in both directions; home keeps its twin under the non-empty allow-list, `notwins` and `off` report all-empty, and the `llms.txt` Agent Skills auto-entry appears exactly once where the index publishes, never where it does not, with the edge build's consumer-authored duplicate suppressing the derived entry at the subpath-correct URL. |

Re-run the assertions alone against existing builds with:

```bash
FIXTURE_PUBLIC=fixture/public/baseline \
FIXTURE_PUBLIC_CONFIGURED=fixture/public/configured \
FIXTURE_PUBLIC_MINIMAL=fixture/public/minimal \
FIXTURE_PUBLIC_NOTWINS=fixture/public/notwins \
FIXTURE_PUBLIC_MULTILINGUAL=fixture/public/multilingual FIXTURE_PUBLIC_LLMSOFF=fixture/public/llmsoff FIXTURE_PUBLIC_EDGE=fixture/public/edge FIXTURE_PUBLIC_OFF=fixture/public/off FIXTURE_PUBLIC_BADTABLES=fixture/public/badtables \
FIXTURE_PUBLIC_NSOFF=fixture/public/nsoff \
FIXTURE_PUBLIC_NOSECTIONPAGES=fixture/public/nosectionpages \
FIXTURE_PUBLIC_SHADOW=fixture-shadow/public FIXTURE_PUBLIC_PAGINATED=fixture-paginated/public \
FIXTURE_PUBLIC_WIDGETS=fixture-widgets/public \
HUGO_BUILD_LOG=hugo-build.log \
HUGO_BUILD_LOG_CONFIGURED=hugo-build-configured.log \
HUGO_BUILD_LOG_MINIMAL=hugo-build-minimal.log \
HUGO_BUILD_LOG_NOTWINS=hugo-build-notwins.log \
HUGO_BUILD_LOG_MULTILINGUAL=hugo-build-multilingual.log HUGO_BUILD_LOG_LLMSOFF=hugo-build-llmsoff.log HUGO_BUILD_LOG_EDGE=hugo-build-edge.log HUGO_BUILD_LOG_OFF=hugo-build-off.log HUGO_BUILD_LOG_BADTABLES=hugo-build-badtables.log \
HUGO_BUILD_LOG_NSOFF=hugo-build-nsoff.log \
HUGO_BUILD_LOG_NOSECTIONPAGES=hugo-build-nosectionpages.log \
HUGO_BUILD_LOG_SHADOW=hugo-build-shadow.log HUGO_BUILD_LOG_PAGINATED=hugo-build-paginated.log \
HUGO_BUILD_LOG_WIDGETS=hugo-build-widgets.log \
npm test
```
