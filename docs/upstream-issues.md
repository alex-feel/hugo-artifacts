# Upstream issues

This file indexes every third-party limitation this repository works around, defers around, or compensates for. Each entry says why the problem matters here, what the repository carries because of it and exactly where that lives, the filed issue and its status, and the precise upstream change that lets the compensation be deleted.

It is an INDEX, not an archive. The full text of a filed report lives in the upstream issue; reproducing it here would give a reader two copies to keep in sync and no way to tell which one is current.

## How to work with this mechanism

Add the entry in the SAME change as the compensation. A compensation with no entry is a cleanup nobody will remember, and reconstructing the reasoning months later gets it wrong.

Re-check every Open entry whenever this repository's Hugo pin moves, which is the `hugo-version` inputs in `.github/workflows/ci.yml` (`0.164.0` by default, with floor rows at `0.160.0` and one row at `0.161.1`). A version bump is the moment to see whether a fix shipped; fixed-but-unreleased means keep waiting. Stamp what the re-check found into the entry with its date, because an entry whose claims carry no dates cannot be told apart from one nobody has looked at.

When upstream fixes an entry, do its **Remove when** action in full -- the code, the configuration, the documentation mentions and the tests -- then move the entry to `Resolved` with the fixing version. Re-verify against the real fix before deleting anything: a fix that changed shape in review can leave a gap the compensation was covering.

## Status

| Upstream problem | Component | Issue | Status |
| --- | --- | --- | --- |
| A store map enumerated with `GetSortedMapValues` is read outside the store lock, so a page writing that map concurrently aborts the build | Hugo -- `common/hstore`, the `Scratch` type behind every `Store` | [gohugoio/hugo#15237](https://github.com/gohugoio/hugo/issues/15237) | Open -- filed 2026-08-22 |

## Hugo

### `GetSortedMapValues` reads the map after releasing the read lock ([gohugoio/hugo#15237](https://github.com/gohugoio/hugo/issues/15237))

**Why:** `Scratch.GetSortedMapValues` in `common/hstore/scratch.go` takes the read lock, copies out the map header, releases the lock at line 141, and only then ranges the map at line 143 and indexes it at line 151. `SetInMap` writes into that same map under the write lock, and a mutex protects a map only while both sides hold it, so the accessor races a concurrent write exactly as an `index` or `range` on a map pulled out with `Get` does -- and the Go runtime aborts the process rather than tolerating it. Established by reading the source and by a standalone Go test that uses only the exported store API and fails on every run, landing at both unlocked accesses. Verified 2026-08-22: the file is byte-identical at `v0.164.0`, at `v0.165.0` (the latest release) and on `master`, so this is live rather than fixed-after-our-pin. It reaches templates because `hugo.Store`, `site.Store`, `PAGE.Store` and `SHORTCODE.Store` all return this type and Hugo renders pages concurrently; it matters here because `modules/url-retirement` collects registrations into store maps across pages and enumerates them when it renders its documents.

**Workaround:** `scripts/check-store-map-reads.sh` flags every `GetSortedMapValues` call and accepts one only where an adjacent Go-template comment carries `no-concurrent-writer:` followed by the reason no write to that key can be in flight there; the script also carries the known-answer self-test that proves that rule still works. Five calls carry such a marker: `modules/url-retirement/layouts/_partials/url-retirement/manifest/lines.html`, `manifest/redundant-extra.html`, `redirects/lines.html`, and two in `redirects/pagers.html`. The store paragraph in `CLAUDE.md` and the `WHICH PASS DECIDES` paragraph in `manifest/redundant-extra.html` both state the constraint in prose. No template was rewritten to avoid the accessor: no concurrent writer to those keys was found, so the compensation is the discipline that keeps it that way rather than a change in behavior.

**Remove when:** upstream holds the lock across the whole of `GetSortedMapValues` (or copies the map under it) AND this repository's Hugo pin has moved to a release carrying that fix, with the floor rows in `.github/workflows/ci.yml` moved too -- a floor row still running an older Hugo keeps the hazard live for that build. Re-verify first by rebuilding the Go reproduction from the upstream issue against the new version and watching it pass; a changelog line is evidence a fix shipped, not evidence this one did. Then delete, in one change: the `GetSortedMapValues` arm of `scripts/check-store-map-reads.sh` together with the five self-test cases that exercise it (`unmarked`, `marked-in-block`, `marker-as-output`, `marker-without-reason`, `marker-not-reused`), the five `no-concurrent-writer:` comments, the sentences about the accessor in `CLAUDE.md`, and the corresponding clause in `redundant-extra.html`. Everything the check says about `Get` STAYS: `Get` returns the live map whatever upstream does to the accessor, so its rules, its self-test cases and its prose remain correct.

**Investigated and deliberately not filed:** `Scratch.Add` in the same file performs a check-then-set that is not atomic -- it reads the existing value under the read lock, releases it, computes, and writes under the write lock -- so two concurrent `Add` calls on one key can lose an update. It was kept out of the filed report to leave that report to one defect with one reproduction, and nothing here depends on `Add`; this repository already prefers `SetInMap` for the collection case and says why in `lib/record-url.html`. File it separately if a module ever needs `Add` under concurrent rendering.

## Resolved

Nothing has been retired yet.
