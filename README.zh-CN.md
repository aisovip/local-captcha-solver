<div align="center">
  <img src="public/brand/captcha-helper.svg" width="112" height="112" alt="Captcha Helper 标志">
  <h1>Captcha Helper · 本地验证码助手</h1>
  <p>在 Chrome、Edge 和 Firefox 本地识别常见静态文字验证码。</p>
  <p><a href="README.md">English</a></p>
  <p>
    <a href="https://github.com/hongshuo-wang/local-captcha-solver/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/hongshuo-wang/local-captcha-solver/ci.yml?branch=main&label=CI" alt="CI 状态"></a>
    <a href="https://github.com/hongshuo-wang/local-captcha-solver/releases"><img src="https://img.shields.io/github/v/release/hongshuo-wang/local-captcha-solver?display_name=tag&sort=semver" alt="最新版本"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/hongshuo-wang/local-captcha-solver" alt="MIT 许可证"></a>
    <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3"></a>
    <a href="https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/"><img src="https://img.shields.io/badge/Firefox-MV3-FF7139?logo=firefoxbrowser&logoColor=white" alt="Firefox Manifest V3"></a>
    <a href="https://linux.do"><img src="https://img.shields.io/badge/linux.do-社区-1f1f1f" alt="linux.do 社区"></a>
  </p>
</div>

![Captcha Helper 引导选择验证码图片与输入框](public/guide/binding-zh.png)

Captcha Helper 是一款支持 Chrome、Edge 和 Firefox 的开源浏览器扩展，完全在用户设备上识别常见静态文字验证码。Chrome 和 Edge 构建还可以处理单缺口拼图滑块。它可以把可靠结果填入唯一匹配的空输入框，但不会点击提交按钮，也不会提交表单。

项目不需要账号，不包含广告和遥测，不依赖远程 OCR 服务，也不会在运行时下载模型。用户可以授权所有 HTTP/HTTPS 网站，也可以只维护一个精确的网站允许列表。

## 支持范围

项目有意只支持包含以下内容的静态单图片验证码：

- 纯数字；
- 大写或小写英文字母；
- 英文字母与数字组合；
- 使用 `+`、`-`、`*`、`/`、`x`、`X`、`×` 或 `÷` 的一步整数算术。

算式可以使用 `=?`、`=`、`?` 或无后缀形式。减法结果必须非负，除法必须整除。图片选择、动画、行为验证、非拉丁文字、小数、余数、负数结果和多步数学不在静态 OCR 范围内。

独立的拼图滑块 Beta 支持桌面 Chrome/Edge、单个缺口、水平轨道和可稳定读取视觉资源的挑战。它采用通用定位逻辑，并已在 [GeeTest 演示页](https://2captcha.com/demo/geetest) 和 Z.ai 登录页的阿里云弹窗拼图上验证。在设置中可以选择所有 HTTP/HTTPS 网站，或只选择精确网站名单。处理滑块会使用浏览器的 `debugger` 权限发送可信拖动，浏览器可能在安装或升级时显示确认提示。遇到结构不明确、挑战变化、定位置信度不足或服务端拒绝时会停止并交还用户。

## 安装

### 浏览器应用商店

也可以从官方浏览器应用商店直接安装：

- [Microsoft Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/captcha-helper-%E6%9C%AC%E5%9C%B0%E9%AA%8C%E8%AF%81%E7%A0%81%E5%8A%A9%E6%89%8B/pibbaaacfjbfcoahjfhnbfdlefgjfbfd)
- [Chrome 应用商店](https://chromewebstore.google.com/detail/captcha-helper-%E6%9C%AC%E5%9C%B0%E9%AA%8C%E8%AF%81%E7%A0%81%E5%8A%A9%E6%89%8B/jdpjgicecfidnfbpfdnihpjhpjcahada?hl=zh-CN&utm_source=ext_sidebar)

### GitHub Release

从 [GitHub Releases](https://github.com/hongshuo-wang/local-captcha-solver/releases) 下载对应浏览器的 ZIP 和 `SHA256SUMS.txt`，并校验文件。Chrome 和 Edge 在扩展管理页中以开发者模式加载解压目录。Firefox 在 `about:debugging#/runtime/this-firefox` 中选择解压目录内的 `manifest.json`；手动载入的 Firefox 扩展会保留到浏览器重启。

### 从源码构建

需要 Node.js 22 或更高版本以及 npm。Firefox 构建需要 Firefox 142 或更高版本。

```sh
git clone https://github.com/hongshuo-wang/local-captcha-solver.git
cd local-captcha-solver
npm ci
npm run build
```

打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择 `.output/chrome-mv3`。Edge 用户运行 `npm run build:edge` 后，在 `edge://extensions` 中加载 `.output/edge-mv3`。Firefox 用户运行 `npm run build:firefox`，打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，然后选择 `.output/firefox-mv3/manifest.json`。

## 使用方法

1. 从欢迎页向下滚动，选择网站范围与填写方式，也可以使用导航按钮。默认选择指定网站；点击“完成设置”时保存选择并请求所需的网站权限。可从设置侧栏的“入门引导”重看。
2. 推荐开启可靠结果自动填写，按需选择找不到输入框时是否复制。完成后可体验本地识别，或在同一标签页设置 Chrome/Edge 的滑块功能；滑块设置支持返回，并有独立的完成界面。
3. 在网页中打开扩展，面板会根据当前验证码提供操作；展开“此网站的设置”，可调整自动处理和文字验证码类型。
4. 在验证码或输入框旁查看结果，需要确认时选择填入或复制，再自行提交表单。

### 手动绑定验证码

自动检测遗漏验证码时，先在网页中打开验证码，再展开扩展面板的“找不到验证码？手动指定位置”。选择验证码类型，点击“开始绑定”和“开始选择”。文字验证码依次选择图片和输入框；Chrome/Edge 的拼图滑块依次选择背景图片、拖动按钮和轨道空白处。检查高亮目标，点击“保存并识别”。选择过程中可返回上一步，用“移动引导”避开目标，按 Esc 取消。

绑定保存在本机，按网站来源（协议、主机名、端口）和当前页面路径生效。刷新验证码、重新打开弹窗或重新进入同一路径时，插件重新定位目标。扩展面板提供重新绑定和删除入口。自动处理遵循静态验证码和滑块各自的本站开关。

文字绑定适用于当前页面中的图片和可编辑文字输入框；滑块绑定适用于现有单缺口拼图流程。绑定目标缺失、出现多个匹配或滑块结构不适用时会停止处理，可打开验证码后重试或重新绑定。嵌入网页（iframe）和 Shadow DOM 内的元素暂不支持绑定。识别置信度、已有输入保护和滑块停止条件继续生效。

### 拼图滑块

拼图滑块功能适用于 Chrome 和 Edge。Firefox 提供静态验证码识别流程；推荐使用 Chrome 或 Edge 体验完整插件功能。

1. 打开“设置 -> 拼图滑块验证码”。
2. 选择“所有网站”或“仅指定网站”。默认的指定网站模式更谨慎，可以逐个添加精确主机名。
3. 如果浏览器提示，请确认 `debugger` 权限。它只在手动处理或已开启自动处理的网站上发送拖动，单次操作结束后立即断开。
4. 使用 [GeeTest 演示页](https://2captcha.com/demo/geetest) 测试。

插件只会在启用的网站等待唯一可见滑块，确认页面和用户操作稳定后再拖动；定位或结果不确定时会停止，不会猜测。

在“所有网站”模式下，可以展开扩展面板的“此网站的设置”，关闭“自动处理滑块”，单独停用当前网站。停用状态会在刷新页面和重启浏览器后保留；可以在弹窗重新开启，或在“设置 → 拼图滑块验证码 → 已禁用网站”中恢复。此设置按准确主机名生效，与静态验证码开关分开保存。

### 本次更新

每次版本更新都会打开一次独立介绍页。1.4.0 介绍手动绑定、随网页变化的扩展面板，以及验证码旁的结果提示。点击面板右上角“新功能”可随时重看。“版本记录”位于面板底部和设置 → 关于，按日期列出各版主要变化，点击可打开该版本的介绍与完整更新记录，离线也能查看。点击“开始使用”即可回到工作。滑块设置可从设置页单独进入。仓库中的完整记录见 [CHANGELOG.md](CHANGELOG.md)。

“识别成功”和“允许自动填入”是两个独立判断。自动填入要求结果达到对应类别的置信度阈值，并且页面中只有一个符合条件的空输入框。已有输入不会在未经确认时被替换。算式结构不明确或识别置信度不足时，扩展会拒绝填写而不是猜测。

如果已知某个网站的验证码字符范围，可以在弹窗中按精确主机名设置纯数字、纯英文、英数混合或算术模式。该设置直接约束 CTC 解码字符集，不会在识别后强制替换字符；自动识别、弹窗、快捷操作和右键入口采用同一规则，并可在设置页恢复为自动判断。

### 跨域验证码授权

当前页面与验证码图片的域名或端口不同时，插件会优先读取已经显示的图片；直接读取受限时，使用浏览器截图在本地裁出验证码。验证码需要完整位于可见区域。

缺少截图权限时，授权窗口会列出页面和图片的来源，并提供“仅添加此网站”“在所有网站启用”和“暂不授权”。浏览器要求 `<all_urls>` 权限才能自动截图，两个启用选项申请相同的浏览器权限；前者将当前网站加入已选名单并使用指定网站模式，后者使用所有 HTTP/HTTPS 网站模式。已单独禁用的网站会继续排除。授权成功后，插件会继续识别当前验证码。

可以在“设置 → 静态验证码”调整运行范围，在浏览器的扩展权限设置中撤销网站访问权限。截图只在本地处理，完整页面截图不会保存或上传。

## 隐私与权限

验证码图片、识别结果、设置和经过清理的诊断记录都保留在浏览器中。完整的数据处理说明见[隐私政策](PRIVACY.md)。

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 用户明确操作后临时访问当前页面。 |
| `clipboardWrite` | 通过明确命令或可选设置复制结果；扩展不能读取剪贴板。 |
| `contextMenus` | 为网页图片添加由用户主动触发的识别命令。 |
| `debugger`（Chrome/Edge） | 在手动处理滑块，或设置中配置的自动处理网站上发送可信鼠标输入；每次尝试结束后都会断开连接。 |
| `offscreen`（Chrome/Edge） | 在 Manifest V3 离屏文档中运行内置 ONNX/WebAssembly 模型；Firefox 在扩展后台页运行同一本地模型。 |
| `scripting` | 用户授权后安装页面辅助脚本。 |
| `storage` | 在本地保存设置、权限状态、模型状态和最多 20 条经过清理的诊断记录。 |
| 可选网站权限 | 按网站授权页面辅助脚本；自动截取跨域验证码时会说明并申请 `<all_urls>`，插件自动运行范围仍由所选网站模式决定。Chrome/Edge 拼图滑块的网站范围单独管理。 |

## 模型

生产模型为 `paddle-ctc-v4-decoupled-320k`，大小 2.24 MB，由 PP-OCRv6 tiny 文字识别网络派生。模型使用 PPLCNetV4 tiny 主干和 PaddleOCR 识别头中的 CTC 分支：

```text
图片 -> BGR 缩放/补边至 [3, 48, 320] -> PPLCNetV4 tiny -> CTC head
     -> 71 类概率 -> CTC 解码 -> 普通文本或算术答案
```

固定字符表包含 70 个可见字符，第 0 类是 CTC blank。导出的 ONNX 模型通过 ONNX Runtime Web 和扩展内置的 WASM 资源运行。同一个模型处理数字、字母、英数字和算术，再由分类解码与置信度阈值决定是否返回结果或自动填入。

### 训练数据

已批准模型的数据清单包含 255,183 张唯一图片：

| 划分 | 来源 | 图片数 | 用途 |
| --- | --- | ---: | --- |
| 训练 | 四个已记录许可证的公开数据集 | 145,183 | 补充真实生成器分布 |
| 训练 | 确定性合成分组 | 100,000 | 平衡内容与视觉增强 |
| 验证 | 完全隔离的合成分组 | 10,000 | 模型选择与阈值校准 |

实际训练使用确定性的 320,000 行平衡标签清单：数字、字母、英数字和算术各 80,000 行。公开来源的许可证为 CC-BY-4.0、CC0-1.0 或 Apache-2.0，并记录在数据源目录中。`training/ppocrv6-captcha/data/manifest.json` 为每张图片保存精确标签、SHA-256、来源、许可证 id、场景分组和数据划分。

任何 `group` 都不能跨越数据划分，冻结基准图片的哈希会被训练与验证预检拒绝。合成生成器覆盖字体、颜色和对比度、旋转、错切、字符间距、波形、描边、阴影、噪点、干扰线、模糊、重采样和压缩退化。

### 模型质量

| 评估项 | 结果 |
| --- | ---: |
| 10,000 张隔离验证集上的自动填入精确率 | 99.587% |
| 同一验证集上的自动填入覆盖率 | 82.38% |
| 冻结 201 张基准集整串/填入准确率 | 98.01% |
| 冻结算术答案准确率 | 100% |
| Apple M4 Pro 上 Chrome 热启动 P95 | 11.70 ms |
| Apple M4 Pro 上 Edge 热启动 P95 | 12.50 ms |

这些数据只代表冻结语料和文档记录的参考环境，不代表所有网站。完整的数据来源、分类与运算符结果、模型哈希、Paddle-to-ONNX 一致性和浏览器验证见[模型卡](training/ppocrv6-captcha/model-cards/paddle-ctc-v4-decoupled-320k.md)。

## 重新训练模型

固定参考环境使用 PaddleOCR `v3.7.0`（commit `b03f46425e8ff4442b268ce449e3eef758146cd4`）、PaddlePaddle `3.2.0`、Python `3.12.11`、Node.js 22 和随机种子 `20260728`。GPU 环境必须安装匹配的 PaddlePaddle 构建，并在新模型卡中记录 CUDA、cuDNN、驱动和软件包版本。

### 准备数据

```sh
npm ci
npm run training:ppocrv6:fetch

npm run training:public:fetch -- mathcaptcha10k-v6
npm run training:public:fetch -- parsasam-captcha-v1
npm run training:public:fetch -- huthayfahodeb-captcha-v2
npm run training:public:fetch -- daniilnxy-math-problem-captcha-v1

npm run training:public:import -- mathcaptcha10k-v6
npm run training:public:import -- parsasam-captcha-v1
npm run training:public:import -- huthayfahodeb-captcha-v2
npm run training:public:import -- daniilnxy-math-problem-captcha-v1

npm run training:synthetic:generate
npm run training:labels:balance -- 80000
npm test -- tests/training
```

下载文件、解压后的数据集、生成图片、checkpoint 和训练输出都被 Git 忽略。启用任何新的公开数据源前，必须先审核许可证、版本与压缩包哈希。

### 在全新环境中训练

克隆固定版本的 PaddleOCR，并安装 `training/ppocrv6-captcha/python-environment.txt`。官方模型使用的字符集与本项目不同，因此先冻结主干网络并用 3 个 epoch 预热新识别头，再用 60 个 epoch 微调整个模型：

```sh
PADDLEOCR_ROOT=/absolute/path/to/PaddleOCR-v3.7.0 \
  training/ppocrv6-captcha/.venv/bin/python \
  training/ppocrv6-captcha/train_head_warmup.py \
  -c training/ppocrv6-captcha/config.yml -o \
  Global.epoch_num=3 \
  Global.save_model_dir=./training/ppocrv6-captcha/output/clean-warmup

PADDLEOCR_ROOT=/absolute/path/to/PaddleOCR-v3.7.0 \
  training/ppocrv6-captcha/.venv/bin/python \
  /absolute/path/to/PaddleOCR-v3.7.0/tools/train.py \
  -c training/ppocrv6-captcha/config.yml -o \
  Global.epoch_num=60 \
  Global.pretrained_model=./training/ppocrv6-captcha/output/clean-warmup/latest.pdparams \
  Global.save_model_dir=./training/ppocrv6-captcha/output/clean-full
```

如果要针对新的授权场景继续训练，应创建新的 candidate id，以较低学习率从生产 checkpoint 开始实验，并保留生产模型作为基线。调参前先加入隔离的失败样本；禁止使用 issue 截图或基准样本训练。

环境安装、续训、Paddle 导出、ONNX 转换、一致性检查、阈值校准、冻结基准以及 Chrome/Edge 离线验证的完整命令见[生产模型复现手册](docs/production-model-reproduction.md)。场景贡献和数据隔离规则见[模型训练与场景贡献](docs/model-training.md)。

生产模型替换仍必须达到至少 99.5% 自动填入精确率、80% 覆盖率、3 秒冷启动和 500 ms 热启动 P95。结果必须按类别、来源、场景分组和算术符号分别报告。算术运算符缺失或证据不足时必须拒绝填写，不能回退成纯数字结果。

## 开发

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run build:edge
npm run test:e2e:extension
```

## 参与贡献

提交 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。新的验证码样式必须提供已授权样本、精确标签、来源与许可证、隔离分组、失败的留出基准，以及当前覆盖缺失的视觉机制说明。安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

项目讨论和开发交流也欢迎前往 [linux.do](https://linux.do)。可复现的 Bug 和场景贡献仍应提交到本仓库，以便检索、测试和跟踪。

## 支持开发

如果 Captcha Helper 帮你省了些时间，欢迎通过 [Ko-fi](https://ko-fi.com/hongshuowang) 或下方微信收款码请我喝杯咖啡，支持我继续维护。金额随心，所有功能免费使用。

<img src="public/support/wechat.png" width="240" alt="Hongshuo Wang 的微信收款二维码" />

使用微信扫一扫，或[保存图片](public/support/wechat.png)后在扫一扫中从相册选取。插件面板底部和**设置 → 关于**的“请我喝杯咖啡”页面也提供这两种支持方式。

谢谢你的使用、反馈和支持。

## 许可证

源代码使用 [MIT License](LICENSE)。内置模型、运行时组件、数据集、字体和派生资源保留各自的声明与许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `third_party/`。
