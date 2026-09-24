#!/usr/bin/env node
// One command for the whole local stack: `pnpm dev` (from the repo root).
//
//   1. Redis      - started on :6379 if nothing is listening there yet (data in ./.redis)
//   2. Database   - `prisma migrate deploy` + `prisma generate` against apps/api/.env
//   3. Packages   - builds @kardux/contracts, @kardux/content, @kardux/engine once
//   4. Watchers   - packages (tsc --watch), API (nest --watch :3000), web (vite :5173)
//
// Ctrl+C stops everything this script started (including Redis, if it started it).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
const isWindows = process.platform === 'win32';

const color = (code, text) => `\u001b[${code}m${text}\u001b[0m`;
const log = (text) => console.warn(color('33', '[kardux]'), text);

function isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });
}

/** Windows needs a shell to resolve `pnpm.cmd`; passing one quoted command line (instead of
 *  an args array) avoids Node's DEP0190 warning about unescaped shell arguments. */
function commandLine(command, args) {
    const quoted = args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg));
    return [command, ...quoted].join(' ');
}

function run(command, args, cwd = root) {
    const result = isWindows
        ? spawnSync(commandLine(command, args), { cwd, stdio: 'inherit', shell: true })
        : spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
        log(color('31', `"${command} ${args.join(' ')}" failed.`));
        process.exit(result.status ?? 1);
    }
}

function start(name, command, args, options = {}) {
    const spawnOptions = { cwd: root, stdio: options.silent ? 'ignore' : 'inherit', ...options };
    const child = isWindows
        ? spawn(commandLine(command, args), { ...spawnOptions, shell: true })
        : spawn(command, args, spawnOptions);
    child.on('exit', (code) => {
        if (!shuttingDown && options.critical) {
            log(color('31', `${name} exited (${code}). Stopping.`));
            shutdown(code ?? 1);
        }
    });
    children.push(child);
    return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Stopping...');
    for (const child of children) {
        if (child.exitCode !== null) continue;
        if (isWindows) {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            child.kill('SIGTERM');
        }
    }
    process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 1. Redis
if (await isPortOpen(6379)) {
    log('Redis already running on :6379.');
} else {
    const dataDir = join(root, '.redis');
    mkdirSync(dataDir, { recursive: true });
    log('Starting Redis on :6379 ...');
    start(
        'redis',
        'redis-server',
        ['--port', '6379', '--bind', '127.0.0.1', '--dir', dataDir, '--appendonly', 'yes'],
        {
            silent: true,
        },
    );
    for (let i = 0; i < 20 && !(await isPortOpen(6379)); i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    log(
        (await isPortOpen(6379))
            ? color('32', 'Redis ready.')
            : color(
                  '31',
                  'Redis did not start (is redis-server installed?). Continuing memory-only.',
              ),
    );
}

// 2. Database
if (!(await isPortOpen(5432))) {
    log(color('31', 'PostgreSQL is not listening on :5432 - start it first.'));
    process.exit(1);
}
log('Applying database migrations ...');
run('pnpm', ['--filter', '@kardux/api', 'exec', 'prisma', 'migrate', 'deploy']);
run('pnpm', ['--filter', '@kardux/api', 'exec', 'prisma', 'generate']);

// 3. Shared packages
log('Building shared packages ...');
run('pnpm', ['--filter', './packages/*', 'build']);

// 4. Watchers
log(color('32', 'Starting API (http://localhost:3000) and web (http://localhost:5173) ...'));
start(
    'dev',
    'pnpm',
    [
        '--parallel',
        '--filter',
        './packages/*',
        '--filter',
        '@kardux/api',
        '--filter',
        '@kardux/web',
        'run',
        'dev',
    ],
    { critical: true },
);
