/* global process, URL, setTimeout, fetch */
// The fixture ORIGIN: a static HTTP server over test/fixture-origin/, started
// by the runners for the duration of the Hugo builds and stopped afterwards.
//
// WHY A SERVER AT ALL. The Agent Skills index exists to publish artifacts
// fetched from somewhere else, and its digest guarantee -- the advertised hash
// is computed from the bytes this site republishes -- cannot be proven without
// a real build-time fetch. `resources.GetRemote` speaks HTTP and nothing else,
// so something has to answer.
//
// WHY OURS AND NOT THE INTERNET. The suite blocks every pull request in this
// repository, so an endpoint somebody else controls is an endpoint that can
// turn a pull request red for reasons that have nothing to do with the change.
// Serving the bytes ourselves also buys three things no public URL can:
//
//   1. The RESPONSE HEADERS are ours. The archive routes answer with exactly
//      the `application/gzip` and `application/zip` the discovery convention
//      requires of a server, which is what makes the fixture a proof that the
//      `[security.http] mediaTypes` block the README tells consumers to write
//      is the correct one -- a host sending `application/octet-stream` would
//      quietly prove something weaker.
//   2. The PATHOLOGICAL cases exist. A `.tar.gz` served with
//      `Content-Encoding: gzip`, which arrives transparently decompressed and
//      breaks the digest for every client, and a sibling probe answered with
//      a 500, which must read as "cannot tell" rather than as "absent", exist
//      nowhere public and can only be staged.
//   3. Builds are deterministic and offline.
//   4. Every request is RECORDED, which is the only way to assert what the
//      module did NOT ask for. A guard that refuses to probe a candidate, and
//      a budget that stops after four, both leave their evidence in requests
//      that were never issued -- and a published tree is silent about those.
//      See REQUEST_LOG below.
//
// Three subcommands, so both runners drive it identically:
//   node serve-origin.mjs serve [port]   start (backgrounded by the caller)
//   node serve-origin.mjs wait  [port]   block until it answers, or fail
//   node serve-origin.mjs stop           stop the process named in origin.pid
import {createServer} from 'node:http';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {existsSync, readFileSync, appendFileSync} from 'node:fs';
import {join, resolve, normalize, extname} from 'node:path';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, 'fixture-origin');
const PID_FILE = resolve(here, 'origin.pid');

// One line per request, `<method> <path>`, for the whole run. The path is
// FIXED here rather than passed in by a runner, because both runners invoke
// this same file and a second place to keep in step is a second place to
// forget; `tests/helpers.js` resolves it from the module root for the same
// reason. It is gitignored by the repository's `*.log` class.
//
// The file records every build, not one, so the assertions built on it read
// the SET of paths ever requested rather than a count per build. That is
// deliberate: request counts per build were measured non-deterministic (one
// route varied between 6 and 13 requests across runs), while "this path was
// never requested by any build" is stable and is exactly what a refusal to
// probe and an exhausted budget both claim.
//
// Written synchronously, so a request is on disk before its response is, and
// the log is complete the moment the last build exits.
const REQUEST_LOG = resolve(here, 'fixture-origin-requests.log');

// The port is fixed because a Hugo configuration file cannot learn one at run
// time, and the fixture's `source` URLs have to name it. 51313 is Hugo's own
// 1313 offset out of the range anything else on a developer machine or a CI
// runner is likely to hold.
export const DEFAULT_PORT = 51313;

// A backstop against a leaked process: even if a runner dies between `serve`
// and `stop`, the origin gives up on its own rather than holding the port
// until the machine is rebooted. Fifteen minutes is far longer than the whole
// suite and far shorter than a working day.
const MAX_LIFETIME_MS = 15 * 60 * 1000;

const TYPES = {
  '.md': 'text/markdown; charset=utf-8',
  '.gz': 'application/gzip',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(path) {
  if (path.endsWith('.tar.gz')) return TYPES['.gz'];
  return TYPES[extname(path)] ?? 'application/octet-stream';
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = decodeURIComponent(url.pathname);

  // Recorded before anything is decided about it, so a route that rewrites
  // the path (/encoded/, /weird/) or refuses it still leaves the request the
  // client actually made.
  appendFileSync(REQUEST_LOG, `${req.method} ${path}\n`, 'utf8');

  if (path === '/ready') {
    res.writeHead(200, {'content-type': 'text/plain'});
    res.end('ready');
    return;
  }

  // A sibling probe that the origin answers with an error rather than with the
  // file or a 404. The module must read this as "cannot tell", never as
  // "absent" -- a rate-limited origin would otherwise report every multi-file
  // skill as single-file.
  if (path.endsWith('/SERVERERROR.md')) {
    res.writeHead(500, {'content-type': 'text/plain'});
    res.end('deliberate');
    return;
  }

  // A media type Hugo can resolve from neither the URL extension nor the
  // header, which is the only way to reach the fetch-error branch and the
  // remediation hint it prints. Both are otherwise dead code under test: every
  // other failure in this suite is an absent resource, not an error.
  //
  // The path under /weird/ is ignored and one body is always returned,
  // because the URL must carry NO extension Hugo recognizes: a .md suffix
  // resolves the media type on its own and the header never gets a say.
  const unresolvable = path.startsWith('/weird/');

  // The transport-decompression trap: the bytes are a valid .tar.gz, but the
  // response claims them as gzip CONTENT-ENCODING, so any conforming client --
  // Hugo included -- hands the caller a bare tar. Publishing that under a
  // .tar.gz name would break every digest check downstream.
  const encoded = path.startsWith('/encoded/');
  const relative = normalize(encoded ? path.slice('/encoded'.length) : path).replace(
    /^([/\\])+/,
    '',
  );
  const file = join(ROOT, relative);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, {'content-type': 'text/plain'});
    res.end('outside the origin root');
    return;
  }

  let body;
  try {
    body = await readFile(unresolvable ? join(ROOT, 'fixture-single', 'SKILL.md') : file);
  } catch {
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('not found');
    return;
  }

  const headers = {'content-type': contentType(file), 'content-length': String(body.length)};
  if (unresolvable) headers['content-type'] = 'application/vnd.acme.weird';
  if (encoded) headers['content-encoding'] = 'gzip';
  res.writeHead(200, headers);
  res.end(body);
}

async function serve(port) {
  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  server.on('error', (err) => {
    process.stderr.write(`origin failed to listen on ${port}: ${err.message}\n`);
    process.exit(1);
  });
  // Truncated BEFORE the socket opens, so the log holds this run's requests
  // and only this run's, and no request can be recorded and then discarded.
  // Both runners stop a previous origin before starting their own, so there is
  // exactly one writer.
  await writeFile(REQUEST_LOG, '', 'utf8');
  await new Promise((done) => server.listen(port, '127.0.0.1', done));
  await writeFile(PID_FILE, String(process.pid), 'utf8');
  process.stdout.write(`origin listening on http://127.0.0.1:${port}/\n`);
  const bail = setTimeout(() => {
    process.stderr.write('origin lifetime exceeded; exiting\n');
    process.exit(1);
  }, MAX_LIFETIME_MS);
  bail.unref();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

async function wait(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  process.stderr.write(`origin did not answer on 127.0.0.1:${port} within 15s\n`);
  process.exit(1);
}

async function stop() {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  try {
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch {
    // Already gone, which is the state this command exists to reach.
  }
  await unlink(PID_FILE).catch(() => {});
}

const [command, portArg] = process.argv.slice(2);
const port = Number(portArg ?? DEFAULT_PORT);

if (command === 'serve') await serve(port);
else if (command === 'wait') await wait(port);
else if (command === 'stop') await stop();
else {
  process.stderr.write('usage: serve-origin.mjs serve|wait|stop [port]\n');
  process.exit(2);
}
