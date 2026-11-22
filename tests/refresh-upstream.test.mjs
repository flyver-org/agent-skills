import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { refreshSnapshot } from '../scripts/refresh-upstream.mjs';
import { parseUpstreamConfig, readUpstreamConfig } from '../scripts/upstreams.mjs';
import { reviewSources } from '../scripts/review-upstreams.mjs';
import { catalogRoot, loadCatalog } from '../scripts/skills.mjs';

const wrap = (sources, locals = readUpstreamConfig().localSkills) =>
  'schemaVersion: 2\nlocalSkills:\n' + locals.map((name) => '  - ' + name + '\n').join('') +
  'sources:\n' + sources.join('');
const source = (id, skill, props = {}) =>
  '  - id: ' + id + '\n    repository: ' + (props.repository ?? 'https://github.com/example-org/' + id) +
  '\n    branch: ' + (props.branch ?? 'stable') + '\n    license: ' + (props.license ?? 'MIT') +
  (props.skillsPath ? '\n    skillsPath: ' + props.skillsPath : '') +
  (props.licensePath ? '\n    licensePath: ' + props.licensePath : '') +
  '\n    skills:\n      - ' + skill + '\n';

function fixture(t, id = 'synthetic-upstream', skill = 'demo-example', overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'flyver-upstream-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'git');
  const dest = join(dir, 'vendor');
  const config = parseUpstreamConfig(wrap([source(id, skill, overrides)])).sources[0];
  const docs = join(repo, config.skillsPath, skill);
  mkdirSync(docs, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'core.autocrlf', 'false');
  const license = join(repo, config.licensePath);
  mkdirSync(dirname(license), { recursive: true });
  writeFileSync(license, config.license === 'Apache-2.0'
    ? 'Apache License\nVersion 2.0, January 2004\nSynthetic test notice only\n'
    : 'MIT License\nSynthetic test notice only\n');
  const writeSkill = (body, version = '1.0.0', name = skill) => {
    writeFileSync(join(docs, 'SKILL.md'), '---\nname: ' + name + '\ndescription: Demo example.\n' +
      (version === null ? '' : 'metadata:\n  version: "' + version + '"\n') + '---\n' + body + '\n');
  };
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const readLock = () => JSON.parse(readFileSync(join(dest, 'upstream.json'), 'utf8'));
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
  const config = wrap([source('first', 'demo-example', { branch: 'release/approved' })]);
  assert.deepEqual(parseUpstreamConfig(config).sources[0], {
    id: 'first', repository: 'https://github.com/example-org/first', branch: 'release/approved',
    license: 'MIT', skillsPath: 'skills', licensePath: 'LICENSE', skills: ['demo-example'],
  });
  for (const broken of [
    config.replace('github.com', 'github.com.invalid'),
    config.replace('https://', 'https://some-token@'),
    config.replace('release/approved', 'refs/../escape'),
    config.replace('release/approved', '--config'),
    config.replace('license: MIT', 'license: unapproved'),
    config.replace('license: MIT', 'license: MIT\n    extra: unsupported'),
    config + '      - demo-example\n',
    config.replace('      - demo-example', '      - ../../outside'),
    config.replace('      - demo-example', '      - *some-alias'),
    wrap([source('first', 'demo-example', { skillsPath: '../../outside' })]),
    wrap([source('first', 'demo-example'), source('second', 'demo-example')]),
    wrap([source('first', 'demo-example'), source('first', 'other-example')]),
    wrap([source('first', 'demo-example')], ['duplicate-local', 'duplicate-local']),
    wrap([source('first', 'demo-example')], ['demo-example']),
    wrap([source('first', 'demo-example')], ['../../invalid']),
  ]) assert.throws(() => parseUpstreamConfig(broken), /upstreams.yaml/);
});

test('reviews two independent sources and only changes the source with approved new content', (t) => {
  const props = { skillsPath: '.agents/skills', licensePath: 'docs/LICENSE.md', branch: 'release/versioned', license: 'Apache-2.0' };
  const a = fixture(t, 'source-a', 'first-skill');
  const b = fixture(t, 'source-b', 'second-skill', props);
  const config = parseUpstreamConfig(wrap([source('source-a', 'first-skill'), source('source-b', 'second-skill', props)]));
  const vendors = join(dirname(a.dest), 'snapshots');
  mkdirSync(vendors);
  const targetA = join(vendors, a.config.id);
  const targetB = join(vendors, b.config.id);
  a.writeSkill('First initial.');
  b.writeSkill('Second stable.');
  const a1 = a.commit();
  const b1 = b.commit();
  refreshSnapshot(a.repo, a1, targetA, a.config);
  refreshSnapshot(b.repo, b1, targetB, b.config);
  const read = (target) => readFileSync(join(target, 'upstream.json'), 'utf8');
  const bLock = read(targetB);
  a.writeSkill('First new approved bytes.');
  const a2 = a.commit();
  const seen = [];
  const clones = [];
  const remote = {
    head(s) { seen.push([s.repository, s.branch]); return s.id === a.config.id ? a2 : b1; },
    withRepository(s, cb) { clones.push(s.id); return cb(s.id === a.config.id ? a.repo : b.repo); },
  };
  const result = reviewSources(config, { vendors, remote });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(seen, [[a.config.repository, a.config.branch], [b.config.repository, b.config.branch]]);
  assert.ok(config.localSkills.includes('flyver-astryx-react'));
  assert.doesNotMatch(result.summary, /flyver-astryx-react/);
  assert.deepEqual(clones, ['source-a']);
  assert.equal(JSON.parse(read(targetA)).commit, a2);
  assert.equal(read(targetB), bLock);
  assert.match(result.summary, /Fuente: source-a[\s\S]*contenido cambió/);
  assert.match(result.summary, /Fuente: source-b[\s\S]*hashes verificados/);
  const loaded = loadCatalog(catalogRoot, config, vendors);
  assert.equal(loaded.get('first-skill').sourceId, 'source-a');
  assert.equal(loaded.get('second-skill').sourceId, 'source-b');
  assert.match(readFileSync(join(targetB,'LICENSE'),'utf8'), /Apache License/);

  // A failing source does not hide verification of a separate healthy source.
  const bad = reviewSources(config, { vendors, remote: {
    head(s) { if (s.id === 'source-a') throw new Error('simulated source outage'); return b1; },
    withRepository() { throw new Error('unexpected clone'); },
  }});
  assert.deepEqual(bad.failed, ['source-a']);
  assert.match(bad.summary, /simulated source outage/);
  assert.match(bad.summary, /Fuente: source-b[\s\S]*hashes verificados/);
  assert.match(bad.summary, /No se publicará un candidato parcial/);
  mkdirSync(join(vendors,'outsider'));
  assert.throws(() => loadCatalog(catalogRoot, config, vendors), /sin fuente YAML aprobada/);
});

test('a shared package license is preserved and a different package notice requires review', (t) => {
  const f = fixture(t);
  f.writeSkill('Licensed package.');
  const relativeLicense = join(f.docs, 'LICENSE');
  writeFileSync(relativeLicense, readFileSync(join(f.repo, f.config.licensePath)));
  f.refresh(f.commit());
  const before = f.readLock();
  assert.equal(readFileSync(join(f.dest, 'skills', 'demo-example', 'LICENSE'), 'utf8'),
    readFileSync(join(f.dest, 'LICENSE'), 'utf8'));
  writeFileSync(relativeLicense, 'Different or unapproved license.');
  assert.throws(() => f.refresh(f.commit()), /Licencia de paquete diferente/);
  assert.deepEqual(f.readLock(), before);
});
