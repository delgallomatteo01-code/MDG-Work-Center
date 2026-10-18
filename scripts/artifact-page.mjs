// Prepara la pagina Artifact: HTML leggero (senza doctype/html/head/body, li aggiunge la pubblicazione)
// che carica app.js e app.css pubblicati come file accanto alla pagina → dist-artifact/work-center.html
import fs from 'node:fs';
const html = fs.readFileSync('dist-artifact/index.html', 'utf8');
const svg = fs.readFileSync('src/assets/logo-placeholder.svg', 'utf8');
const favicon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const theme = html.match(/<script>\s*try \{[\s\S]*?<\/script>/)[0];
for (const f of ['app.js', 'app.css']) if (!fs.existsSync(`dist-artifact/${f}`)) throw new Error(`manca ${f}`);
const page = `<title>Matteo Work center</title>
<link rel="icon" id="favicon" href="${favicon}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="app.css" />
${theme}
<div id="root"></div>
<script type="module" src="app.js"></script>
`;
fs.writeFileSync('dist-artifact/work-center.html', page);
console.log(`work-center.html ${page.length} B, app.js ${(fs.statSync('dist-artifact/app.js').size / 1e6).toFixed(2)} MB`);
