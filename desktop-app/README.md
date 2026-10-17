# 《科学革命》桌面应用与可点原型

2026-10-16，项目方确认第二轮目录、播放页和小窗口稿后制作。

**更新于2026-10-17：** 阶段 D 已完成 Electron 主进程/preload、内容根目录发现、受限媒体流式访问、系统用户目录记录、应用源码和开发构建，并完成 Windows 开发机验证。双击 `启动桌面应用.cmd` 可构建并运行。详见[阶段 D 交付](阶段D交付.md)，锁定基准见[首发交互范围](../首发交互范围.md)，主题素材确认见[主题页确认记录](qa/theme-pages-acceptance.md)。下一阶段是双平台独立发行包。

桌面构建命令：`npm run build:desktop`；运行：`npm run start:desktop`。开发构建位于 `dist/desktop/`，使用本工程已安装的 Electron 38.8.6，不需要 Vite 或网络。用户记录位于系统应用数据目录的 `Scientific-Revolution/reader-state.v1.json`。内容目录自动发现失败时可重新查找或使用原生文件夹选择。

本机预览：<http://127.0.0.1:4173/>

2026-10-17 已修复双击入口的隐藏窗口问题；再次启动会显示并恢复现有窗口。原生 Windows 可见性和唤回检查记录在 `qa/stage-d/launch-fix-verification.json`，修复说明见[阶段 D 交付](阶段D交付.md)。

同日按后续要求，科学之光与科学革命在中国的底图改为从顶部等比铺满左半页，桌面构建已更新。应用以单实例运行，再次双击会唤回现有窗口；查看新构建需关闭应用后重新启动。

## 双平台打包（2026-10-18）

已配置 electron-builder 26.15.3：`npm run package:windows` 生成 Windows 未签名 x64 目录包；`npm run package:mac` 在云端 Mac 生成 ad hoc 签名、未公证的通用包。输出位于 `release/`，视频不嵌入应用。工具链、产物、配套文件与 U 盘组装方式见[双平台打包](双平台打包.md)。Mac 构建及正式目标机/介质验收待执行。

## 已实现

- 已确认首页风格、目录/播放/小窗口设计，以及六个实际主题页；主流程为首页 → 主题目录 → 视频播放。
- 完整 44 讲正式标题、顺序、主讲人与身份，以及各视频真实时长。
- 讲次整行点击、前后讲、上一/下一主题、返回目录时的滚动位置与焦点恢复。首主题左侧、末主题右侧均返回首页。
- 六主题连续左半页底图、独立书法标题和可编辑资料叠放；界面统一“主题”“共N讲”，移除“切换模块”按钮。
- 科学之光与中国主题使用完整连续场景，从顶部等比铺满左半页且顶部无半透明过渡；较高窗口也不留顶部空白。首页主场景延伸至上缘、右缘，主操作在最上层。
- 搜索讲题、模块和主讲人；结果直接播放；无结果提示。
- 收藏、观看记录、真实继续观看；浏览器重载保留数据。
- 播放/暂停、进度、音量、静音、速度和全屏。
- 1280×720 小窗口默认收起播放目录；打开侧层暂停，关闭恢复原状态。
- 长标题完整换行，视频始终 `object-fit: contain`，控件置于画面下方。
- 媒体缺失提示、重新载入与返回目录。
- 页眉图标与文字横排 logo、靠右页脚出品/出版署名、关于本书策划/编辑/程序署名与介绍首行缩进。
- 首页科学之光/天文学/新物理学新缩略图、中国传统毛笔、主底图黄铜物品移除，以及右侧底边对齐的继续观看历史和带双空格分隔点的最终介绍文案。

## 运行

以下为保留的浏览器原型运行方式；桌面运行见上方及[阶段 D 交付](阶段D交付.md)。

在本目录运行：

```powershell
npm install --prefer-offline --no-audit --no-fund
npm run dev
```

当前预览已由助手启动。以后也可以双击 `启动原型.cmd`。

```powershell
npm run build
npm run preview -- --port 4173
```

生成的静态文件在 `dist/client/`。本地视频通过 Vite 开发/预览中间件读取，直接双击 HTML 或把静态文件上传服务器不能播放原 U 盘内容。

## 文件

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx` | 页面、导航、播放器和记录状态 |
| `src/styles.css` | 视觉与响应式布局 |
| `src/content.json` | 六模块、44 讲的稳定 ID、正式数据、路径和时长 |
| `scripts/local-media.mjs` | 只按清单中的讲次 ID 流式读取原视频，支持 Range |
| `public/assets/` | 已确认稿拆出的场景和展示字素材 |
| `scripts/prepare-content.py` | 从映射表、原视频和确认稿重新生成原型数据与素材 |
| `scripts/prepare-home-assets.py` | 单独重新生成首页透明轮廓、大底图和显示区域遮罩；不处理视频数据 |
| `scripts/prepare-theme-assets.py` | 顺序重生成六个主题底图和独立书法标题 |
| `scripts/prepare-revised-theme-assets.py` | 从修订原始场景生成科学之光、中国主题连续底图和标题 |
| `交互说明.md`、`../首发交互范围.md` | 已锁定首发行为、项目方确认和阶段 D 实施顺序 |
| `design-qa.md`、`qa/` | 视觉对照、浏览器检查和证据 |
| `qa/theme-pages-acceptance.md` | 六个主题页最终确认、最新截图索引与后续门槛 |

## 当前边界

现有 Electron 开发构建与浏览器原型共用界面。Electron 主进程、preload 和系统用户目录存储已完成；Windows/macOS Windows 独立目录包已制作，Mac 通用包待云端构建。以下浏览器记录说明只适用于浏览器原型。

收藏和观看位置存于当前浏览器、当前站点来源的 `scientific-revolution.prototype.v1` 键；换浏览器或端口会有独立记录。原型不写回 U 盘。拖到末尾不代表看完；仅自然结束且记录的实际播放区间覆盖至少 90% 时显示“已看完”。

首页和六个主题展示字均从已确认稿拆出，六页各自的连续大场景已接入。正式主题名和讲次仍保存在内容数据中，正文采用系统字体。正式字体、展示字素材的可分发授权及跨平台一致性仍需在发行前落实。

开发依赖安装后，本地界面和视频没有外部运行时请求；阶段 D 已检查本地协议启动与应用重启。实际断网、USB 双平台启动、macOS 媒体解码和无证书包首次启动尚未正式验收。

## 复核

阶段 D 检查：`npm run typecheck`、`npm run build:desktop`、`npm run test:desktop`、`npm run verify:desktop`，结果见 `qa/stage-d/verification.json`。浏览器/Sites 构建与 4 项既有检查也已通过。下面保留较早阶段 C 视觉记录。

已有检查记录：2026-10-16阶段 C 30项本机浏览器检查及当时构建通过；2026-10-17五主题实施后类型检查通过，并完成两尺寸视觉与导航检查。最终科学之光/中国页的2048×1152、1280×720截图已保存，控制台0错误、0警告。项目方现已明确确认所有原型内容、路径和规则；此文档更新没有重新运行构建或测试，阶段 D 开发验证与双平台正式验收另行记录。

```powershell
npm run typecheck
node scripts/verify-prototype.mjs
python scripts/compose-qa.py
```

浏览器检查默认使用本机 Chrome；其他路径可通过 `PROTOTYPE_BROWSER` 指定。检查使用独立临时浏览器上下文，不写入项目方浏览器记录。详情见 `qa/verification.json`。

## 2026-10-17 首页边缘修正

本节保留边缘修正时的素材与检查记录。后续三张缩略图重新生成、中国缩略图毛笔及主场景黄铜物品移除已接入同一素材脚本；当前素材来源和最终文案见[首发交互范围](../首发交互范围.md)。下述旧截图不代表后续所有修订。

首页六张图使用 `home-module-1.png` 至 `home-module-6.png`，保留原稿轮廓并向内羽化 6–8 个源像素。按用户后续反馈，大底图使用 `observatory-home.png` 配合 `home-scene-mask.png`，仅柔化左、下缘；显示宽度为页面 70%，高度为窗口 65%，从页面顶部一直铺到右边缘。缩略图透明区域可透出底图。主标题区高于模块图层，“开始学习”/“继续观看”按钮保持可点击；相邻“浏览全书目录”按钮已移除，顶部目录入口可用。原图 RGB、素材裁切尺寸、模块位置与标题排版保持原样。

裁切框、轮廓点和过渡宽度保存在素材脚本及 `public/assets/source-record.json`。单独更新首页素材：

```powershell
python scripts/prepare-home-assets.py
```

完整素材处理脚本也会调用这一步。最新浏览器核对见 `qa/home-immersive.json`，运行 `node scripts/verify-home-edges.mjs immersive` 可复现；运行 `python scripts/compose-home-immersive.py` 生成与原稿、上一版本并置的完整和局部对照。`qa/home-edges-before.json`、`qa/home-edges-after.json` 及边缘修正对照是历史基线，应保留；旧 `before`/`after` 模式核对的是当时大底图几何完全不变的版本，不适用于本次主动放大的底图。

## 2026-10-17 六个主题页最终确认

项目方已确认所有实际主题页。背景、展示字与首发数据均已接入；最新科学之光、中国主题参数为全高原场景、顶部过渡0px、右侧过渡65px，避免旧底图上下断层和主体过小。所有可重复参数见 `qa/*-asset-record.json`。

```powershell
python scripts/prepare-theme-assets.py
```

只生成科学之光、中国主题时运行 `python scripts/prepare-revised-theme-assets.py`。脚本复用本地素材，无图片API调用；包含标题修复运算，不要并行运行多个实例。依赖Pillow、numpy、scipy与opencv-python-headless。

最新两页截图是 `qa/{exchange,china}-opaque-top-{2048,1280}.png`。现有 `compose-theme-review.py`、`compose-continuity-review.py` 仍从此前截图生成历史并置图和概览；最终确认以[最新索引](qa/theme-pages-acceptance.md)为准。

上述为阶段 C 取消顶部淡出的既有截图。后续桌面适配已改为 `object-fit:cover; object-position:left top`，较高窗口顶部不留空白，允许边缘随窗口比例裁切；取代早期contain/底部对齐。该修订后 `npm run build:desktop`（含类型检查）通过，未新增截图或重跑功能检查。当前项目文档同步未执行构建或测试。
