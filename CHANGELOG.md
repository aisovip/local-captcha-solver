# Changelog

Features, usability improvements, and fixes in each release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.4.1] - 2026-09-16

### 中文

- 新增“识别后直接填入”开关：开启后识别结果直接填入输入框，不再弹出确认提示，填错时可自行修改。可在“设置 → 静态验证码 → 填写”、首次安装引导或本版本介绍页中开启。[#16](https://github.com/hongshuo-wang/local-captcha-solver/issues/16)
- 识别提示与确认面板不再遮挡验证码图片，会自动移到输入框旁边或下方，方便核对识别结果。[#16](https://github.com/hongshuo-wang/local-captcha-solver/issues/16)

### English

- New “Fill recognized results directly” switch: recognized answers are filled without a confirmation prompt and can be corrected by hand. Enable it in Settings → Static CAPTCHAs → Filling, during first-install setup, or from this release’s introduction. [#16](https://github.com/hongshuo-wang/local-captcha-solver/issues/16)
- Recognition and confirmation prompts no longer cover the CAPTCHA image; they move beside or below the input so you can check each answer. [#16](https://github.com/hongshuo-wang/local-captcha-solver/issues/16)

## [1.4.0] - 2026-09-15

### 中文

- 可以手动指定文字验证码的图片与输入框，或拼图滑块的背景、按钮和轨道。位置保存在本机，下次访问同一网站和页面路径时可继续使用，也能重新指定或删除。[#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)
- 手动绑定遇到问题时，可从“设置 → 诊断”复制操作记录、插件版本和浏览器信息，用于反馈问题。
- 扩展面板根据当前网页提供文字识别或滑块操作，手动指定位置和网站设置可按需展开。
- 识别结果显示在验证码或输入框旁，填写时短暂高亮目标，方便确认填到了哪里。
- 静态与滑块设置先展示运行的网站范围，再集中管理网站、填写偏好和使用引导。
- 界面提供“中文 / EN”直接切换，并记住你的语言选择。
- 首次安装从欢迎页向下滚动完成设置。可选的滑块设置留在同一标签页，支持返回并保留选择；设置页可以重新打开完整入门引导。
- 每个版本都有独立更新介绍和完整记录，可从面板“新功能”或版本记录入口重看，离线也能浏览。
- 部分来自其他网站的验证码图片，现在可以通过本地截图识别。需要额外访问权限时会说明用途，由你选择授权范围。
- 修改网站运行范围后，已打开的网页也会同步生效；验证码刷新或页面变化时会放弃过期结果，避免填入上一张验证码的答案。

### English

- Choose the image and input for a text CAPTCHA, or the background, handle, and track for a puzzle slider. Saved locations stay on your device and can be reused on the same website and page path, changed, or removed. [#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)
- When manual binding fails, copy its activity records, extension version, and browser information from Settings → Diagnostics to include in an issue.
- The popup offers text recognition or slider handling to match the current page. Expand manual location selection and site settings when needed.
- Results appear beside the CAPTCHA or input, with a brief highlight showing where an answer was filled.
- Static and slider settings begin with site access, followed by site management, filling preferences, and setup help.
- Switch directly between 中文 and EN. The extension remembers your language choice.
- Scroll from the welcome page through first-install setup. Optional slider setup stays in the same tab, with Back and your choices preserved. Reopen the complete getting-started guide from Settings.
- Every version has its own introduction and full notes. Revisit them through What’s new or Release history in the popup, including offline.
- Some CAPTCHA images served by another website can now be recognized from a local screenshot. When extra access is needed, the extension explains why and lets you choose its scope.
- Site-access changes also apply to open pages. Refreshed CAPTCHAs and page changes discard outdated results to avoid filling an answer for the previous image.

## [1.3.3] - 2026-09-11

### 中文

- 修复开启自动滑块处理后，点击 B 站首页搜索框会意外执行搜索的问题。搜索框可以正常输入和使用。

### English

- Fixed unintended searches when clicking Bilibili’s homepage search box with automatic slider handling enabled. You can type and search normally.

## [1.3.2] - 2026-09-11

### 中文

- 拼图滑块 Beta 支持阿里云弹窗拼图，并改善相似缺口的判断，减少拖错位置的情况。
- 在滑块“所有网站”模式下，可以单独停用某个网站，刷新页面后仍保留选择。需要恢复时，可到滑块设置中的已禁用网站列表操作。[#14](https://github.com/hongshuo-wang/local-captcha-solver/issues/14)

### English

- Puzzle-slider Beta now handles Aliyun popup puzzles and better distinguishes similar gaps to reduce incorrect drag destinations.
- Turn off slider handling for individual websites in all-sites mode and keep that choice after a page refresh. Restore a site from the disabled-site list in Slider settings. [#14](https://github.com/hongshuo-wang/local-captcha-solver/issues/14)

## [1.3.1] - 2026-08-26

### 中文

- 改善奇安信登录页的滑块定位，并修复 GeeTest 验证码刷新、重置或登录失效后，新滑块无法继续自动处理的问题。[#11](https://github.com/hongshuo-wang/local-captcha-solver/issues/11)
- 已完成的滑块不会重复拖动；位置不够确定时交由你处理，减少误拖动。
- 验证成功后，点击页面其他位置可以正常操作，不会误触发滑块暂停提示。
- 修复部分使用较旧 Chromium 内核的浏览器中，滑块功能无法启动的问题。[#12](https://github.com/hongshuo-wang/local-captcha-solver/issues/12)
- 当前页检测到拼图滑块时，打开扩展面板会直接显示滑块操作。

### English

- Improved slider positioning on the Qianxin sign-in page and fixed automatic handling of new GeeTest challenges after a refresh, reset, or expired login. [#11](https://github.com/hongshuo-wang/local-captcha-solver/issues/11)
- Completed sliders are not dragged again. Uncertain positions are left for you to handle, reducing incorrect drags.
- Clicking elsewhere on the page after successful verification no longer triggers an unintended slider pause notice.
- Fixed slider handling failing to start in some browsers using older Chromium versions. [#12](https://github.com/hongshuo-wang/local-captcha-solver/issues/12)
- The popup shows slider actions directly when a puzzle slider is detected on the current page.

## [1.3.0] - 2026-08-26

### 中文

- 新增 Firefox 支持，可在本机识别常见文字与算术验证码，并使用自动填入、扩展面板、图片右键识别和设置管理。[#10](https://github.com/hongshuo-wang/local-captcha-solver/issues/10)
- Firefox 引导页和面板会说明可用功能。静态文字验证码可在 Firefox 中使用；拼图滑块 Beta 适用于桌面版 Chrome 和 Edge。

### English

- Added Firefox support for local text and arithmetic CAPTCHA recognition, automatic filling, popup actions, image context-menu recognition, and Settings. [#10](https://github.com/hongshuo-wang/local-captcha-solver/issues/10)
- Firefox setup and popup explain which features are available. Static text CAPTCHAs work in Firefox; puzzle-slider Beta is available in desktop Chrome and Edge.

## [1.2.0] - 2026-08-23

### 中文

- 可以为单个网站选择纯数字、纯英文、英数混合或算术验证码类型，也能在设置页恢复自动判断。
- 新增拼图滑块 Beta，支持常见的单缺口水平拼图。可单独选择在所有网站或指定网站运行，并从 GeeTest 演示页体验。
- 安装后可在独立欢迎页了解并设置文字与滑块验证码；更新后会打开一次新功能介绍。
- 滑块设置会说明浏览器所需的调试权限，以及拖动期间可能出现的浏览器提示，方便你决定是否开启。

### English

- Choose digits, English letters, alphanumeric, or arithmetic recognition for individual websites. Restore automatic type detection from Settings.
- Added puzzle-slider Beta for common single-gap horizontal puzzles. Choose all sites or selected sites independently, and try it on the GeeTest demo page.
- A standalone welcome page introduces text and slider setup after installation. An update introduction opens once after upgrading.
- Slider settings explain the required debugging permission and the browser notice that may appear during a drag, so you can decide whether to enable it.

## [1.1.0] - 2026-08-02

### 中文

- 面板新增“立即识别当前页”，可在未开启网站自动识别时，手动识别一次。
- 引导页、面板、设置页和网页内结果提示跟随系统浅色与深色模式。
- 改善旧式登录页的验证码图片与输入框匹配，修复部分政企网站识别成功却找不到填写位置的问题。
- 首次设置会说明网站访问范围，由你选择在指定网站或所有网站运行；完成后关闭引导页。
- 填写与复制成功后显示短暂通知；需要你确认结果、授权或处理已有输入内容时，保留操作提示，并尽量避开登录、提交和验证码刷新按钮。

### English

- Added Recognize this page now to the popup for one-time recognition on sites where automatic recognition is off.
- Setup, popup, Settings, and in-page results follow the system’s light or dark theme.
- Improved CAPTCHA image and input matching on older login pages, fixing cases where recognition succeeded but the answer field could not be found.
- First-install setup explains site access and lets you choose selected sites or all sites. The guide closes when setup is complete.
- Successful fills and copies show brief notifications. Prompts remain available when you need to confirm an answer, grant access, or handle existing input, and stay clear of login, submit, and CAPTCHA refresh buttons where possible.

## [1.0.0] - 2026-07-31

### 中文

- 首次提供 Chrome 和 Microsoft Edge 扩展，在本机识别常见的数字、英文字母、英数混合和一步整数算术验证码。
- 可靠结果可以自动填入；不够确定时由你填写，表单始终由你提交。
- 可选择所有网站或指定网站授权，并管理已授权和已禁用的网站。
- 首次安装有独立引导，设置页面集中管理网站范围和填写偏好。
- 支持扩展面板、图片右键菜单、鼠标快捷操作和可选的结果复制。
- 本地识别遇到问题时，可以重试，并查看或复制本机诊断记录以便排查。
- 界面支持简体中文和英文。
- 验证码图片和识别结果留在你的设备上，使用时无需注册账号。

### English

- First release for Chrome and Microsoft Edge, recognizing common digits, English letters, alphanumeric strings, and one-step integer arithmetic CAPTCHAs locally.
- Reliable answers can be filled automatically. Uncertain answers are left for you to enter, and you always submit the form.
- Choose all-site or selected-site access and manage authorized and disabled websites.
- A standalone first-install guide introduces setup, with site access and filling preferences managed in Settings.
- Recognize through the popup, image context menu, or mouse shortcuts, with optional answer copying.
- Retry local recognition when needed, and view or copy local diagnostic records to help resolve a problem.
- The interface supports Simplified Chinese and English.
- CAPTCHA images and results stay on your device. No account is required.

[Unreleased]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/hongshuo-wang/local-captcha-solver/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/hongshuo-wang/local-captcha-solver/releases/tag/v1.0.0
