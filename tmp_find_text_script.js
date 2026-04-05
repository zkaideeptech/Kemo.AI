const fs = require('fs');
let results = [];
try {
const lines1 = fs.readFileSync('src/components/kemo-workspace.tsx', 'utf8').split('\n');
const items1 = lines1.map((l, i) => ({ file: 'kemo-workspace.tsx', n: i+1, t: l.trim() })).filter(x => x.t.includes('12%') || x.t.includes('进程') || x.t.includes('技能卡') || x.t.includes('truncate') || x.t.includes('待处理') || x.t.includes('实...'));
results.push(...items1);
} catch (e) {}

try {
const lines2 = fs.readFileSync('src/components/notebook-workspace.tsx', 'utf8').split('\n');
const items2 = lines2.map((l, i) => ({ file: 'notebook-workspace.tsx', n: i+1, t: l.trim() })).filter(x => x.t.includes('12%') || x.t.includes('进程') || x.t.includes('技能卡') || x.t.includes('truncate') || x.t.includes('待处理') || x.t.includes('实...'));
results.push(...items2);
} catch (e) {}

fs.writeFileSync('tmp_find_text_results.json', JSON.stringify(results, null, 2), 'utf8');
