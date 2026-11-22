import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { refreshSnapshot } from '../scripts/refresh-upstream.mjs';

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
  return { repo, dest, docs, writeSkill, commit, readLock };
}

test('refresh uses the pinned tree, tracks versions and reports changes without a version bump', (t) => {
  const f = fixture(t);
  f.writeSkill('First.');
  writeFileSync(join(f.docs, 'inert.sh'), 'exit 99\n', { mode: 0o755 });
  const first = f.commit();
  f.writeSkill('Second.');
  const second = f.commit();
  f.writeSkill('Uncommitted content.');
  let summary = refreshSnapshot(f.repo, first, f.dest);
  assert.match(summary, /demo-example: nueva \(1\.0\.0\)/);
  const firstSkill = f.readLock().skills['demo-example'];
  assert.equal(firstSkill.commit, first);
  assert.equal(firstSkill.version, '1.0.0');
  assert.match(readFileSync(join(f.dest, 'skills/demo-example/SKILL.md'), 'utf8'), /First/);
  assert.equal(readFileSync(join(f.dest, 'skills/demo-example/inert.sh'), 'utf8'), 'exit 99\n');
  summary = refreshSnapshot(f.repo, second, f.dest);
  assert.match(summary, /contenido cambió sin cambiar la versión declarada/);
  assert.notEqual(firstSkill.sha256['SKILL.md'], f.readLock().skills['demo-example'].sha256['SKILL.md']);
  f.writeSkill('Now without a version.', null);
  const third = f.commit();
  assert.match(refreshSnapshot(f.repo, third, f.dest), /1\.0\.0 → sin versión declarada/);
  assert.equal(f.readLock().skills['demo-example'].version, null);
});

test('invalid reference, mutable refs and changed license leave the prior snapshot intact', (t) => {
  const f = fixture(t);
  f.writeSkill('Valid.');
  const first = f.commit();
  refreshSnapshot(f.repo, first, f.dest);
  const lock = f.readLock();
  assert.throws(() => refreshSnapshot(f.repo, 'HEAD', f.dest), /SHA de commit completo/);
  f.writeSkill('[Not a skill-local URL](../../not-a-guide.md)');
  const second = f.commit();
  assert.throws(() => refreshSnapshot(f.repo, second, f.dest), /Referencia local inválida/);
  assert.deepEqual(f.readLock(), lock);
  writeFileSync(join(f.repo, 'LICENSE'), 'Different license.');
  f.writeSkill('Valid again.');
  const third = f.commit();
  assert.throws(() => refreshSnapshot(f.repo, third, f.dest), /revisión manual/);
  assert.deepEqual(f.readLock(), lock);
});
