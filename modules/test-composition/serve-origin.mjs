/* global process, URL, setTimeout, fetch */
// A static origin over fixture-origin/, started by the runners before the
// builds that need it and stopped afterwards.
//
//   node serve-origin.mjs serve [port]   listen until stopped
//   node serve-origin.mjs wait  [port]   block until it answers, or fail
//   node serve-origin.mjs stop           stop the process named in origin.pid
//
// WHY THIS SUITE NEEDS A SERVER AT ALL. The agent-readiness module republishes
// each configured agent skill as an artifact of its own, and every skill entry
// names a REMOTE source the module fetches at build time -- there is no local
// form of that configuration. Those artifacts are the only URLs in this
// repository that a module answers for through a url-retirement writes hook
// rather than registering, so a build without them proves the hook file exists
// and nothing about what it answers. Serving the bytes ourselves keeps the
// suite off anybody else's origin: the corpus is committed beside this file, no
// endpoint outside this checkout can turn a pull request red, and the artifact
// the specs read is one this repository wrote.
//
// The port is fixed because a Hugo configuration file cannot learn one at run
// time and the fixture's `source` URLs have to name it. It sits BELOW the
// ephemeral range an operating system draws outbound source ports from
// (49152-65535 on Windows), beside the ports the sibling suites use: a fixed
// port inside that range is a suite that fails when an unrelated outbound
// connection happens to hold it, and on Windows that failure arrives as EACCES
// rather than EADDRINUSE, which reads like a permissions problem instead.
import {createServer} from 'node:http';
import {existsSync, readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {dirname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(join(here, 'fixture-origin'));
const PID_FILE = join(here, 'origin.pid');

export const DEFAULT_PORT = 1919;

// A backstop against a leaked process: even if a runner dies between `serve`
// and `stop` -- cmd has no trap, so an early exit can do exactly that -- the
// origin gives up on its own rather than holding the port until the machine is
// rebooted. Far longer than the whole suite and far shorter than a working day.
const MAX_LIFETIME_MS = 15 * 60 * 1000;

const serve = (port) => {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://origin').pathname);
    if (path === '/ready') {
      response.writeHead(200).end('ready');
      return;
    }
    // Resolved against the corpus root and checked to still be inside it, so a
    // traversing path answers 403 instead of reading the checkout.
    const target = resolve(join(root, normalize(path)));
    if (!target.startsWith(root)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (!existsSync(target)) {
      response.writeHead(404).end('not found');
      return;
    }
    // The discovery convention the module implements requires text/markdown for
    // a SKILL.md, and the module's own security.http.mediaTypes documentation
    // rests on the server sending it.
    response.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8'});
    response.end(readFileSync(target));
  });
  server.on('error', (error) => {
    process.stderr.write(`origin failed to listen on ${port}: ${error.message}\n`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    writeFileSync(PID_FILE, String(process.pid), 'utf8');
    process.stdout.write(`origin listening on http://127.0.0.1:${port}/\n`);
  });
  const bail = setTimeout(() => {
    process.stderr.write('origin lifetime exceeded; exiting\n');
    process.exit(1);
  }, MAX_LIFETIME_MS);
  bail.unref();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
};

const wait = async (port) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const answer = await fetch(`http://127.0.0.1:${port}/ready`);
      if (answer.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  process.stderr.write(`origin did not answer on 127.0.0.1:${port} within 15s\n`);
  process.exit(1);
};

const stop = () => {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  try {
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch {
    // Already gone, which is the state this command exists to reach.
  }
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Nothing to remove.
  }
};

const [command, portArg] = process.argv.slice(2);
const port = Number(portArg ?? DEFAULT_PORT);

if (command === 'serve') serve(port);
else if (command === 'wait') await wait(port);
else if (command === 'stop') stop();
else {
  process.stderr.write('usage: serve-origin.mjs serve|wait|stop [port]\n');
  process.exit(2);
}
