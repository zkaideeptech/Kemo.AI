---
description: 自动打包及部署流程 (Build, Lint & Ship Pipeline)
---
// turbo-all

1. 执行代码检查：`npm run lint`
2. 执行代码构建：`npm run build`
3. 添加所有变更：`git add .`
4. 提交所有代码：`git commit -m "Auto-shipped changes via Turbo Mode"`
5. 推送到远程仓库：`git push`
