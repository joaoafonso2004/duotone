import { readFile, writeFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = String(packageJson.version || '').trim();

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${version || '(empty)'}`);
}

const output = `// Gerado automaticamente antes da build desktop a partir do package.json.\n// Em CI, o identificador e a versão também são alinhados com a tag da release.\nexport const BUILD_ID = 'dev';\nexport const APP_VERSION = '${version}';\n`;

await writeFile(new URL('../src/lib/buildInfo.ts', import.meta.url), output, 'utf8');
console.log(`Desktop build version: ${version}`);
