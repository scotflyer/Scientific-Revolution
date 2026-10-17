# 科学革命

六个主题、44 讲视频的 U 盘电子出版物阅读器，使用 Electron、React 和 TypeScript。

## 桌面打包

应用位于 `desktop-app/`。先安装锁文件中的依赖，再在对应系统打包：

```text
cd desktop-app
npm ci --no-audit --no-fund
npm run package:windows
```

Mac 上运行 `npm run package:mac`，生成 Intel + Apple Silicon 通用包。Windows 发行包未签名；Mac 使用免费 ad hoc 签名，未经 Apple 公证。操作与介质组装方式见[双平台打包说明](desktop-app/双平台打包.md)。

## GitHub Actions

进入仓库的 **Actions → Build desktop packages → Run workflow**，选择 `mac`、`windows` 或 `both`。默认只构建 Mac，工作流不随提交自动执行，不自动发布 Release。完成后从该次运行的 Artifacts 下载产物，默认保存 14 天；账户额度与费用由 GitHub 套餐决定。

Mac 下载产物中包含打包器生成的内层 ZIP；请在 Mac 上解包该 ZIP，保存 `.app` 的符号链接与执行权限。上传 `.app` 文件夹本身不能保证这些属性保留。

## 本仓库范围

仓库包含源码、锁文件、打包配置、项目 Markdown 文档以及已处理的界面资源。不包含原视频、出版信息 DOCX、设计源图、开发依赖、本机发行包或 QA 截图。打包无需视频；实际播放需另备根目录 `content.json` 和原 `视频/` 目录。

素材重处理脚本及历史设计文档可能引用仅在本地保存的原图和检查证据；它们不是 CI 打包步骤。正式目标系统、两种 Mac 架构、实体 U 盘、离线与首次启动验收仍须完成。
