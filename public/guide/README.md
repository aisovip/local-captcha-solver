# Release introduction screenshots

These images show the extension’s real binding picker on the local practice page in `tests/e2e/fixtures/guide.html`. The CAPTCHA is the repository’s generated `digits-002.png` fixture. Images contain no external website content or user data and are distributed under the repository MIT license.

Regenerate the Chinese and English images in light and dark modes:

```sh
npm run build
npx tsx scripts/capture-guide.ts
npm run build
```

The capture script uses headless Chromium, an isolated temporary profile, and a temporary extension copy with access to the local fixture host. Rebuilding includes the regenerated images in the extension.
