import { readFileSync } from 'fs';
const app = JSON.parse(readFileSync('codemore-issues-2026-04-18.json','utf8'));
const web = JSON.parse(readFileSync('codemore-codemore.json','utf8'));
const ai = app.issues;
const wi = web.issues;
const ac={},as_={};
for(const i of ai){ac[i.category]=(ac[i.category]||0)+1;as_[i.severity]=(as_[i.severity]||0)+1;}
const wc={},ws={};
for(const i of wi){wc[i.category]=(wc[i.category]||0)+1;ws[i.severity]=(ws[i.severity]||0)+1;}
console.log('APP Total:',ai.length,'| Categories:',JSON.stringify(ac),'| Severities:',JSON.stringify(as_));
console.log('WEB Total:',wi.length,'| Categories:',JSON.stringify(wc),'| Severities:',JSON.stringify(ws));
const norm = p => {
  const parts = p.split(/[\/]+/);
  const idx = parts.lastIndexOf('codemore');
  return idx>=0 ? parts.slice(idx+1).join('/') : p;
};
const webKeys = new Set(wi.map(i=>i.title+'|'+norm(i.location.filePath)));
const matched = ai.filter(i=>webKeys.has(i.title+'|'+norm(i.location.filePath)));
console.log('APP issues also in WEB:', matched.length, 'of', ai.length);
const appFiles = new Set(ai.map(i=>norm(i.location.filePath)));
const webFiles = new Set(wi.map(i=>norm(i.location.filePath)));
console.log('APP unique files:', appFiles.size, '| WEB unique files:', webFiles.size);
