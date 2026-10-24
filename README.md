# Astra Yao · DSH 桌宠插件

把 [Codex Pet: Astra Yao](https://github.com/hongxin-y/codex-pet-Astra-Yao) 的像素桌宠做成了
DeepSeek Harness（DSH）可以识别的插件：装进 profile 之后，Astra Yao 会以悬浮小人的形式待在 DSH Web 界面
右下角，跟着会话状态换动作——思考时翻谱、执行命令时小跑、等你确认时托腮等待、出错时躺平。

头顶还有一个状态气泡：写着当前状态、正在跑的工具、报错原文，可选显示 DeepSeek 账户余额和今日消耗。

- 角色：深墨绿长发、红黑外套、白裙、金色环形麦克风立杖的舞台歌手像素小人
- 素材：`spritesheet.webp`，1536×2288，Codex v2 atlas（8 列 × 11 行，单帧 192×208），透明背景
- 形态：一个标准的 DSH 插件包（`package.json` 里的 `dsh.bundle` + `dsh.client`），
  服务端一半负责会话状态与 HTTP 接口，浏览器一半负责把 sprite 画到页面上

## 两个身份

这个仓库同时是两样东西，互不干扰：

| 你是谁 | 怎么用 | 需要的文件 |
| --- | --- | --- |
| DSH 用户 | `dsh plugin --profile desktop add <本仓库路径>`（见下文「安装」） | `package.json`、`cordis.patch.yml`、`src/`、`lib/` |
| Codex 用户 | 把仓库里的 `pet.json` + `spritesheet.webp` 复制到 `%USERPROFILE%\.codex\pets\astra-yao\`（见 [USAGE.md](USAGE.md)） | 仍然只有 `pet.json` + `spritesheet.webp` |

Codex 只认这两个文件，所以 DSH 那套 `package.json`、`src/`、`test/` 放在同一层不影响它；
反过来，DSH 的 sprite 也直接读根目录的 `spritesheet.webp`，没有第二份拷贝。

> **English:** Astra Yao is a Codex v2 sprite-atlas pet for the DeepSeek Harness web GUI. One 1536×2288
> atlas (8×11 frames of 192×208) drives nine animations; the server half follows session events, so the pet
> idles, thinks, runs while tools are working and waits on approvals. The browser half paints it in a
> shadow-root widget with drag-to-move, a status bubble, a right-click menu and pointer-look that follows a
> nearby cursor. The bubble keeps a stage-flavoured status line and rotates backstage quips while the pet is idle,
> and can also show the DeepSeek account balance and today's spend.
> Install with `dsh plugin --profile desktop add <path-to-this-repo>`.

## 目录

```text
pet-astra-yao/
|-- package.json          # DSH 插件清单：dsh.bundle / dsh.client / exports
|-- cordis.patch.yml      # 插件行：装进 profile 的那一条 insert
|-- src/
|   |-- index.js          # 服务端插件：会话跟踪、配置、/plugins/dsh-pet-astra-yao/* 接口
|   |-- state.js          # 会话事件 → 桌宠状态（纯函数，便于测试）
|   |-- atlas.js          # Codex atlas 契约：行列、帧数、方向、取帧算法
|   |-- balance.js        # DeepSeek 余额查询 + 今日消耗记账
|   |-- config.js         # 配置归一化与 PATCH 校验
|   `-- client.core.js    # 浏览器端源码（影子 DOM、拖拽、气泡、右键菜单、轮询）
|-- scripts/
|   |-- build-client.mjs  # 把 client.core.js 打包成 lib/client.js
|   |-- verify.mjs        # 安装前自检：清单、补丁、bundle、atlas
|   `-- audit-atlas.py    # 图集体检：帧数、行内高度、脚底基线（Pillow）
|-- docs/atlas-brief.md   # 给画图方的重制需求：现状问题 + 一致性规则 + 验收
|-- lib/client.js         # 构建产物（已提交，DSH 启动时直接加载）
|-- test/                 # node:test 单测（atlas / state / config / balance / client / host / server）
|-- assets/icon-180.png   # 插件市场图标（从图集待机帧裁出来）
|-- pet.json              # Codex 宠物清单（保留，Codex 端仍可用）
|-- spritesheet.webp      # 图集，同时被 DSH 插件以 /assets 接口提供
|-- USAGE.md              # 原 Codex 桌面端安装说明
`-- README.md
```

## 安装到 DSH

DSH 的插件是「profile 里的一个依赖 + 一条 bundle 记录」。本仓库根目录就是插件包，所以有两种装法。

**方式一：命令行（推荐，路径换成你本地的仓库位置）**

```powershell
dsh plugin --profile desktop add D:\Repos\pet-astra-yao
```

这一步把包装进 profile 的 `node_modules`，并把包名追加到 profile 的 `dsh.profile.bundles`。
如果你用的 DSH 版本没自动追加，就在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 里手动补一行：

```json
"dsh": {
  "profile": {
    "bundles": [ "...原有的那些 bundle...", "dsh-pet-astra-yao" ]
  }
}
```

（`"...原有的那些 bundle..."` 用文件里原本的条目替换，别把别的插件挤掉。）

**方式二：图形界面**

打开 DSH Web 的「设置 → 插件」，用「从本地路径安装」填本仓库的绝对路径，装完点「立即启用」。
插件页会读到 `cordis.patch.yml`，把配置渲染成表单。

**方式三：直接从 GitHub 装（不用先克隆）**

```powershell
dsh plugin --profile desktop add github:hongxin-y/codex-pet-Astra-Yao
```

pnpm 会拉仓库、跑 `prepare` 重新生成 `lib/client.js`。这样装的是独立副本，改代码不会热更新，
开发时用方式一（`link:` 指向工作区）。

装好后刷新页面：右下角出现 Astra Yao 即成功。它和别的桌宠插件（例如 `dsh-pet-remielle`）可以同时存在，
各自记住自己的位置。

改完代码或换了 `spritesheet.webp` 之后：重启一次 DSH（host 与浏览器两半都在启动时装载），
之后刷新页面即可。图集文件本身按 `mtime` + `ETag` 校验，替换图片不需要清浏览器缓存；
只有 host 代码变更才需要重启。

> **DSH 0.2.1-rc.3 起** cordis 会拒绝读取未经 `inject` 声明的服务（`cannot get property "x" without inject`），
> 直接读 `ctx.credentials` 会让 host 半边在启动时静默失败——表现是桌宠只剩气泡、写着「未连接」。
> 本插件（0.1.1+）改成全部通过 `ctx.inject([...], scoped => …)` 取服务，缺服务时功能降级而不是报错。

## 交互

| 操作 | 效果 |
| --- | --- |
| 拖动 | 移动位置（拖动时播放左右跑），松手后坐标存回配置；`locked` 时不可拖 |
| 单击 | 戳一下：原地挥手（图集第 3 行 4 帧），气泡应一句「在呢～／叫我？」；若当前是报错状态，则点一下即「我知道了」，回到待机 |
| 右键 | 打开菜单：显示桌宠、大小、不透明度、动画速度、锁定位置、左右镜像、跟随光标、状态气泡、显示余额、回右下角、我知道了 |
| 隐藏后 | 右下角留一个小圆点，点它把桌宠叫回来 |
| 鼠标移动 | 待机时、且光标距离桌宠 280 px 以内，看向光标（图集第 9–10 行的 16 个朝向）；光标停住约 2.5 秒或离开范围后回到待机动画。可在菜单里关掉「跟随光标」 |

状态在「思考 ↔ 执行」之间抖动时，动画不会跟着一秒一重启：升级（执行、等待、报错）立刻切换，
回落要等当前动作播满 1.5 秒，所以小跑会连续跑下去，而不是原地抽动。

## 状态映射

服务端订阅 DSH 的会话事件，折算成一个状态后再喂给客户端：

| DSH 会话 | 桌宠 |
| --- | --- |
| `turn/start` | 构思中（`review`，托腮） |
| `tool/call`（有工具在跑） | 执行中（`running`，小跑） |
| `ask_user_question` / `exit_plan_mode` / `approval/asked` | 候场中（`waiting`，托腮） |
| `turn/end` 且 `reason.kind === "completed"` | 后台待机 + 谢幕跳一下（`jumping`，5 秒内一次） |
| 工具报错 / 异常结束 | 破音了（`failed`，低头），点一下或开始下一轮对话后恢复 |
| `turn/end` 且 `blocked` | 候场中 |
| `turn/end` 且 `aborted` / `disposed` | 后台待机 |

子会话默认被忽略；把 `includeSubagents` 打开后，子代理的活动也会驱动桌宠。

## 状态气泡与余额

桌宠头顶的气泡会写三行：当前状态、细节（正在跑的工具 / 等你确认的类型 / 报错原文）、当前会话的项目和标题。
状态用她的口吻：**后台待机 / 构思中 / 执行中 / 候场中 / 破音了**——只有「执行中」保留直白说法，
免得看不出是在跑工具。待机时整块换成她的台词，每 9 秒轮换一句：

> 今夜，星光灿烂。 / 这个世界上最闪亮的东西，当然是爱！ / 一段安宁的间奏，正好休息～ /
> 短暂的停顿，会让旋律更甜。 / 要不要听首歌？咳—— / 让旋律带着你走～

前两句出自官方角色介绍与角色 PV 标题，其余取自她的游戏内语音（待机 / 都市漫游），英文语音的条目由本插件译为中文。
任务完成那几秒会先显示「完美谢幕～」。
气泡贴着桌宠所在那一侧的边缘展开，底部的小尖角始终指向桌宠；贴到屏幕顶端放不下时自动翻到桌宠下方。
最小宽度 128 px、最大 240 px，文案变长时换行而不是把气泡撑到半个屏幕。
右键菜单里的「状态气泡」可以整个关掉它。

「显示余额」打开后，第三行换成 DeepSeek 账户余额和今日消耗：

- 服务端通过 DSH 的 `credentials` 服务取 `DEEPSEEK_API_KEY`，请求 `https://api.deepseek.com/user/balance`，
  60 秒缓存，浏览器端每 60 秒最多拉一次（`GET /balance?refresh=1` 可以强制刷新）。
- 今日消耗按「余额下降」累计，账本存在 `%USERPROFILE%\.dsh\.dsh-pet-astra-yao-usage.json`，跨天自动归零；
  充值导致余额上升时不会记成负消耗。
- 没配置 Key、或者当前 DSH 没有暴露 `credentials` 服务时，气泡显示「余额不可用：未配置 API Key」，
  桌宠其它功能不受影响。
- 余额只从你的机器直连 DeepSeek，不经过 DSH 的服务器；接口本身也只接受本机回环请求。

## 配置

配置存在 profile 的 `cordis.patch.yml`（也就是插件页表单背后的那份），字段如下：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用这个插件 |
| `scale` | `1` | 缩放，0.5–2 |
| `opacity` | `1` | 不透明度，0.3–1 |
| `speed` | `1` | 动画速度，0.5–1.6（0.5 最慢，1.6 最快） |
| `mirror` | `false` | 左右镜像 |
| `lookAtPointer` | `true` | 光标靠近时看向光标；新版朝向帧已统一比例，可在菜单里关掉 |
| `locked` | `false` | 锁定位置，禁止拖动 |
| `hidden` | `false` | 隐藏（留一个小圆点） |
| `paused` | `false` | 暂停逐帧动画，只画当前帧 |
| `showBubble` | `true` | 显示头顶状态气泡 |
| `showBubbleUsage` | `false` | 气泡里显示余额和今日消耗 |
| `includeSubagents` | `false` | 子代理是否也驱动桌宠 |
| `posX` / `posY` | `null` | 上次拖到的位置，`null` 表示贴右下角 |

拖拽、菜单里的改动会 `PATCH` 回服务端，服务端再写进配置作用域；下次打开页面自动恢复。

## HTTP 接口

都挂在 `/plugins/dsh-pet-astra-yao` 下，只接受本机回环地址（非回环、Host/Origin 不匹配一律 403）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/state` | 一次快照：插件版本、配置、图集描述、当前会话状态 |
| `GET` `PATCH` `POST` | `/config` | 读配置 / 合并式改配置（未知字段 400） |
| `POST` | `/ack` | 清掉报错状态（桌宠「我知道了」） |
| `GET` | `/balance` | 余额 + 今日消耗（`?refresh=1` 跳过 60 秒缓存） |
| `GET` | `/spritesheet` | 图集本体，`image/webp`（带 `ETag`，按 `mtime` 校验，换图即生效） |
| `GET` | `/manifest` | `pet.json`（同样带 `ETag`） |

客户端不依赖任何前端框架，只用 DSH 的基线模块，所以 `dsh.client.inject` 是空数组。

服务端对 `@deepseek-ai/schemastery` 是「有则用、无则跳」：`dsh plugin add <本地路径>` 的 link 安装不会装这个包的
依赖，拿不到布局描述（schema）时插件照常跑，只是「设置 → 插件」里没有表单；registry 安装则会正常解析。

## 开发

```powershell
npm run build     # 改完 src/client.core.js 后重新生成 lib/client.js
npm run build:atlas # 从已审阅的动作源图重新打包图集（开发依赖 sharp）
npm run verify    # 自检：清单字段、补丁行、bundle、图集尺寸（1536×2288 / v2）
npm test          # node:test：atlas / config / state / balance / client / host / server
npm run test:atlas # Pillow：图集审计脚本的回归用例

# 换图集之后先跑这个（需要 Pillow）：格式、透明度、连续帧数、含道具的占用边界
python scripts/audit-atlas.py spritesheet.webp
```

`lib/client.js` 是提交进仓库的构建产物：DSH 启动时直接读它，不会帮你编译，所以改完源码记得 `npm run build`
再一起提交。

要重新生成图集，把 [`docs/atlas-brief.md`](docs/atlas-brief.md) 直接发给画图方：里面写了交付规格、
11 行各自该画什么，以及结构检查与动画目检的验收范围。`OK` 只代表结构通过，
不能证明人物比例、脚掌接地或动作连贯。此次修复方式及复查记录见 [`docs/atlas-review.md`](docs/atlas-review.md)。

自己写桌宠时可以直接复用 `src/atlas.js`：它只描述 Codex atlas 的几何与动画表（行、帧数、间隔、朝向），
不碰 DOM，也没有依赖。

## 原 Codex 用法

`pet.json` + `spritesheet.webp` 仍然是合法的 Codex 桌宠包，复制到
`%USERPROFILE%\.codex\pets\astra-yao` 即可在 Codex Desktop 里使用，细节见 [USAGE.md](./USAGE.md)。

## 素材说明

像素美术与角色形象来自原仓库，角色「Astra Yao（耀嘉音）」及相关设定的权利归原权利人所有；
本仓库只做桌宠资源的整理与 DSH 插件化，未附带额外许可证。

图集原先存在跑动混跪姿、失败突然躺平、挥手换画、跨行比例变化等问题。
2026-10 的第二轮重绘后，`python scripts/audit-atlas.py spritesheet.webp` 结构性检查全部通过
（每行 198 px 高、脚底基线 203、朝向 16 格人脸离散度 74%），Codex 直接使用图片时也能得到修好的动作：

| 位置 | 当前状态 | 播放 |
| --- | --- | --- |
| 第 1 行（向右跑） | 由第 2 行逐格镜像写入图片 | 原生第 1 行，8 帧；不再额外 `flip` |
| 第 5 行（failed） | 整行站立低落、叹气，无躺平帧 | 完整 8 帧，不跳过任何一列 |
| 第 7 行（工作中） | 复用第 2 行的 6 个不同跑步相位 `[0,1,3,4,5,7]` | 6 帧，120 ms |
| 第 8 行（review） | 统一为抬头托腮、目光变化和眨眼 | 完整 6 帧，360 ms |
| 第 3 行（挥手） | 按待机母版重画：裙子、腿距、麦杖落点与第 0 行对齐，抬手的巴掌在画面右侧 | 单击播完整 4 帧，200 ms |
| 第 9–10 行（16 朝向） | 真正的原地转身：正面 → 侧面 → 背面 → 另一侧 → 正面 | 默认跟随光标（280 px 内），6° 迟滞，可关闭 |

新绘动作使用内置 imagegen，提示词保存在 [`docs/atlas-generation-prompts.md`](docs/atlas-generation-prompts.md)，
源图位于 `assets/atlas-source/`，由 `scripts/pack-atlas.mjs` 统一重建全部 11 行后输出 lossless WebP；
各姿势不单独拉伸，也不裁切人物。

判定标准写在 [`docs/atlas-brief.md`](docs/atlas-brief.md)：跨行共用同一套身体（裙摆、腿距、麦杖落点、
格内水平位置），持杖手固定在画面左侧，朝向 16 格要能看出完整转身。`python scripts/audit-atlas.py spritesheet.webp`
会打印每行的高度/宽度/基线，以及朝向两行的人脸与宽度离散度；客户端另有 6° 迟滞，避免在格子边界来回闪。
