import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { dependencyRequire, dependencyRoot } from './dependencies.mjs';

const [command, ...args] = process.argv.slice(2);
if (command === 'typecheck') {
  const ts = dependencyRequire('typescript');
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  if (dependencyRoot) {
    config.config.compilerOptions.baseUrl = resolve(dependencyRoot, 'node_modules');
    config.config.compilerOptions.typeRoots = [resolve(dependencyRoot, 'node_modules/@types')];
    config.config.compilerOptions.paths = {
      'react': ['@types/react/index.d.ts'],
      'react/*': ['@types/react/*'],
      'react-dom/*': ['@types/react-dom/*'],
    };
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: n => n, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
    }));
    process.exitCode = 1;
  } else process.stdout.write('Typecheck passed.\n');
} else {
  const test = command === 'test';
  const packageName = test ? 'vitest' : 'vite';
  const pkgDir = dirname(dependencyRequire.resolve(`${packageName}/package.json`));
  const binary = resolve(pkgDir, test ? 'vitest.mjs' : 'bin/vite.js');
  const cli = test ? ['run', ...args] : command === 'dev' ? args : [command, ...args];
  const result = spawnSync(process.execPath, [binary, ...cli], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
