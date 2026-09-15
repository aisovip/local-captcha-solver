import changelog from '../../CHANGELOG.md?raw';
import type { UiLocale } from '../platform/i18n';

export interface ReleaseSection {
  title: string;
  changes: string[];
}

export interface Release {
  version: string;
  date: string;
  notes: Record<UiLocale, ReleaseSection[]>;
}

export function parseReleases(source: string): Release[] {
  const releases: Release[] = [];
  let release: Release | undefined;
  let locale: UiLocale | undefined;
  let section: ReleaseSection | undefined;
  for (const line of source.split(/\r?\n/)) {
    const heading = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/.exec(line);
    if (heading) {
      release = { version: heading[1], date: heading[2], notes: { zh_CN: [], en: [] } };
      releases.push(release);
      locale = undefined;
      section = undefined;
    } else if (/^## /.test(line)) {
      release = undefined;
    } else if (release && /^### (中文|English)$/.test(line)) {
      locale = line === '### 中文' ? 'zh_CN' : 'en';
      section = undefined;
    } else if (release && locale && /^#### /.test(line)) {
      section = { title: line.slice(5), changes: [] };
      release.notes[locale].push(section);
    } else if (release && locale && line.startsWith('- ')) {
      if (!section) {
        section = { title: '', changes: [] };
        release.notes[locale].push(section);
      }
      section.changes.push(line.slice(2));
    }
  }
  return releases;
}

export const releases = parseReleases(changelog);

type Copy = readonly [zh: string, en: string];
interface Introduction {
  title: Copy;
  headline: Copy;
  summary: Copy;
  highlights: readonly { title: Copy; body: Copy }[];
  note?: Copy;
  image?: 'binding';
}

export const introductions: Record<string, Introduction> = {
  '1.4.0': {
    title: ['手动指定验证码，结果就在旁边', 'Choose a CAPTCHA and see its answer beside it'],
    headline: ['找到它。记住它。', 'Point it out. We’ll remember.'],
    summary: ['网页上的验证码没有被发现时，可以亲自指定位置并保存。', 'When a CAPTCHA is missed, choose its location and save it for next time.'],
    image: 'binding',
    highlights: [
      { title: ['指定一次，下次接着用。', 'Choose once. Reuse next time.'], body: ['在面板中展开“手动指定位置”，按引导选择验证码与输入框，或滑块部件。保存后可随时调整或删除。[#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)', 'Expand manual location selection in the popup and follow the guide to choose a CAPTCHA and input, or slider parts. Change or remove saved locations anytime. [#15](https://github.com/hongshuo-wang/local-captcha-solver/issues/15)'] },
      { title: ['结果，就在验证码旁。', 'Answers, right where you need them.'], body: ['面板根据当前页提供识别或滑块操作。结果出现在验证码旁，填写时会高亮输入框，方便确认目标。', 'The popup offers recognition or slider handling for the current page. Results appear beside the CAPTCHA, and a brief highlight shows the filled input.'] },
    ],
    note: ['绑定保存在本机，按网站与页面路径生效。自动处理遵循你的授权与网站设置。', 'Bindings stay on your device for this website and path. Automatic handling follows your site permissions and settings.'],
  },
  '1.3.3': {
    title: ['B 站搜索框恢复正常', 'Bilibili search works normally'],
    headline: ['搜索，照常进行。', 'Keep searching as usual.'],
    summary: ['开启自动滑块处理后，也能正常使用 B 站搜索。', 'Use Bilibili search normally with automatic slider handling enabled.'],
    highlights: [
      { title: ['输入之后，再搜索。', 'Type first. Search when you choose.'], body: ['点击首页搜索框时，可以照常输入关键词，由你决定何时执行搜索。', 'Click the homepage search box, type your keywords, and choose when to run the search.'] },
    ],
  },
  '1.3.2': {
    title: ['阿里云拼图支持，按网站开关滑块', 'Aliyun puzzles and per-site slider controls'],
    headline: ['更多拼图，更细的选择。', 'More puzzles. More site control.'],
    summary: ['自动处理阿里云弹窗拼图，并记住每个网站的滑块开关。', 'Handle Aliyun popup puzzles and remember your slider choice for each website.'],
    highlights: [
      { title: ['弹窗里的拼图，也能处理。', 'Handle puzzles inside popups.'], body: ['新增阿里云弹窗拼图支持，改善相似缺口的判断，减少滑块拖错位置的情况。', 'Aliyun popup puzzles are now supported, with better handling of similar-looking gaps to reduce incorrect drags.'] },
      { title: ['关掉一个网站，记住这个选择。', 'Turn off a site and keep that choice.'], body: ['全站模式下可以单独停用网站，刷新后仍然生效。需要恢复时，打开滑块设置中的已禁用网站列表。[#14](https://github.com/hongshuo-wang/local-captcha-solver/issues/14)', 'Turn off individual websites in all-sites mode and keep that choice after a refresh. Restore them from the disabled-site list in Slider settings. [#14](https://github.com/hongshuo-wang/local-captcha-solver/issues/14)'] },
    ],
    note: ['拼图滑块 Beta 适用于桌面版 Chrome 和 Edge。', 'Puzzle-slider Beta is available in desktop Chrome and Edge.'],
  },
  '1.3.1': {
    title: ['刷新后的滑块可以继续处理', 'Keep handling sliders after a refresh'],
    headline: ['换一张，也能接着处理。', 'Ready for the next challenge.'],
    summary: ['改善重复登录时的滑块处理，并修复部分旧版浏览器中的启动问题。', 'Improve sliders during repeated sign-ins and fix handling in some older browsers.'],
    highlights: [
      { title: ['再次登录，也能接着用。', 'Ready for your next sign-in.'], body: ['改善奇安信登录页的定位。GeeTest 刷新、重置或登录失效后出现的新滑块，可以继续自动处理。[#11](https://github.com/hongshuo-wang/local-captcha-solver/issues/11)', 'Improve positioning on Qianxin’s sign-in page and handle new GeeTest puzzles after a refresh, reset, or expired login. [#11](https://github.com/hongshuo-wang/local-captcha-solver/issues/11)'] },
      { title: ['修复旧版浏览器的启动问题。', 'Fix handling in older browsers.'], body: ['部分使用较旧 Chromium 内核的浏览器中，滑块功能无法启动的问题已修复。[#12](https://github.com/hongshuo-wang/local-captcha-solver/issues/12)', 'Fix slider handling failing to start in some browsers using older Chromium versions. [#12](https://github.com/hongshuo-wang/local-captcha-solver/issues/12)'] },
    ],
    note: ['拼图滑块 Beta 适用于桌面版 Chrome 和 Edge。', 'Puzzle-slider Beta is available in desktop Chrome and Edge.'],
  },
  '1.3.0': {
    title: ['Firefox 支持', 'Firefox support'],
    headline: ['在 Firefox，一样本地识别。', 'Local recognition comes to Firefox.'],
    summary: ['在 Firefox 中识别常见文字与算术验证码，沿用熟悉的填写方式。', 'Recognize common text and arithmetic CAPTCHAs in Firefox with familiar filling controls.'],
    highlights: [
      { title: ['熟悉的操作，都在这里。', 'The controls you already know.'], body: ['支持自动填入、面板识别、图片右键操作和网站设置，Firefox 用户也能使用。[#10](https://github.com/hongshuo-wang/local-captcha-solver/issues/10)', 'Use automatic filling, popup recognition, image context menus, and site settings in Firefox. [#10](https://github.com/hongshuo-wang/local-captcha-solver/issues/10)'] },
      { title: ['图片与结果，留在本机。', 'Images and answers stay on your device.'], body: ['验证码在你的设备上识别。可靠结果可以填入，表单仍由你提交。', 'Recognition runs on your device. Reliable answers can be filled, while you submit the form.'] },
    ],
    note: ['Firefox 支持静态文字验证码；拼图滑块 Beta 适用于 Chrome 和 Edge。', 'Firefox supports static text CAPTCHAs; puzzle-slider Beta is available in Chrome and Edge.'],
  },
  '1.2.0': {
    title: ['拼图滑块 Beta 与验证码类型', 'Puzzle-slider Beta and CAPTCHA types'],
    headline: ['让拼图滑块，也省一步。', 'A little help with puzzle sliders.'],
    summary: ['新增常见拼图滑块的自动处理，也能为每个网站选择合适的文字验证码类型。', 'Handle common puzzle sliders automatically and choose the text CAPTCHA type for each website.'],
    highlights: [
      { title: ['在哪里处理，由你决定。', 'Choose where sliders run.'], body: ['为拼图滑块单独选择所有网站或指定网站。设置页会说明所需权限，拖动期间浏览器可能短暂显示正在调试的提示。', 'Choose all sites or selected sites for puzzle sliders separately. Settings explain the required permission and the brief debugging notice the browser may show during a drag.'] },
      { title: ['按网站选择验证码类型。', 'Choose the type for each website.'], body: ['网站一直使用同类验证码时，可以选纯数字、纯英文、英数混合或算术，也能随时恢复自动判断。', 'For websites using a consistent type, select digits, English letters, alphanumeric, or arithmetic. Restore automatic detection anytime.'] },
    ],
    note: ['拼图滑块 Beta 适用于桌面版 Chrome 和 Edge，已在 GeeTest 演示页验证。', 'Puzzle-slider Beta is available in desktop Chrome and Edge and was verified on the GeeTest demo.'],
  },
  '1.1.0': {
    title: ['一键识别与深浅色界面', 'One-click recognition and light and dark themes'],
    headline: ['打开这一页，识别这一页。', 'Open a page. Recognize its CAPTCHA.'],
    summary: ['需要时一键识别当前页，界面跟随系统深浅色，也更适应旧式登录页面。', 'Recognize the current page when needed, follow the system theme, and work better on older login pages.'],
    highlights: [
      { title: ['需要时，识别一次。', 'Recognize when you need it.'], body: ['点击“立即识别当前页”，即可手动识别一次；网站自动识别关闭时也能使用。', 'Choose Recognize this page now for a one-time scan, including when automatic recognition is off for the site.'] },
      { title: ['识别之后，找到填写位置。', 'Find the field after recognition.'], body: ['改善部分旧式登录页识别成功却找不到输入框的问题。结果与操作提示尽量避开登录、提交和刷新按钮。', 'Improve older login pages where recognition succeeded but the input was missed. Results and prompts stay clear of login, submit, and refresh buttons where possible.'] },
    ],
  },
  '1.0.0': {
    title: ['本地验证码助手，首次发布', 'The first local CAPTCHA helper release'],
    headline: ['验证码，在本机处理。', 'Your CAPTCHA. Handled locally.'],
    summary: ['在 Chrome 和 Edge 中识别常见文字与算术验证码，帮你完成填写。', 'Recognize common text and arithmetic CAPTCHAs in Chrome and Edge and get help filling them.'],
    highlights: [
      { title: ['识别留在本机，提交交给你。', 'Recognize locally. You submit.'], body: ['支持数字、英文字母、英数混合和一步整数算术。图片和结果留在设备上，可靠答案可以自动填入，表单始终由你提交。', 'Recognize digits, English letters, alphanumeric text, and one-step integer arithmetic. Images and results stay on your device. Reliable answers can be filled, and you submit the form.'] },
      { title: ['按你的习惯识别。', 'Recognize your way.'], body: ['选择允许运行的网站，通过面板、图片右键或鼠标快捷操作识别；需要时可复制结果，界面支持中文和英文。', 'Choose which websites can run recognition and use the popup, image context menu, or mouse shortcuts. Copy answers when needed, in a Chinese or English interface.'] },
    ],
    note: ['首个版本提供 Chrome 和 Microsoft Edge 扩展。', 'The first release provides Chrome and Microsoft Edge extensions.'],
  },
};

export function releaseCopy(copy: Copy, locale: UiLocale): string {
  return copy[locale === 'zh_CN' ? 0 : 1];
}

export function releaseUrl(version?: string): string {
  return version ? `onboarding.html?flow=upgrade&version=${encodeURIComponent(version)}&manual=1` : 'onboarding.html?flow=history';
}
