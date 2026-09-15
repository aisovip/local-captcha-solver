<div align="center">
  <img src="public/brand/captcha-helper.svg" width="112" height="112" alt="Captcha Helper logo">
  <h1>Captcha Helper</h1>
  <p>Local, privacy-first text CAPTCHA recognition for Chrome, Edge, and Firefox.</p>
  <p><a href="README.zh-CN.md">简体中文</a></p>
  <p>
    <a href="https://github.com/hongshuo-wang/local-captcha-solver/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/hongshuo-wang/local-captcha-solver/ci.yml?branch=main&label=CI" alt="CI status"></a>
    <a href="https://github.com/hongshuo-wang/local-captcha-solver/releases"><img src="https://img.shields.io/github/v/release/hongshuo-wang/local-captcha-solver?display_name=tag&sort=semver" alt="Latest release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/hongshuo-wang/local-captcha-solver" alt="MIT license"></a>
    <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3"></a>
    <a href="https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/"><img src="https://img.shields.io/badge/Firefox-MV3-FF7139?logo=firefoxbrowser&logoColor=white" alt="Firefox Manifest V3"></a>
    <a href="https://linux.do"><img src="https://img.shields.io/badge/linux.do-community-1f1f1f" alt="linux.do community"></a>
  </p>
</div>

![Captcha Helper guided selection of a CAPTCHA and its input](public/guide/binding-en.png)

Captcha Helper is an open-source browser extension for Chrome, Edge, and Firefox that recognizes common static text CAPTCHAs entirely on the user's device. Chrome and Edge builds can also handle single-gap puzzle sliders. It can fill a reliable text result into one matching empty field, but it never clicks a submit button or submits a form.

There is no account, advertising, telemetry, remote OCR service, or runtime model download. Users can authorize every HTTP/HTTPS site or maintain an exact list of allowed sites.

## Supported scope

The project intentionally supports one static image containing:

- digits;
- uppercase or lowercase English letters;
- alphanumeric strings; or
- one-step integer arithmetic using `+`, `-`, `*`, `/`, `x`, `X`, `×`, or `÷`.

Arithmetic images may end in `=?`, `=`, `?`, or no suffix. Subtraction produces nonnegative answers and division must be exact. Image selection, animation, behavioral challenges, non-Latin scripts, decimals, remainders, negative results, and multi-step mathematics are outside the static OCR scope.

The separate puzzle-slider Beta supports desktop Chrome/Edge single-gap horizontal challenges with stable visible image resources. It is provider-neutral and has been checked with the [GeeTest demo](https://2captcha.com/demo/geetest) and the Aliyun popup puzzle on the Z.ai sign-in page. In Settings, slider handling can be configured for all HTTP/HTTPS sites or for an exact list of sites. It uses the browser `debugger` permission to send trusted drag input, and the browser may show a confirmation prompt during installation or an upgrade. Ambiguous, changing, low-confidence, or rejected challenges are left for the user.

## Installation

### Browser stores

Install the extension directly from the official browser stores:

- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/captcha-helper-%E6%9C%AC%E5%9C%B0%E9%AA%8C%E8%AF%81%E7%A0%81%E5%8A%A9%E6%89%8B/pibbaaacfjbfcoahjfhnbfdlefgjfbfd)
- [Chrome Web Store](https://chromewebstore.google.com/detail/captcha-helper-%E6%9C%AC%E5%9C%B0%E9%AA%8C%E8%AF%81%E7%A0%81%E5%8A%A9%E6%89%8B/jdpjgicecfidnfbpfdnihpjhpjcahada?hl=zh-CN&utm_source=ext_sidebar)

### GitHub Release

Download the ZIP for your browser and `SHA256SUMS.txt` from [GitHub Releases](https://github.com/hongshuo-wang/local-captcha-solver/releases), then verify its checksum. Chrome and Edge load the extracted directory from their developer-mode extension pages. Firefox loads `manifest.json` from the extracted Firefox directory through `about:debugging#/runtime/this-firefox`; a manually loaded Firefox extension remains installed until Firefox restarts.

### Build from source

Requirements: Node.js 22 or later and npm. The Firefox build requires Firefox 142 or later.

```sh
git clone https://github.com/hongshuo-wang/local-captcha-solver.git
cd local-captcha-solver
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`. For Edge, run `npm run build:edge` and load `.output/edge-mv3` from `edge://extensions`. For Firefox, run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

## Usage

1. Scroll from the welcome page into site access and filling preferences, or use the navigation buttons. Selected sites is the default. **Finish setup** saves your choices and requests any required site access. Revisit the journey from **Getting started** in the Settings sidebar.
2. Keep automatic filling enabled for reliable results, and choose whether answers should be copied when no input is found. After setup, try local recognition or configure Chrome/Edge sliders in the same tab. Slider setup has a Back action and its own completion screen.
3. Open the extension on a website. The popup offers the action for the current CAPTCHA; expand site settings to manage automatic handling and the text format.
4. Review results beside the CAPTCHA or input. Choose Fill or Copy when confirmation is needed, then submit the form yourself.

### Manual CAPTCHA binding

When automatic detection misses a CAPTCHA, open it on the page and expand **Can’t find it? Choose its location** in the extension popup. Choose the CAPTCHA type, then **Start binding** and **Start selecting**. For text CAPTCHAs, select the image and input. For Chrome/Edge puzzle sliders, select the background image, drag handle, and an empty part of the track. Check the highlighted targets, then choose **Save & recognize**. Use **Back** to adjust a selection, **Move guide** to uncover a target, or Esc to cancel.

Bindings are saved locally for the website origin (scheme, hostname, and port) and current page path. Targets are located again after an image refresh, popup reopening, or page reload. Rebind or remove them from the extension popup. Automatic handling follows the existing text and slider site switches.

Text bindings support images and editable text fields in the current document. Slider bindings use the existing single-gap puzzle workflow. Missing or ambiguous targets and unsupported slider geometry stop processing. Open the CAPTCHA again or rebind its targets. Elements inside iframes or Shadow DOM are not currently supported. Recognition confidence, existing-input protection, and slider stopping conditions still apply.

### Puzzle sliders

Puzzle-slider controls are available in Chrome and Edge. Firefox provides the static CAPTCHA recognition workflow; use Chrome or Edge for the complete extension feature set.

1. Open Settings -> Puzzle sliders.
2. Choose `All sites` or `Selected sites only`. The selected-site mode is the safer default and lets you add exact hostnames.
3. Confirm the browser `debugger` permission if the browser requests it. It is used only during a manual run or an automatic run on an enabled site, then detached.
4. Test with the [GeeTest demo](https://2captcha.com/demo/geetest).

The extension monitors enabled sites for a unique visible slider, waits for the page and user input to settle, verifies the challenge again before dragging, and stops instead of guessing when the geometry or result is uncertain. Manual handling from the popup is available even when automatic slider handling is off, subject to site access and debugger permission.

In `All sites` mode, expand **Settings for this site** in the popup and turn off **Handle sliders automatically** to disable automatic slider handling for the current site. This choice persists across page reloads and browser restarts. Turn it back on in the popup or restore the site under Settings -> Puzzle sliders -> Disabled sites. The setting applies to the exact hostname and is stored separately from static CAPTCHA settings.

### What’s new

Every version update opens its introduction once. Version 1.4.0 introduces guided manual binding, a popup that adapts to the page, and results beside their targets. Use **What’s new** in the popup header to reopen the page. **Release history** in the popup footer or Settings → About lists all versions with dates and highlights. Each version has its own introduction and full release notes, available offline. Choose **Start using** to return to your work. Slider setup can be opened separately from Settings. The same full records are available in [CHANGELOG.md](CHANGELOG.md).

Recognition and automatic filling are separate decisions. Automatic filling requires a result above the category-specific confidence threshold and one unique eligible empty field. Existing input is never replaced without confirmation. Structurally ambiguous arithmetic and low-confidence results are rejected instead of guessed.

For sites with a known CAPTCHA alphabet, the popup can store an exact-host override for digits, English letters, alphanumeric text, or arithmetic. The selected alphabet constrains CTC decoding directly; it does not rewrite characters after recognition. Overrides apply to automatic, popup, shortcut, and context-menu recognition and can be restored to automatic detection from Settings.

### Cross-origin CAPTCHA access

When a CAPTCHA image comes from another domain or port, the extension first tries to read the displayed image directly. If the browser restricts that access, it captures the source tab and crops the visible CAPTCHA locally.

If capture access is missing, a consent window shows the page and image origins and offers **Add this site only**, **Enable on all websites**, and **Not now**. Automatic capture requires the browser’s `<all_urls>` permission for either enabling choice. The first adds the current site to the selected-site list and uses selected-site mode; the second enables all HTTP/HTTPS sites. Individually disabled sites remain excluded. Recognition resumes after permission is granted.

Manage the operating scope under **Settings → Static CAPTCHAs** and revoke browser access in the browser’s extension permission settings. The entire CAPTCHA must be visible. Full-page captures are never saved or uploaded.

## Privacy and permissions

CAPTCHA images, recognition results, settings, and sanitized diagnostics remain in the browser. See the [Privacy Policy](PRIVACY.md) for the complete data-handling description.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily access the active page after an explicit user action. |
| `clipboardWrite` | Copy a result through an explicit command or optional setting; the extension cannot read the clipboard. |
| `contextMenus` | Add user-initiated recognition for page images. |
| `debugger` (Chrome/Edge) | Send trusted mouse input only for a manually requested slider run or a slider site explicitly enabled by the user; the connection is detached after every attempt. |
| `offscreen` (Chrome/Edge) | Run the bundled ONNX/WebAssembly model in a Manifest V3 offscreen document. Firefox runs the same local model in its background extension page. |
| `scripting` | Install the page helper after the user grants access. |
| `storage` | Store settings, permission state, model state, and up to 20 sanitized diagnostic records locally. |
| Optional hosts | Grant page-helper access by site. Automatic cross-origin capture explains and requests `<all_urls>`; automatic operation follows the chosen website scope. Chrome/Edge puzzle-slider scope is managed independently. |

## Model

The production model is `paddle-ctc-v4-decoupled-320k`, a 2.24 MB recognition model derived from the PP-OCRv6 tiny recognition network. It uses a PPLCNetV4 tiny backbone and the CTC branch of PaddleOCR's recognition head:

```text
image -> BGR resize/pad to [3, 48, 320] -> PPLCNetV4 tiny -> CTC head
      -> 71-class probabilities -> CTC decode -> text or arithmetic answer
```

The fixed alphabet contains 70 visible characters; class 0 is the CTC blank. The exported ONNX model runs through ONNX Runtime Web using bundled WASM assets. The same model handles digits, letters, alphanumeric strings, and arithmetic; category-specific decoding and confidence thresholds determine whether to return or automatically fill a result.

### Training data

The approved model manifest contains 255,183 unique images:

| Split | Source | Images | Use |
| --- | --- | ---: | --- |
| train | four licensed public datasets | 145,183 | Real generator distributions |
| train | deterministic synthetic groups | 100,000 | Balanced content and visual augmentation |
| validation | isolated synthetic groups | 10,000 | Model selection and threshold calibration |

Training uses a deterministic 320,000-row balanced label list: 80,000 rows each for digits, letters, alphanumeric strings, and arithmetic. Public sources are recorded as CC-BY-4.0, CC0-1.0, or Apache-2.0 in the dataset catalog. Every sample has an exact label, SHA-256, source, license id, scenario group, and split in `training/ppocrv6-captcha/data/manifest.json`.

Groups never cross splits, and frozen benchmark hashes are rejected from training and validation. The synthetic generator covers font variation, color and contrast, rotation, shear, spacing, waves, outlines, shadows, noise, interference lines, blur, resampling, and compression artifacts.

### Quality

| Evaluation | Result |
| --- | ---: |
| Automatic-fill precision on 10,000 isolated validation images | 99.587% |
| Automatic-fill coverage on the same validation set | 82.38% |
| Frozen 201-image whole-string/fill accuracy | 98.01% |
| Frozen arithmetic-answer accuracy | 100% |
| Chrome warm P95 on Apple M4 Pro | 11.70 ms |
| Edge warm P95 on Apple M4 Pro | 12.50 ms |

These figures describe the frozen corpus and documented reference environment, not every website. Full provenance, per-category/operator results, model hashes, Paddle-to-ONNX parity, and browser checks are recorded in the [model card](training/ppocrv6-captcha/model-cards/paddle-ctc-v4-decoupled-320k.md).

## Retraining the model

The pinned reference environment uses PaddleOCR `v3.7.0` at commit `b03f46425e8ff4442b268ce449e3eef758146cd4`, PaddlePaddle `3.2.0`, Python `3.12.11`, Node.js 22, and seed `20260728`. A GPU environment must use the matching PaddlePaddle build and record CUDA, cuDNN, driver, and package versions in a new model card.

### Prepare data

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

Downloads, extracted datasets, generated images, checkpoints, and training output are ignored by Git. Dataset licenses and archive hashes must be reviewed before any new public source is enabled.

### Train from a clean environment

Clone the pinned PaddleOCR revision and install `training/ppocrv6-captcha/python-environment.txt`. Because the official model uses a different alphabet, first freeze the backbone and warm up the new head for three epochs, then fine-tune the full model for 60 epochs:

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

To continue from the production checkpoint for a new authorized scenario, create a new candidate id, use a low learning-rate experiment, and retain the production model as the baseline. Add held-out failures before tuning; do not train on issue screenshots or benchmark fixtures.

The complete commands for environment setup, continuation training, Paddle export, ONNX conversion, parity checks, threshold calibration, frozen benchmarks, and offline Chrome/Edge verification are in [Production model reproduction](docs/production-model-reproduction.md). Scenario contribution and data-isolation rules are in [Model training and scenario contributions](docs/model-training.md).

A production replacement must still achieve at least 99.5% automatic-fill precision, 80% coverage, a 3-second cold start, and a 500 ms warm P95. Results must be reported by category, source, scenario group, and arithmetic symbol. A weak or missing arithmetic operator must cause abstention, never a digits fallback.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run build:edge
npm run test:e2e:extension
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. New CAPTCHA styles require authorized samples, exact labels, provenance and licenses, an isolated group, a held-out failing benchmark, and a description of the missing visual mechanism. Security reports should follow [SECURITY.md](SECURITY.md).

Project discussions and broader developer conversations are welcome on [linux.do](https://linux.do). Keep reproducible bugs and scenario contributions in this repository so they remain searchable and testable.

## Support

If Captcha Helper saves you time, you can [buy me a coffee on Ko-fi](https://ko-fi.com/hongshuowang) or use the WeChat code below. Any amount is appreciated, and all features are free to use.

<img src="public/support/wechat.png" width="240" alt="WeChat collection QR code for Hongshuo Wang" />

Scan with WeChat, or [save the image](public/support/wechat.png) and choose it from your album in WeChat’s scanner. Both support options are also available under **Buy me a coffee** in the extension’s popup footer or **Settings → About**.

Thank you for using the project, sharing feedback, and supporting its development.

## License

Source code is available under the [MIT License](LICENSE). Bundled models, runtime components, datasets, fonts, and derived assets retain their respective notices and licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third_party/`.
