import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { refreshSnapshot } from '../scripts/refresh-upstream.mjs';
import { parseUpstreamConfig } from '../scripts/upstreams.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'flyver-upstream-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'git');
  const dest = join(dir, 'vendor');
  const docs = join(repo, 'skills', 'demo-example');
  mkdirSync(docs, { recursive: true });
  mkdirSync(dest);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'LICENSE'), 'Synthetic license fixture\n');
  writeFileSync(join(dest, 'LICENSE'), 'Synthetic license fixture\n');
  writeFileSync(join(dest, 'upstream.json'), JSON.stringify({ commit: '0'.repeat(40), skills: [] }));
  const writeSkill = (body, version = '1.0.0', name = 'demo-example') => {
    writeFileSync(join(docs, 'SKILL.md'), '---\nname: ' + name + '\ndescription: Demo example.\n' +
      (version === null ? '' : 'metadata:\n  version: "' + version + '"\n') + '---\n' + body + '\n');
  };
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const readLock = () => JSON.parse(readFileSync(join(dest, 'upstream.json'), 'utf8'));
  const config = parseUpstreamConfig('schemaVersion: 1\nsource:\n  repository: https://github.com/example-org/synthetic-upstream\n  branch: stable\n  license: MIT\nskills:\n  - demo-example\n');
  const refresh = (sha, policy = config) => refreshSnapshot(repo, sha, dest, policy);
  return { repo, dest, docs, writeSkill, commit, readLock, refresh, config };
}

test('refresh uses the pinned tree, tracks versions and reports changes without a version bump', (t) => {
  const f = fixture(t);
  f.writeSkill('First.');
  writeFileSync(join(f.docs, 'inert.sh'), 'exit 99\n', { mode: 0o755 });
  const first = f.commit();
  f.writeSkill('Second.');
  const second = f.commit();
  f.writeSkill('Uncommitted content.');
  let summary = f.refresh(first);
  assert.match(summary, /demo-example: nueva \(1\.0\.0\)/);
  const firstSkill = f.readLock().skills['demo-example'];
  assert.equal(firstSkill.commit, first);
  assert.equal(f.readLock().repository, f.config.repository);
  assert.equal(firstSkill.version, '1.0.0');
  assert.match(readFileSync(join(f.dest, 'skills/demo-example/SKILL.md'), 'utf8'), /First/);
  assert.equal(readFileSync(join(f.dest, 'skills/demo-example/inert.sh'), 'utf8'), 'exit 99\n');
  summary = f.refresh(second);
  assert.match(summary, /contenido cambió sin cambiar la versión declarada/);
  assert.notEqual(firstSkill.sha256['SKILL.md'], f.readLock().skills['demo-example'].sha256['SKILL.md']);
  f.writeSkill('Now without a version.', null);
  const third = f.commit();
  assert.match(f.refresh(third), /1\.0\.0 → sin versión declarada/);
  assert.equal(f.readLock().skills['demo-example'].version, null);
});

test('invalid reference, mutable refs and changed license leave the prior snapshot intact', (t) => {
  const f = fixture(t);
  f.writeSkill('Valid.');
  const first = f.commit();
  f.refresh(first);
  const lock = f.readLock();
  assert.throws(() => f.refresh('HEAD'), /SHA de commit completo/);
  f.writeSkill('[Not a skill-local URL](../../not-a-guide.md)');
  const second = f.commit();
  assert.throws(() => f.refresh(second), /Referencia local inválida/);
  assert.deepEqual(f.readLock(), lock);
  writeFileSync(join(f.repo, 'LICENSE'), 'Different license.');
  f.writeSkill('Valid again.');
  const third = f.commit();
  assert.throws(() => f.refresh(third), /revisión manual/);
  assert.deepEqual(f.readLock(), lock);
});

test('an unapproved addition is reported, not imported or used to bump the lock', (t) => {
  const f = fixture(t);
  f.writeSkill('Approved bytes.');
  f.refresh(f.commit());
  const initial = f.readLock();
  const pending = join(f.repo, 'skills', 'suggested-only');
  mkdirSync(pending);
  // This bypasses policy only if a refresh processes the unapproved files.
  writeFileSync(join(pending, 'SKILL.md'), Buffer.from([0, 255]));
  const next = f.commit();
  const summary = f.refresh(next);
  assert.match(summary, /demo-example: sin cambios/);
  assert.match(summary, /No aprobadas en YAML; no importadas: suggested-only/);
  assert.match(summary, /no se abre PR/);
  assert.match(summary, new RegExp(next));
  assert.deepEqual(f.readLock(), initial);
  assert.equal(existsSync(join(f.dest, 'skills', 'suggested-only')), false);
});

test('an approved package absent or broken in the upstream commit halts without writing', (t) => {
  const f = fixture(t);
  f.writeSkill('Valid.');
  const initial = f.commit();
  f.refresh(initial);
  const lock = f.readLock();
  const absent = { ...f.config, skills: [...f.config.skills, 'missing-approved'] };
  assert.throws(() => f.refresh(initial, absent), /aprobadas ausentes.*missing-approved/);
  rmSync(join(f.docs, 'SKILL.md'));
  writeFileSync(join(f.docs, 'README.md'), 'Missing the executable contract.');
  assert.throws(() => f.refresh(f.commit()), /Falta SKILL.md.*demo-example/);
  assert.deepEqual(f.readLock(), lock);
});

test('the YAML policy fails closed on unsafe source, refs, unknown keys or duplicate skills', () => {
  const config = 'schemaVersion: 1\nsource:\n  repository: https://github.com/example-org/skills\n  branch: release/approved\n  license: MIT\nskills:\n  - demo-example\n';
  assert.deepEqual(parseUpstreamConfig(config), {
    repository: 'https://github.com/example-org/skills', branch: 'release/approved', license: 'MIT', skills: ['demo-example'],
  });
  for (const broken of [
    config.replace('github.com', 'github.com.invalid'),
    config.replace('https://', 'https://some-token@'),
    config.replace('release/approved', 'refs/../escape'),
    config.replace('release/approved', '--config'),
    config.replace('license: MIT', 'license: BSD-3-Clause'),
    config.replace('license: MIT', 'license: MIT\n  extra: unsupported'),
    config + '  - demo-example\n',
    config.replace('  - demo-example', '  - ../../outside'),
    config.replace('  - demo-example', '  - *some-alias'),
  ]) assert.throws(() => parseUpstreamConfig(broken), /upstreams.yaml/);
});
