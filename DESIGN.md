# Captcha Helper design system

Captcha Helper is a quiet browser utility. Its promise is simple: **验证码，在本机处理。 / Your CAPTCHA. Handled locally.** The product helps with the current task, explains decisions clearly, and returns attention to the website.

## Brand foundations

| Element | Direction |
| --- | --- |
| Product name | Captcha Helper; repository name: local-captcha-solver |
| Mark | Use the bundled mark in `public/icons` and `public/brand` |
| Character | Calm, clear, dependable, and local |
| Voice | Short, concrete sentences. Name the action and its effect. |
| Hierarchy | One primary action; secondary controls appear when needed |
| Imagery | Real product screenshots captured from redistributable local fixtures |
| Typography | Native system fonts, including Apple, Segoe UI, PingFang SC, and Microsoft YaHei |
| Motion | Scroll-linked scenes for welcome and release introductions, elastic control feedback, and reduced-motion support |

The visual reference is Apple's restraint in hierarchy, spacing, and progressive disclosure. The implementation uses native HTML and CSS with the project's own forest-green identity.

## Shared colors

`src/ui/theme.css` is the source of truth for popup, onboarding, release pages, support, and page overlays. Light and dark appearances share the same structure. Standalone pages use `src/ui/page.css` and `src/ui/page-header.ts` for the shared foundation, brand header, and language control.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F3F5F4` | `#171D19` |
| Surface | `#FCFDFC` | `#222B25` |
| Soft surface | `#EAF0EC` | `#2D3B32` |
| Text | `#18251E` | `#EDF3EF` |
| Supporting text | `#5B6B61` | `#AFBEB4` |
| Hairline | `#D7E1DA` | `#415147` |
| Action | `#245C43` | `#99D6B3` |
| On action | `#F6FAF7` | `#132F21` |
| Warning | `#805712` | `#EDC37B` |
| Error | `#A13735` | `#F4A7A0` |

Use the accent for actions and selected states. Separate content with space and hairlines. Reserve rounded surfaces and subtle depth for navigation, screenshots, and overlays.

## Type and spacing

- Popup: 384 px wide, 22 px side padding. Main text is 12–15 px; the current hostname is 20 px. Footer metadata is 10–11 px.
- Settings: static and slider pages use one 800 px column. Place the scope choice first, with a short explanation in each choice. Keep the selected-site form, list, and disabled-site disclosure together in one bordered group. Follow with filling preferences for static CAPTCHAs, or a demo and guide for sliders. Use 12 px supporting text, 44 px controls, and compact empty states. Preserve open disclosures and keyboard focus while settings refresh.
- Setup: a full-height welcome scene followed by site access and filling preferences in one scrolling document. Setting scenes are at most 680 px wide, with 32–44 px headings and 15 px body text. Present controls directly on the page, using open rows, spacing, and hairlines. Radios and accent text identify the selected site scope. Place a quiet Back link above each setting heading and a centered downward scroll link after site access. Use a filled button for Finish setup. Welcome headings are 40–76 px. Primary controls have a minimum height of 44 px. A translucent header and three-part navigation stay available while scrolling. Place chapter navigation below the header on narrow screens and near the bottom on desktop.
- Release introductions: a brief full-height welcome scene, a benefit overview at most 940 px wide, then complete records and Start using. Welcome headings are 40–76 px; overview headings are 30–44 px; complete notes are 13 px. Every archived version uses the same sequence.
- Support: 860 px maximum content width, with a short author message beside a 280 px collection QR image. Stack these below 640 px; preserve the image’s white background and quiet zone in either appearance.
- Version history: left-aligned heading, flat rows, version and date beside the main change. Rows stack at 640 px.
- Page headers align with the settings column or release content. Keep the brand and language control on one row at narrow widths.
- Language controls share `src/ui/language-switch.ts` and its stylesheet. Display “中文” and “EN” side by side in a compact segmented control, with the current language highlighted and a 44 px minimum target for each button. Activate either language directly by click or keyboard, save the choice, and retain focus and the current view. Initially resolve the browser language; an explicit choice persists across pages. Settings places the control beside “语言” / “Language” in the sidebar.
- Utility icons use the regular Phosphor family from `src/ui/icons.css`, 22 px artwork in a 44 px target, the shared muted color, and visible hover and focus states. The popup header uses sparkle and gear icons for What’s new and Settings. Its footer aligns local recognition status, a history icon with the installed version, and a coffee icon in one row. Place “支持开发者” / “Support the developer” beneath the coffee icon in 10 px text. Show the latest activity only when a record exists. Popup tooltips appear on hover or keyboard focus and dismiss with Escape; every icon has a localized accessible name. The support footer uses About and GitHub icons with localized accessible names and hover titles.
- Numeric versions use tabular figures. Titles wrap naturally on narrow screens. Secondary text remains readable in either appearance.

## Interaction by surface

| Surface | Structure and behavior |
| --- | --- |
| Popup | One workspace for the current page. The primary action follows the detected CAPTCHA. Manual binding and site settings use disclosures. |
| Manual binding | Introduce the task, guide one target at a time, show selected targets, then save and recognize. Provide Back, Cancel, Esc, and Move guide. |
| Recognition feedback | Position results beside the CAPTCHA or input while keeping form controls accessible. Show the answer, target, and next action. |
| First installation | Scroll through welcome, site access, and filling preferences. Buttons and the chapter navigation reach the same sections. Keep choices while navigating or changing language. Finish setup requests the selected permissions and saves the setup. The completion page offers local practice and optional slider settings in the same tab, with a Back action. Enabling sliders saves its own scope and leads directly to a slider completion screen. |
| Current release | Open once per update. Start with a concise welcome scene and the version’s headline, then scroll into benefits, screenshots when useful, and complete records. End with “开始使用” / “Start using”. Apply the shared sequence to each bundled release. |
| Version history | List every bundled release with date and summary. Link to its own introduction and complete records. Retain prior entries when adding a release. |
| Support | “请我喝杯咖啡” / “Buy me a coffee” opens a local page from the popup footer or Settings → About. Place a native Ko-fi link beside the author’s message, opening in a new tab, and show the WeChat collection QR, scanning instructions, and image download. Use the brand accent for the Ko-fi action and a quiet secondary style for saving the image. Keep support voluntary and all features freely available. |
| Settings → Static / Sliders | Lead with “在哪些网站运行” / “Where should it run?”. Selected sites exposes the site form and list; all sites shows its permission status and an Allow action when access is missing. Keep disabled sites and site-specific CAPTCHA types in native disclosures with visible counts. Explain slider debugging permission beside the scope choice and place the demo and setup guide together. |
| Settings → About | Group release history and support as two illustrated navigation entries with short descriptions. Keep source code, privacy, and license links in a separate secondary row with icons and visible labels. Stack the main entries below 640 px. |
| Settings guidance | The sidebar’s book icon and “入门引导” / “Getting started” open the full welcome journey. Slider settings open a dedicated slider guide with a Back to settings action. Guides launched from Settings open in a new tab. The optional slider branch within first-install setup stays in that setup tab. Keep language and guide controls available at narrow widths. |
| Navigation | “新功能” / “What’s new” remains in the popup header. “版本记录” / “Release history” is available in the popup footer, Settings → About, and each release introduction. |

Historical pages describe their own version. Opening them does not change site permissions, recognition preferences, or the installed version's reminder. All release content is bundled and available offline.

## Maintaining release introductions

1. Add a dated bilingual version section to `CHANGELOG.md` for every release, including patches. Use `### 中文`, `### English`, optional `####` categories, and one bullet per user-facing change. This file supplies both the full local notes and generated GitHub Release notes. Apply the release editorial rules in `AGENTS.md` to every item.
2. Add the same version to `introductions` in `src/releases/catalog.ts`, with a concise list title, headline, summary, and the benefits worth explaining. Match the length to the change; one highlight is enough for a focused fix. Keep existing version entries accurate to their original release.
3. Add real screenshots only when they help explain the feature. Keep original release visuals attached to their own version.
4. Set the package version and validate catalog coverage with `npm test`. Check the current introduction, history navigation, and once-per-update behavior using the headless extension tests.

The introduction and full-notes disclosure both explain changes that help users operate the extension. Browser support and required permissions belong beside the feature they affect. Append confirmed issue references to the relevant note or highlight as `[#N](https://github.com/hongshuo-wang/local-captcha-solver/issues/N)`; local pages open these links in a separate tab. Maintenance details belong in commits and developer documentation.

## Welcome and release motion

`src/ui/scroll-journey.ts` connects native scrolling, chapter links, and active navigation. CSS view timelines reveal scenes with opacity, a short blur, and a small scale overshoot; IntersectionObserver supplies an entrance animation where view timelines are unavailable. Scrolling previews content and never grants permissions or saves preferences.

Use translucent surfaces with subtle edge highlights for the header and chapter navigation. Settings sit directly on the page and enter with their chapter. Centered scroll links use a downward caret with a short vertical response to hover or keyboard focus. State changes such as opening optional slider setup use the View Transition API with a brief fade and elastic entrance. The standard document layout remains usable when an animation API is unavailable. Respect reduced motion by presenting stable scenes and immediate navigation; keep controls readable when forced colors are enabled.

## Accessibility and feedback

- Every keyboard target has a visible forest focus ring. Use semantic links for navigation and native disclosures for expandable content.
- Preserve the same content and reading order in light, dark, and reduced-motion modes.
- Success and copy confirmation are brief. Decisions, permission failures, and recoverable errors stay available for action.
- Uncertain recognition asks for confirmation. Existing input remains protected, and the user submits the form.
- Ordinary recognition UI and release notes explain outcomes in words; diagnostic details remain in diagnostics and developer documentation.
- Verify layout at desktop and narrow widths using headless browsers with isolated profiles.
