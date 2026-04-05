---
description: 自动提交与推送代码 (Auto Git Push)
---

// turbo-all

这是一个带有 `// turbo-all` 注解的全自动工作流。当你让我执行这个工作流时，下面的所有命令都不会出现确认弹窗，而是一路狂奔自动执行到底。

1. 添加所有变动的文件：运行命令 `git add .`
2. 提交代码：运行命令 `git commit -m "Auto commit by Turbo Workflow"`
3. 推送代码到远程仓库：运行命令 `git push`