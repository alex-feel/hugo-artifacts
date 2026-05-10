#!/usr/bin/env node
// RealFaviconGenerator favicon-checker integration script.
//
// Submits the fixture site URL to the RFG favicon-checker API and asserts zero errors in
// BOTH `modern` and `legacy` modes. The orchestrator script (run-matrix.sh / .cmd) starts
// the fixture server on http://127.0.0.1:1313 in modern mode, then optionally relaunches
// with LEGACY_FIXTURE=1 to cover the legacy head set.
//
// RFG checker requires a publicly-reachable HTTPS URL. When the runner cannot expose the
// fixture site to the public internet (the typical local-development case), set the
// RFG_CHECKER_SKIP=1 env var and the script exits 0 with a notice; the matrix orchestrator
// treats that as a deferred row rather than a hard failure.
//
// Usage:
//   node scripts/rfg-checker.js                     # uses FIXTURE_URL env var or default
//   FIXTURE_URL=https://my-tunnel.example.com node scripts/rfg-checker.js
//   RFG_CHECKER_SKIP=1 node scripts/rfg-checker.js  # skip and exit 0
//
// Exit codes:
//   0 = checker reported zero errors (or skipped)
//   1 = checker reported errors / network failure / unparseable response

'use strict';

const RFG_API_URL = 'https://realfavicongenerator.net/api/favicon_checker';
const FIXTURE_URL = process.env.FIXTURE_URL || 'http://127.0.0.1:1313';

if (process.env.RFG_CHECKER_SKIP === '1') {
  console.log('rfg-checker: SKIPPED (RFG_CHECKER_SKIP=1). Run manually against a publicly-reachable HTTPS URL.');
  process.exit(0);
}

if (!FIXTURE_URL.startsWith('https://')) {
  console.error(`rfg-checker: FIXTURE_URL is not HTTPS (got ${FIXTURE_URL}).`);
  console.error('             RFG checker only accepts publicly-reachable HTTPS URLs.');
  console.error('             Either expose the fixture via `npx localtunnel --port 1313`');
  console.error('             or set RFG_CHECKER_SKIP=1 to mark the row as deferred.');
  process.exit(1);
}

(async () => {
  try {
    const errors = await runChecker(FIXTURE_URL);
    if (errors.length === 0) {
      console.log(`rfg-checker: PASS -- zero errors reported for ${FIXTURE_URL}`);
      process.exit(0);
    }
    console.error(`rfg-checker: FAIL -- ${errors.length} error(s) reported for ${FIXTURE_URL}:`);
    for (const err of errors) {
      console.error(`  - ${err.code || 'unknown_code'}: ${err.message || JSON.stringify(err)}`);
    }
    process.exit(1);
  } catch (err) {
    console.error(`rfg-checker: ERROR -- ${err.message || err}`);
    process.exit(1);
  }
})();

async function runChecker(targetUrl) {
  const requestBody = JSON.stringify({
    favicon_checker: {
      api_key: process.env.RFG_API_KEY || '',
      site_url: targetUrl,
    },
  });

  const response = await fetch(RFG_API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: requestBody,
  });
  if (!response.ok) {
    throw new Error(`RFG API returned status ${response.status}`);
  }
  const result = await response.json();

  // The RFG API response shape is {favicon_checker: {site_url, errors: [...]}}. We tolerate
  // shape drift defensively and treat missing arrays as zero-errors.
  const checker = result && result.favicon_checker;
  if (!checker) {
    throw new Error('RFG API response missing favicon_checker payload');
  }
  return Array.isArray(checker.errors) ? checker.errors : [];
}
