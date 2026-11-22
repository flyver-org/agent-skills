import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { addVendored, vendorBase } from './skills.mjs';
import { readUpstreamConfig } from './upstreams.mjs';
import { refreshSnapshot } from './refresh-upstream.mjs';

const sha = /^[a-f0-9]{40}$/;
const git = (...args) => execFileSync('git', args, {
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  timeout: 45_000,
  maxBuffer: 1_000_000,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sourceUrl = (source) => source.repository + '.git';

const gitRemote = {
  head(source) {
    const ref = 'refs/heads/' + source.branch;
    const [tip, received] = git('ls-remote', '--exit-code', sourceUrl(source), ref).trim().split('\t');
    if (received !== ref || !sha.test(tip)) throw new Error('La rama no devolvió un SHA válido.');
    return tip;
  },
  withRepository(source, callback) {
    const temp = mkdtempSync(join(tmpdir(), 'flyver-upstream-review-'));
    try {
      const path = join(temp, 'git');
      git('-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
        'clone', '--no-checkout', '--single-branch', '--depth=1', '--branch',
        source.branch, sourceUrl(source), path);
      return callback(path);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  },
};

export function reviewSources(config, { vendors = vendorBase, remote = gitRemote } = {}) {
  const sections = [];
  const failed = [];
  for (const source of config.sources) {
    try {
      const target = join(vendors, source.id);
      const installed = new Map();
      try {
        addVendored(installed, target, source);
      } catch (err) {
        throw new Error('Snapshot aprobado no válido. Revísalo o importa el pin manualmente. ' + err.message);
      }
      const pinned = JSON.parse(readFileSync(join(target, 'upstream.json'), 'utf8')).commit;
      const observed = remote.head(source);
      if (!sha.test(observed)) throw new Error('El upstream no devolvió un SHA válido.');
      if (pinned === observed) {
        const rows = [...installed.values()].map((skill) => '- ' + skill.name + ' @ ' +
          (skill.version ?? 'sin versión declarada') + ': hashes verificados');
        sections.push(['## Fuente: ' + source.id, '', 'Ya fijada a ' + pinned + '.', '', ...rows].join('\n'));
      } else {
        sections.push(remote.withRepository(source,
          (repo) => refreshSnapshot(repo, observed, target, source)));
      }
    } catch (err) {
      failed.push(source.id);
      const detail = String(err.message).split('\n')[0].replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 450);
      sections.push('## Fuente: ' + source.id + '\n\nBloqueada: ' + detail);
    }
  }
  if (failed.length) {
    sections.push('No se publicará un candidato parcial. Fuentes bloqueadas: ' + failed.join(', ') + '.');
  }
  return { summary: sections.join('\n\n'), failed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 2) throw new Error('Uso: node scripts/review-upstreams.mjs');
    const result = reviewSources(readUpstreamConfig());
    console.log(result.summary);
    if (result.failed.length) process.exitCode = 1;
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
