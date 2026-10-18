// Converte dist-artifact/index.html nel formato pagina Artifact (senza doctype/html/head/body:
// lo scheletro lo aggiunge la pubblicazione) → dist-artifact/work-center.html
import fs from 'node:fs';
const html = fs.readFileSync('dist-artifact/index.html', 'utf8');
const svg = fs.readFileSync('src/assets/logo-placeholder.svg', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const favicon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const headClean = head
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<title>[^<]*<\/title>\s*/i, '')
  .replace(/href="\.\/logo-placeholder\.svg"/, `href="${favicon}"`);
const page = `<title>Matteo Work center</title>\n${headClean.trim()}\n${body.trim()}\n`;
fs.writeFileSync('dist-artifact/work-center.html', page);
console.log(`work-center.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
