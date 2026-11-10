// Local check of the server over stdio: node test-client.mjs '<json>' | @file.json | wait:<file> ... (one call per
// argument, in one server process; wait:<file> pauses until that file exists, to edit runner.mjs between calls).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const c = new Client({ name: 'test', version: '1' });
await c.connect(new StdioClientTransport({ command: 'node', args: [new URL('server.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], env: process.env }));
console.log('tools:', (await c.listTools()).tools.map(t => `${t.name} (${t.description.length} chars)`).join(', '));
const fs = await import('node:fs');
for (const a of process.argv.slice(2)) if (a.startsWith('wait:')) { while (!fs.existsSync(a.slice(5))) await new Promise(r => setTimeout(r, 1000)); console.log('-- ' + a); } else for (let i = 0; i < 6; i++) { // retry while waiting for sign-in
  const t = (await c.callTool({ name: 'cloudapper_run', arguments: JSON.parse(a.startsWith('@') ? (await import('node:fs')).readFileSync(a.slice(1), 'utf8') : a) }, undefined, { timeout: 600000 })).content[0].text;
  if (!t.includes('"signIn":true') || i === 5) { console.log(t); break; }
}
await c.close();
