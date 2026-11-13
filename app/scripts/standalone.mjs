import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// A classic self-contained bundle needs neither a module loader nor external assets.
await mkdir('release', { recursive: true });
await build({ entryPoints: ['src/main.tsx'], bundle: true, format: 'iife',
  outfile: 'release/game.js', minify: true, target: 'es2020', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': './src' } });
const js = await readFile('release/game.js', 'utf8');
const css = await readFile('release/game.css', 'utf8');
const html = (await readFile('index.html', 'utf8'))
  .replace('</head>', () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head>`)
  .replace('<script type="module" src="/src/main.tsx"></script>',
    () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile('release/index.html', html);
console.log('Standalone ready: release/index.html (no external resources)');
