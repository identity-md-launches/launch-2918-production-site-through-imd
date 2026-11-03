import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';

const reports = process.env.BLOCKLIGHT_REPORTS ?? 'test/scratch/validation';
await mkdir(reports, { recursive: true });
const run = spawnSync(process.execPath, ['scripts/tool.mjs', 'test', '--reporter=json', '--outputFile=test/scratch/unit-raw.json'], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);
const raw = JSON.parse(await readFile('test/scratch/unit-raw.json', 'utf8'));
const report = {
  generatedAt: new Date().toISOString(),
  command: 'npm test -- --reporter=json --outputFile=test/scratch/unit-raw.json',
  success: raw.success,
  total: raw.numTotalTests,
  passed: raw.numPassedTests,
  failed: raw.numFailedTests,
  pending: raw.numPendingTests,
  suites: raw.testResults.map(suite => ({
    file: relative(process.cwd(), suite.name), status: suite.status,
    checks: suite.assertionResults.map(test => ({ name: test.fullName, status: test.status, durationMs: test.duration })),
  })),
};
await writeFile(`${reports}/unit-results.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Recorded ${report.passed}/${report.total} passing deterministic checks.`);
