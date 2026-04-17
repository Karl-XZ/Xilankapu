# 西兰卡普桌面端

桌面端与 web 版共享同一套纹样生成、网格拆解、色卡导出和教学辅助逻辑，额外补上了 Electron 壳层与本地生成桥接。

## 当前能力

- 使用 Electron 启动桌面应用
- 通过 `preload + ipcMain` 在本地完成生成任务，不依赖浏览器 `/api`
- 有火山引擎密钥时优先调用真实生成
- 无密钥时自动回退到内置 mock 纹样生成
- 保留 Tauri 工程目录，便于后续继续扩展原生打包方案

## 启动方式

先启动前端开发服务：

```bash
npm install
npm run dev
```

然后在另一个终端启动 Electron：

```bash
NODE_ENV=development electron .
```

## 构建

```bash
npm run build
npm run electron:build
```

## 环境变量

可选环境变量如下：

- `VOLCENGINE_API_KEY`
- `VOLCENGINE_MODEL_ID`
- `VOLCENGINE_ARK_BASE_URL`
- `VOLCENGINE_ACCESS_KEY_ID`
- `VOLCENGINE_SECRET_ACCESS_KEY`
- `VOLCENGINE_REQ_KEY`
