import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dist = resolve('dist');
const html = await readFile(join(dist, 'index.html'), 'utf8');
assert(/<title>Blocklight/.test(html));
for (const name of ['description', 'og:title', 'og:image']) assert(html.includes(`"${name}"`), `Missing ${name}`);
assert(/rel="icon"/.test(html));
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
for (const ref of references) {
  assert(ref.startsWith('./'), `HTML asset must be relative: ${ref}`);
  assert((await stat(join(dist, ref))).isFile(), `Missing runtime asset: ${ref}`);
}
const ignored = new Set(['.git', '.github', '.imd', '.agents', '.codex', '.aws', 'node_modules', '.vite', '.vitest', 'coverage']);
async function files(folder, relative = '') {
  const output = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = join(relative, item.name);
    if (ignored.has(item.name) || item.name.startsWith('.env') || path === join('test', 'scratch') || item.name.endsWith('.tsbuildinfo')) continue;
    assert(!item.isSymbolicLink(), `No symlink/submodule deliverables: ${path}`);
    if (item.isDirectory()) output.push(...await files(join(folder, item.name), path));
    else output.push(path);
  }
  return output;
}
const runtime = await files(dist);
const manifest = [];
for (const path of runtime) {
  const content = await readFile(join(dist, path));
  manifest.push({ path: `dist/${path}`, bytes: content.length, sha256: hash(content) });
  assert(!path.endsWith('.tgz') && !path.endsWith('.map'), `Unnecessary packaging: ${path}`);
  if (path.endsWith('.css')) {
    for (const match of content.toString().matchAll(/url\(["']?([^\)"']+)["']?\)/g)) {
      assert(!match[1].startsWith('/') && !match[1].includes('://'), `CSS asset must be local and relative: ${match[1]}`);
      assert((await stat(resolve(dist, dirname(path), match[1]))).isFile());
    }
  }
  if (/\.(js|html|css)$/.test(path)) assert(!content.toString().includes('127.0.0.1'), 'Local verification endpoint leaked into export');
}
const og = await readFile(join(dist, 'og-image.png'));
assert.equal(og.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(og.readUInt32BE(16), 1200); assert.equal(og.readUInt32BE(20), 630);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
const budget = JSON.parse(await readFile('scripts/path-budget.json', 'utf8'));
const measured = Object.fromEntries(Object.keys(budget.pathBudgets).map(key => [key, 0]));
const reports = resolve(process.env.BLOCKLIGHT_REPORTS ?? 'test/scratch/validation');
const submission = await files('.');
for (const path of submission) {
  const prefix = Object.keys(measured).find(key => path.startsWith(key));
  const category = prefix ?? 'root source, lockfile and documentation';
  const size = (await stat(path)).size; measured[category] += size;
  assert(!/\.(tgz|deb|zip)$/.test(path), `Dependency packaging is not a deliverable: ${path}`);
}
const totalBytes = Object.values(measured).reduce((a, b) => a + b, 0);
for (const [path, bytes] of Object.entries(measured)) assert(bytes <= budget.pathBudgets[path], `Path budget exceeded for ${path}: ${bytes}`);
assert(totalBytes < budget.submissionLimitBytes, `Submission exceeds 8 MiB: ${totalBytes}`);
const result = { generatedAt: new Date().toISOString(), passed: true, relativeAssets: true, shareCard: '1200×630 PNG', lockfileMatches: true, distFiles: manifest, pathBytes: measured, totalBytes, submissionLimitBytes: budget.submissionLimitBytes };
await mkdir(reports, { recursive: true });
await writeFile(join(reports, 'export-integrity.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Export integrity passed: ${manifest.length} complete runtime files; ${totalBytes} submission bytes / ${budget.submissionLimitBytes} allowed.`);
