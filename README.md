# 西兰卡普 AI 纹样生成与绣制辅助平台

一个围绕西兰卡普纹样设计、格纹拆解、配色编号、路径辅助和教学导出的完整项目仓库。

## 仓库结构

- 根目录：web 版应用，包含前端与本地开发 API
- `desktop-app/`：桌面端应用，包含 Electron 壳层与 Tauri 工程目录

## 当前实现

- 首页、工作台、纹样库、我的项目、教学页、管理页、关于页
- 本地登录/注册与管理员模式
- 纹样知识库与提示模板管理
- 火山引擎生成任务创建、轮询与候选结果展示
- 无密钥时自动回退到内置 mock 纹样生成
- 候选纹样转格纹矩阵
- 格纹编辑：上色、锁定、取色、镜像、旋转、重复
- 色卡统计、路径建议、教学模式
- PNG / SVG / PDF / 色卡 CSV 导出
- 本地项目保存、载入、版本记录和导出记录

## 启动方式

```bash
npm install
npm run dev
```

本地开发时，`vite.config.ts` 已内置 `/api/generate`、`/api/generations/:id`、`/api/generations/:id/status` 三个开发接口。

## 火山引擎配置

复制环境变量模板：

```bash
cp .env.example .env.local
```

填写以下变量：

- `VOLCENGINE_API_KEY`
- `VOLCENGINE_MODEL_ID`
- `VOLCENGINE_ARK_BASE_URL`

如果不填写，项目仍可运行，但生成接口会自动使用内置 mock 纹样图，方便继续调 UI 与工艺辅助模块。

## 构建

```bash
npm run build
npm run lint
```

## 桌面端

桌面端源码位于 `desktop-app/`，启动和打包说明见：

```bash
cd desktop-app
npm install
npm run build
```

## 目录说明

- `src/App.tsx`：主应用编排
- `src/data`：知识库、默认工作区、线色数据
- `src/lib`：提示词、矩阵拆解、导出、本地存储
- `src/services/api.ts`：前端 API 调用
- `functions`：生成任务服务与火山引擎接入逻辑
- `vite.config.ts`：本地开发 API 中间件
