# Privacy Policy / 隐私政策

Effective date: September 15, 2026

This policy applies to the Captcha Helper browser extension published from this repository.

## Summary

Captcha Helper performs CAPTCHA recognition locally on the user's device. The extension does not transmit CAPTCHA images, recognition results, browsing history, settings, diagnostics, or other user data to the developer or to a third-party service.

Captcha Helper has no account system, advertising, analytics, telemetry, or remote OCR API.

## Data processed locally

The extension may process the following information inside the browser:

- pixels from a user-selected or detected CAPTCHA image;
- a temporary capture of the visible page when a CAPTCHA cannot be read directly;
- recognized text, confidence, image dimensions, and arithmetic results;
- page structure needed to locate a matching input field;
- exact hostnames authorized or disabled by the user;
- user-created CAPTCHA bindings containing the website origin, page path, and element selectors;
- extension settings and local model state; and
- up to 20 sanitized diagnostic records.

Diagnostic records may include OCR text, confidence, image dimensions, hostname, field-match outcome, and a bounded error message. They do not include image bytes, data URLs, full page URLs, query strings, passwords, cookies, authentication tokens, arbitrary form contents, or submitted form data.

Manual binding records include a local attempt identifier, binding type, step, result, bounded reason codes, element type, available attribute names, and selector matching statistics. They exclude attribute values, raw selectors, page text, and input values.

This information remains in the browser profile and is not sent to the developer.

## Clipboard

Captcha Helper may write a recognition result to the clipboard when the user explicitly chooses **Copy** or enables the optional copy behavior. Choosing **Copy diagnostics** copies the recent local records, extension version, browser user agent, and interface language in a format suitable for an issue. The extension does not read clipboard contents or submit the copied report.

## Website access

Users choose whether to grant access to all HTTP/HTTPS websites or only selected sites. Site access is used to read a CAPTCHA image, run the page helper, and fill a matching input field after a user-authorized workflow. Permissions can be reviewed, disabled, or removed from the extension settings and browser settings.

For cross-origin CAPTCHA images that cannot be read directly, the extension captures the visible source tab and crops the CAPTCHA locally before recognition. The full capture stays in extension memory; it is not saved, logged, uploaded, or sent to the website. A consent window explains the browser’s required `<all_urls>` permission and lets the user add the current site to selected-site mode or enable all HTTP/HTTPS sites. Both choices request the same browser capture permission; the selected mode controls where the page helper runs automatically. Individually disabled sites remain excluded. User-initiated recognition can also use the browser’s temporary `activeTab` permission.

The Chrome and Edge builds declare the browser debugger permission for the slider Beta to send trusted drag input. The browser may ask the user to confirm this permission during installation or an upgrade. Slider runs can be started manually from the popup or page, or configured for automatic handling in Settings. Slider authorization is independent from OCR authorization and can cover all HTTP/HTTPS sites or an exact hostname list. The debugger connection is detached after every attempt.

Captcha Helper never clicks a submit button and never submits a form automatically.

## Storage and deletion

Settings, CAPTCHA bindings, permission state, and diagnostics are stored through the browser's extension storage APIs. Bindings store element-location rules, excluding URL query strings, fragments, image bytes, and input values. Users can remove a binding from the extension popup, clear diagnostics from the settings page, and remove all locally stored extension data by uninstalling the extension or clearing its storage through the browser.

## Network activity and third parties

The recognition model, ONNX runtime, WebAssembly runtime, scripts, and styles are bundled with the extension. Captcha Helper does not download or execute remote code and does not send recognition requests to an external server.

Websites visited by the user remain subject to their own privacy policies. Captcha Helper does not control those websites.

## Optional support

The support page includes a link to the developer’s Ko-fi page and a WeChat collection QR image bundled with the extension. Viewing the support page or saving the QR image works locally. Clicking the Ko-fi link opens its website in a new tab, where Ko-fi and its payment providers handle any contribution under their own privacy policies. You can also scan the QR image and complete a payment in WeChat under WeChat’s privacy policy. These services make payment details available to the recipient according to their service rules. The extension does not initiate payments or access, collect, or store transaction information.

## Changes

Material changes to this policy will be documented in the repository changelog and published with a new extension version. The effective date above will be updated.

## Contact

For privacy questions, open a repository issue that contains no personal or confidential information. For a sensitive privacy or security report, use the private reporting process described in [SECURITY.md](SECURITY.md).

---

## 中文说明

本政策适用于由本仓库发布的 Captcha Helper 浏览器扩展。

Captcha Helper 在用户设备本地处理验证码，不会把验证码图片、识别结果、浏览历史、设置、诊断记录或其他用户数据发送给开发者或第三方服务。扩展不包含账号系统、广告、分析、遥测或远程 OCR 接口。

扩展可能在浏览器本地处理验证码图片像素、识别文本、置信度、图片尺寸、算术结果、用于定位输入框的页面结构、用户授权或禁用的准确主机名、扩展设置、模型状态以及最多 20 条经过清理的诊断记录。滑块 Beta 还会在内存中处理可见挑战截图、缺口坐标、拖动轨迹参数和结果状态；滑块站点授权与静态 OCR 网站授权分开保存。

诊断记录不会包含图片字节、Data URL、完整网页地址、查询参数、密码、Cookie、身份验证令牌、任意表单内容或已提交的表单数据。这些信息只保留在浏览器配置中，不会发送给开发者。

手动绑定记录包含本地操作编号、绑定类型、步骤、结果、固定的原因代码、元素类型、可用属性名称和定位匹配统计，不包含属性值、原始定位规则、网页文字或输入框内容。

只有在用户明确点击“复制”或启用可选复制行为后，扩展才会把识别结果写入剪贴板。点击“复制诊断信息”会复制最近的本地记录、插件版本、浏览器信息和界面语言，便于粘贴到 Issue；扩展不会读取剪贴板，也不会代为提交复制的报告。

用户可以为静态 OCR 选择所有 HTTP/HTTPS 网站，或只选择指定网站。当跨域验证码无法直接读取时，扩展会在内存中截取来源标签页的可见区域，裁出验证码后在本地识别；完整截图不会保存、记入诊断、上传或发送给网页。授权窗口会说明浏览器要求的 `<all_urls>` 权限，并让用户选择将当前网站加入已选名单，或启用所有 HTTP/HTTPS 网站。两个选项申请相同的浏览器截图权限，所选运行模式决定插件在哪些网站自动工作，单独禁用的网站仍会排除。用户主动识别时也可以使用浏览器提供的 `activeTab` 临时权限。Chrome 和 Edge 用户还可以单独设置滑块网站范围。网站权限仅用于读取验证码图片、运行网页辅助脚本，并在用户授权的流程中填写匹配输入框。扩展不会点击提交按钮，也不会自动提交表单。Chrome 和 Edge 构建中的滑块 Beta 声明浏览器调试权限以发送可信拖动，浏览器可能在安装或升级时要求用户确认；滑块可以从弹窗或页面手动处理，也可以在设置中配置自动处理的网站范围。每次操作后都会立即断开调试连接。

设置、验证码绑定、权限状态和诊断记录通过浏览器扩展存储接口保存在本地。绑定保存网站来源、页面路径和元素定位规则，不包含网址查询参数、片段、图片字节或输入框内容。用户可以在扩展面板删除绑定、在设置页面清除诊断记录，也可以通过卸载扩展或清除扩展存储删除全部本地数据。

识别模型、ONNX 运行时、WebAssembly 运行时、脚本和样式全部随扩展打包。扩展不会下载或执行远程代码，也不会向外部服务器发送识别请求。

“请我喝杯咖啡”页面提供开发者的 Ko-fi 链接和随扩展打包的微信收款码，查看页面和保存图片均在本地完成。点击 Ko-fi 链接会在新标签页打开其网站，支持款项由 Ko-fi 及其支付服务商处理，适用各自的隐私政策；也可以在微信中扫码并完成付款，交易适用微信的隐私政策。这些服务按其规则向收款人提供付款信息。扩展不会发起支付，也不会访问、收集或保存交易信息。

隐私问题可以通过不含个人或机密信息的仓库 Issue 提交。敏感的隐私或安全问题请按照 [SECURITY.md](SECURITY.md) 中的私下报告流程处理。
