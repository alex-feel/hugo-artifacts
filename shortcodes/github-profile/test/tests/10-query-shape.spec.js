/* global Buffer */
// The GraphQL request the module builds, asserted from a build that actually
// produced it.
//
// This suite is offline: the fixture shadows fetch.html, and fetch.html is
// build-query.html's only caller, so until this spec existed the query text
// was the one part of the module that no build in this repository ever
// rendered. Every other assertion here reads canned data that a person
// maintains by hand, which means a query that stopped asking for the right
// thing would leave the entire suite green.
//
// What that costs became concrete with the language scopes. The language
// counts must come from a connection narrowed to COMMIT and PULL_REQUEST,
// because the wider one enrolls a repository on a single filed ISSUE and
// contributes the whole repository's byte count -- 22 MB of someone else's Go
// attributed to a person who has never written a line of it. That narrowing
// lives entirely in the query, and the canned fixture data merely mirrors it.
// If the two ever disagree, the fixture is the one lying.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILDS, page} from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const QUERY_PAGE = 'query-shape/index.html';

const fixture = JSON.parse(
  readFileSync(join(here, '..', 'fixture', 'data', 'github-profile-fetch.json'), 'utf8'),
);

// The published attribute, decoded. Base64 because the value is JSON: nothing
// between the partial's return and this string can have escaped, minified or
// re-quoted it.
function published(dir, name) {
  const html = page(dir, QUERY_PAGE);
  const match = new RegExp(`${name}="?([A-Za-z0-9+/=]+)"?`).exec(html);
  assert.ok(match, `the query-shape page must publish ${name}`);
  return Buffer.from(match[1], 'base64').toString('utf8');
}

// The balanced-brace block that follows `head` in the query text. Written as a
// scanner rather than a pattern because the thing under test is what a block
// does NOT contain, and a non-greedy pattern would stop at the first inner
// brace and report any block as clean.
//
// The head must include the field's closing parenthesis. A head cut short of
// it lands the search on the first brace of an ARGUMENT object -- Hugo's
// repositories connection takes orderBy: {field: STARGAZERS, ...} -- and that
// object contains no `languages(` either, so the assertion passes for the
// wrong reason. That is not hypothetical: it is what the first run of this
// spec did.
function blockAfter(query, head) {
  assert.ok(head.endsWith(')'), `blockAfter needs the whole field call, ending at ')': ${head}`);
  const at = query.indexOf(head);
  assert.ok(at !== -1, `the query must contain ${head}`);
  const open = query.indexOf('{', at + head.length);
  assert.ok(open !== -1, `${head} must be followed by a selection set`);
  let depth = 0;
  for (let i = open; i < query.length; i += 1) {
    if (query[i] === '{') depth += 1;
    else if (query[i] === '}') {
      depth -= 1;
      if (depth === 0) return query.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced selection set after ${head}`);
}

const WORKED_IN =
  'repositoriesContributedTo(first: 100, includeUserRepositories: false, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW])';
const CODE_ONLY =
  'codeContributedTo: repositoriesContributedTo(first: 100, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST])';
const OWNED =
  'repositories(first: 100, ownerAffiliations: [OWNER], isFork: false, orderBy: {field: STARGAZERS, direction: DESC})';

for (const build of BUILDS) {
  test(`[${build.name}] the snapshot request is valid JSON carrying the login as a variable`, () => {
    // jsonify does the escaping, and the login travels as a GraphQL variable
    // rather than being interpolated into the query text. Both are the
    // module's stated contract and neither had a check.
    const body = JSON.parse(published(build.dir, 'data-snapshot-query'));
    assert.equal(typeof body.query, 'string');
    assert.deepEqual(body.variables, {login: 'fixture-dev'});
    assert.match(body.query, /^query\(\$login: String!\)/);
    assert.ok(
      !body.query.includes('fixture-dev'),
      'the login must reach the API as a variable, never spliced into the query text',
    );
  });

  test(`[${build.name}] language counts come only from repositories with code contributions`, () => {
    const {query} = JSON.parse(published(build.dir, 'data-snapshot-query'));

    // Two connections over the same field, asking different questions.
    assert.equal(
      (query.match(/repositoriesContributedTo\(/g) ?? []).length,
      2,
      'one connection answers "worked in" and one answers "wrote code in"',
    );
    assert.ok(
      query.includes(WORKED_IN),
      'the worked-in connection keeps all four contribution types',
    );
    assert.ok(query.includes(CODE_ONLY), 'the code connection narrows to COMMIT and PULL_REQUEST');

    // The point of the split: the connection that admits an issue-only
    // repository must not be the one carrying language byte counts.
    const workedIn = blockAfter(query, WORKED_IN);
    assert.ok(
      !workedIn.includes('languages('),
      'the connection that an ISSUE alone can enter must not request language counts',
    );
    const codeOnly = blockAfter(query, CODE_ONLY);
    assert.ok(codeOnly.includes('languages('), 'the code connection must request them instead');

    // And the owned repositories, which are the default scope's whole source.
    // OWNED carries isFork: false in its arguments, so matching it is also
    // what keeps forks out of the set the row calls "owned".
    assert.ok(query.includes(OWNED), 'owned non-fork repositories must be requested as such');
    const owned = blockAfter(query, OWNED);
    assert.ok(owned.includes('languages('), 'owned repositories carry the default row');
  });

  test(`[${build.name}] the snapshot carries both halves of the authorship ratio's wiring`, () => {
    const {query} = JSON.parse(published(build.dir, 'data-snapshot-query'));

    // The global node ID is what the authorship query's author filter takes
    // (CommitAuthor has an id and emails, no login), so the snapshot must
    // fetch it or the follow-up request can never be built.
    const core = blockAfter(query, 'core: user(login: $login)');
    assert.match(core, /\bid\b/, 'the core user block must request the global node id');

    // The denominator rides in the snapshot: each code-contributed node's
    // default branch reports its total commit count under the `all` alias.
    const codeOnly = blockAfter(query, CODE_ONLY);
    assert.ok(
      codeOnly.includes(
        'defaultBranchRef { target { ... on Commit { all: history(first: 1) { totalCount } } } }',
      ),
      'the code connection must request each default branch total commit count',
    );
  });

  test(`[${build.name}] the authorship request names repositories safely and the person by node id`, () => {
    const body = JSON.parse(published(build.dir, 'data-authorship-query'));
    assert.deepEqual(body.variables, {uid: 'MDQ6VXNlcjQyNDI='});
    assert.match(body.query, /^query\(\$uid: ID!\)/);

    // One aliased block per repository, numbered by the caller's slice.
    assert.ok(
      body.query.includes('r0: repository(owner: "mega-org", name: "monolith")'),
      'the first repository keeps alias r0',
    );
    const r0 = blockAfter(body.query, 'r0: repository(owner: "mega-org", name: "monolith")');
    assert.ok(
      r0.includes('mine: history(first: 1, author: {id: $uid}) { totalCount }'),
      'each block asks for the person own default-branch commit count',
    );

    // The layout feeds one deliberately invalid nameWithOwner in position 1.
    // It must be dropped -- its owner fails the login shape and its name
    // carries a quote, and both are remote-derived text headed into the
    // query string -- while the entry AFTER it keeps its original alias, so
    // the caller's index-based decode survives the skip.
    assert.ok(!body.query.includes('r1:'), 'the invalid entry must be dropped');
    assert.ok(!body.query.includes('bad owner'), 'and none of its text may reach the query');
    assert.ok(
      body.query.includes('r2: repository(owner: "fixture-labs", name: "toolkit")'),
      'the entry after the skip keeps its position-based alias',
    );
  });

  test(`[${build.name}] the canned fixture data mirrors the request`, () => {
    // The seam serves a hand-maintained response. When the query gains or
    // loses a block the response has to follow, and nothing else notices:
    // derive.html reads a missing block as empty and renders a smaller row
    // rather than failing.
    const {query} = JSON.parse(published(build.dir, 'data-snapshot-query'));
    for (const field of ['repositories', 'repositoriesContributedTo', 'codeContributedTo']) {
      assert.ok(query.includes(field), `the query must still request ${field}`);
      assert.ok(fixture.user[field], `the canned response must still carry ${field}`);
    }
    assert.ok(
      !fixture.user.repositoriesContributedTo.nodes.some((n) => n.languages),
      'the canned worked-in nodes must carry no language counts, because the query no longer asks for them',
    );
    assert.ok(
      fixture.user.codeContributedTo.nodes.every((n) => n.languages),
      'and every canned code node must carry them, because it does',
    );
    assert.equal(typeof fixture.user.id, 'string', 'the canned user must carry the node id');
    assert.ok(fixture.user.id.length > 0, 'and it must be non-empty');
    assert.ok(
      fixture.user.codeContributedTo.nodes.every((n) => Object.hasOwn(n, 'defaultBranchRef')),
      'every canned code node must carry the defaultBranchRef key (null included: an empty repository has no branch)',
    );
    assert.ok(fixture.authorship, 'and the canned response must carry the authorship map');
  });

  test(`[${build.name}] the years request emits one bounded block per year`, () => {
    // The other kind, executed here for the first time. Each block must stay
    // inside the API's one-year span limit, which is the reason the module
    // splits them at all.
    const body = JSON.parse(published(build.dir, 'data-years-query'));
    assert.deepEqual(body.variables, {login: 'fixture-dev'});
    for (const year of [2019, 2020, 2021]) {
      assert.ok(
        body.query.includes(
          `y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z")`,
        ),
        `the request must carry a block for ${year} spanning exactly that calendar year`,
      );
    }
    assert.equal((body.query.match(/contributionsCollection\(/g) ?? []).length, 3);
  });
}
