---
name: vibe-coding-discipline
description: 'Use for how to work in this project: task sizing, manual verification, commit cadence, and how to prompt the AI assistant. The working rhythm of pi-web.'
user-invocable: true
---

# Vibe Coding 工作纪律

小白的失败主要不在技术，而在节奏。五条纪律，每条都是硬规则（`AGENTS.md` 同名章节的细则版）。

## 1. 小步

- 一次只让 AI 做**一个小功能**：一个按钮、一个接口、一张表。
- 拆解标准：能在 15 分钟内人工验收。
- 拒绝"把整个 App 做了"——那等于放弃存档点。

## 2. 随时能跑

- 每步结束：`npm run dev` 能启动 + 页面能打开。
- 任何时刻 `git reset --hard` 都能回到上一个好状态。

## 3. 勤存档

- 功能通过验收 → 立刻 commit（让 AI 提交并写清改动）。
- commit 是存档点：跑挂了回退，不跑丢失。

## 4. 喂参考

- 卡住或要新风格：先让 AI 读 `refs/lobe-chat` 对应实现，再写简化版（见 `license-and-references`）。
- 说法："参考它的**实现思路**，用我们自己的方式实现"。

## 5. 守则先行

- 约定变更 → 先改 AGENTS.md / 对应 skill → 再写代码。

## 人工验收清单（每功能必走）

- [ ] 主流程点一遍（按 `docs/replica/04` 当前阶段的"验收"）
- [ ] 失败路径：断网 / 错 key / 空列表 / 加载中
- [ ] 刷新 / 重启后状态符合预期
- [ ] commit 完成

## 翻车自救

| 症状 | 大概率原因 | 自救 |
|---|---|---|
| 前端 CORS 红字 | 架构歪了 | 接口必须是本站 API 路由；出现即重构 |
| 回答一坨出现 | 没走流式 | 改 streamText / SSE（见 `chat-streaming`） |
| 重启数据没了 | 没落库 | 检查 SQLite 写入（见 `topics-persistence`） |
| 同一功能修 3 次不好 | 需求模糊或方案太复杂 | 停下来用人话重写"我点 X 应该看到 Y"，或重读 refs 对应实现 |
| 越做越看不懂 | 步子太大 / 守则缺失 | 暂停新功能，让 AI 写 ARCHITECTURE 说明并更新 AGENTS.md |
| 白屏 + 一长串红 | 依赖版本打架 | 复制完整报错原文给 AI；不行就 `git reset` 回上一个 commit |
