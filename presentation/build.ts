import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const result = await Bun.build({ entrypoints: ['src/main.ts'], outdir: 'dist', target: 'browser', minify: true });
if (!result.success) throw new Error(result.logs.join('\n'));
await cp('src/style.css', 'dist/style.css');
const script = await readFile('../docs/presentation/speaker-notes.md', 'utf8');
const notes = script.split(/^## /m).slice(1).map(section => {
  const lines = section.trim().split('\n\n');
  return { title: lines[0].replace(/^\d+\. /, ''), timing: lines[1].replace(/\*\*/g, '').replace('Timing: ', ''), script: lines[2], source: lines.slice(3).join('\n\n').replace(/^Evidence: /, '') };
});
await writeFile('dist/notes.json', JSON.stringify(notes));
console.log(`Built presentation and ${notes.length} speaker notes.`);
