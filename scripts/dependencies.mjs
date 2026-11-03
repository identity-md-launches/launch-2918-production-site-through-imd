import { createRequire } from 'node:module';
import { resolve } from 'node:path';
export const dependencyRoot = process.env.BLOCKLIGHT_DEPENDENCIES;
export const dependencyRequire = createRequire(dependencyRoot ? resolve(dependencyRoot, 'package.json') : new URL('../package.json', import.meta.url));
