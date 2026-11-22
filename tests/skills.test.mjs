import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { catalogRoot, loadCatalog } from '../scripts/skills.mjs';
import { readUpstreamConfig } from '../scripts/upstreams.mjs';

const entry = fileURLToPath(new URL('../scripts/skills.mjs', import.meta.url));
const getArgs = (target, ...names) => ['install', '--target', target, ...names];
const run = (...args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
const b2b = 'flyver-prospeccion-b2b';
const social = 'flyver-contenido-social';
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'flyver skills '));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

test('validate and list a single topic through the public CLI', () => {
  assert.equal(run('validate').status, 0);
  const { status, stdout } = run('list', 'marketing');
  assert.equal(status, 0);
  assert.match(stdout, /marketing\/flyver-prospeccion-b2b/);
  assert.doesNotMatch(stdout, /design\//);
  assert.notEqual(run('list', 'unlisted-category').status, 0);
});

test('copies only two selected packages, with exact UTF-8 content, to Codex', (t) => {
  const target = temp(t);
  const dest = join(target, '.agents', 'skills');
  assert.equal(run(...getArgs(target, b2b, social)).status, 0);
  assert.deepEqual(readdirSync(dest).sort(), [social, b2b].sort());
  assert.equal(readFileSync(join(dest, b2b, 'SKILL.md'), 'utf8'),
    readFileSync(join(loadCatalog().get(b2b).folder, 'SKILL.md'), 'utf8'));
  assert.equal(existsSync(join(target, '.claude')), false);
});

test('claude-code uses its own project-local skills folder', (t) => {
  const target = temp(t);
  const result = run(...getArgs(target, '--agent', 'claude-code', b2b));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, '.claude', 'skills', b2b, 'SKILL.md')), true);
  assert.equal(existsSync(join(target, '.agents')), false);
});

test('existing skill blocks entire request, even if requested second', (t) => {
  const target = temp(t);
  const dest = join(target, '.agents', 'skills');
  mkdirSync(join(dest, social), { recursive: true });
  writeFileSync(join(dest, social, 'SKILL.md'), 'original');
  assert.notEqual(run(...getArgs(target, b2b, social)).status, 0);
  assert.equal(existsSync(join(dest, b2b)), false);
  assert.equal(readFileSync(join(dest, social, 'SKILL.md'), 'utf8'), 'original');
});

test('unknown, path-like, duplicate, or invalid agent installs do not write', (t) => {
  const target = temp(t);
  for (const names of [[b2b, 'unknown'], ['../other'], [b2b, b2b], ['--agent', 'invalid', social]]) {
    assert.notEqual(run(...getArgs(target, ...names)).status, 0);
  }
  assert.deepEqual(readdirSync(target), []);
});

test('does not follow redirected destination directory', (t) => {
  const target = temp(t);
  const external = temp(t);
  symlinkSync(external, join(target, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual(run(...getArgs(target, b2b)).status, 0);
  assert.deepEqual(readdirSync(external), []);
});

test('validator rejects duplicated skill names across topics and invalid local references', (t) => {
  const root = temp(t);
  const a = join(root, 'marketing', b2b);
  const b = join(root, 'design', b2b);
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  const source = join(loadCatalog().get(b2b).folder, 'SKILL.md');
  cpSync(source, join(a, 'SKILL.md'));
  cpSync(source, join(b, 'SKILL.md'));
  assert.throws(() => loadCatalog(root), /duplicado/);
  rmSync(b, { recursive: true });
  writeFileSync(join(a, 'SKILL.md'), readFileSync(source, 'utf8') + '\n[Missing](references/inexistent.md)\n');
  assert.throws(() => loadCatalog(root), /Referencia local inválida/);
});

test('validator rejects skill names that differ from directory and malformed frontmatter', (t) => {
  const root = temp(t);
  const path = join(root, 'marketing', 'example');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'SKILL.md'), '---\nname: mismatch\ndescription: Fictional example.\n---\n# Body\n');
  assert.throws(() => loadCatalog(root), /coincidir/);
  writeFileSync(join(path, 'SKILL.md'), '---\nname: example\ndescription: Example.\ndescription: Duplicated.\n---\n# Body\n');
  assert.throws(() => loadCatalog(root), /duplicada/);
});

test('vendored install includes intact instructions, assets and MIT notice', (t) => {
  const target = temp(t);
  const result = run(...getArgs(target, '--agent', 'claude-code', 'cro'));
  assert.equal(result.status, 0, result.stderr);
  const dest = join(target, '.claude', 'skills', 'cro');
  assert.deepEqual(readdirSync(dest).sort(), ['LICENSE', 'SKILL.md', 'evals', 'references'].sort());
  assert.match(readFileSync(join(dest, 'LICENSE'), 'utf8'), /Copyright \(c\) 2025 Corey Haines/);
  const original = loadCatalog().get('cro');
  assert.equal(readFileSync(join(dest, 'SKILL.md'), 'utf8'), readFileSync(join(original.folder, 'SKILL.md'), 'utf8'));
});

test('validator rejects vendored content that differs from the lock', (t) => {
  const root = temp(t);
  const catalog = fileURLToPath(new URL('../skills/', import.meta.url));
  const vendor = fileURLToPath(new URL('../vendor/coreyhaines31-marketingskills/', import.meta.url));
  const copy = join(root, 'coreyhaines31-marketingskills');
  cpSync(vendor, copy, { recursive: true });
  const path = join(copy, 'skills', 'cro', 'SKILL.md');
  writeFileSync(path, readFileSync(path, 'utf8') + '\nAlterado.\n');
  assert.throws(() => loadCatalog(catalog, undefined, root), /SHA-256 externo distinto/);
});

test('full catalogue reports pinned and original versions', () => {
  const catalog = loadCatalog();
  const manifest = JSON.parse(readFileSync(new URL('../vendor/coreyhaines31-marketingskills/upstream.json', import.meta.url), 'utf8'));
  assert.equal([...catalog.values()].filter((s) => s.commit).length, Object.keys(manifest.skills).length);
  const copy = manifest.skills.copywriting;
  assert.ok(copy);
  assert.equal(run('version', 'copywriting').stdout.trim(),
    'copywriting: ' + (copy.version ?? 'sin versión declarada') + ' (coreyhaines31-marketingskills @ ' + copy.commit + ')');
  assert.match(run('version', b2b).stdout, /1\.0\.0 \(Flyver\)/);
  assert.equal(run('version', 'package-not-found').status, 1);
});

test('link-building copies only the six shared references to where relative links resolve', (t) => {
  const target = temp(t);
  const result = run(...getArgs(target, 'link-building'));
  assert.equal(result.status, 0, result.stderr);
  const dest = join(target, '.agents', 'skills', 'link-building', '..', '..', 'tools', 'integrations');
  assert.deepEqual(readdirSync(dest).sort(), ['ahrefs', 'dataforseo', 'exa', 'firecrawl', 'hunter', 'semrush'].map(x => x + '.md'));
});

test('link-building never overwrites a shared guide or partially installs on collision', (t) => {
  const target = temp(t);
  const guides = join(target, '.claude', 'tools', 'integrations');
  mkdirSync(guides, { recursive: true });
  writeFileSync(join(guides, 'hunter.md'), 'keep');
  assert.notEqual(run(...getArgs(target, '--agent', 'claude-code', b2b, 'link-building')).status, 0);
  assert.equal(existsSync(join(target, '.claude', 'skills')), false);
  assert.equal(readFileSync(join(guides, 'hunter.md'), 'utf8'), 'keep');
});

test('audits each approved package separately without network calls', () => {
  const policy = loadCatalog();
  const result = run('audit-upstream');
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, [...policy.values()].filter((s) => s.commit).length);
  assert.ok(lines.every((line) => /: hashes verificados$/.test(line)));
  assert.doesNotMatch(result.stdout, /flyver-prospeccion-b2b/);
});

test('local skills are validated against YAML but not emitted as remote sources', () => {
  const policy = readUpstreamConfig();
  const ast = 'flyver-astryx-react';
  assert.ok(policy.localSkills.includes(ast));
  assert.equal(loadCatalog().get(ast).category, 'design');
  assert.equal(loadCatalog().get(ast).sourceId, undefined);
  assert.throws(() => loadCatalog(catalogRoot, { ...policy, localSkills: policy.localSkills.filter(n => n !== ast) }),
    /faltan en YAML: flyver-astryx-react/);
  assert.throws(() => loadCatalog(catalogRoot, { ...policy, localSkills: [...policy.localSkills, 'missing-local'] }),
    /faltan en disco: missing-local/);
  const command = fileURLToPath(new URL('../scripts/upstreams.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [command, 'vendor-roots'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), policy.sources.map(src => 'vendor/' + src.id));
  assert.ok(!result.stdout.includes(ast));
});

test('installing the Astryx guide copies the instructions, not app dependencies or generated skills', (t) => {
  const target = temp(t);
  const guide = 'flyver-astryx-react';
  const result = run(...getArgs(target, guide));
  assert.equal(result.status, 0, result.stderr);
  const skills = join(target, '.agents', 'skills');
  assert.deepEqual(readdirSync(target), ['.agents']);
  assert.deepEqual(readdirSync(skills), [guide]);
  const md = readFileSync(join(skills, guide, 'SKILL.md'), 'utf8');
  assert.match(md, /pnpm exec astryx init --to skills/);
  assert.match(md, /No agregues reset\.css al CSS global/);
});
