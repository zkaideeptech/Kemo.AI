const fs = require('fs');
const files = ['c:/Users/Administrator/Desktop/Kemo.AI-codex-kemo-ui-redesign/src/components/kemo-workspace.tsx', 'c:/Users/Administrator/Desktop/Kemo.AI-codex-kemo-ui-redesign/src/components/notebook-workspace.tsx'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (l.includes('进程') || l.includes('技能卡') || l.includes('12%') || l.includes('truncate') || l.includes('待处理') || l.includes('实...')) {
          console.log(f, i+1, l.trim());
      }
    });
  }
});
