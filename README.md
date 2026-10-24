# create-valaxy

博客写作说明：[博客写作指南](博客写作指南.md)，包含文章模板、标题与分类、Markdown 容器、图片链接和发布前检查。

维护记录：[优化与测试记录](优化与测试记录.md)，包含已修复问题、测试结果和验证范围。

Example: [valaxy.site](https://valaxy.site)

## Usage

```bash
# install the exact dependency versions from package-lock.json
npm ci

# start
npm run dev
```

See `http://localhost:4859/`, have fun!

Use Node.js 20 and npm throughout this project. `package-lock.json` is the single
dependency lockfile. TypeScript is pinned to the version compatible with Valaxy
0.19.5's declarations; update it together with the framework.

`npm ci` automatically runs `scripts/prepare-valaxy.mjs` to apply the documented
compatibility fixes for the pinned Valaxy/Yun versions. `npm run dev` and the SSG
build also verify these fixes. Review this script before upgrading the framework.
Code highlighting loads the languages used in `pages/`; new fence languages are
loaded during hot reload. Keep the dev server running while editing posts.

The component inspection tools are optional. To enable them in PowerShell:

```powershell
$env:BLOG_DEVTOOLS = '1'
npm run dev
```

Remove the variable with `Remove-Item Env:BLOG_DEVTOOLS` before the next start to
return to the faster default setup. Normal Markdown hot reload works in both modes.

```bash
npm run check
npm run build
npm run verify:pages
```

`check` runs TypeScript/Vue checking and regression tests. The SSG build also fixes
feed URLs and dates. `verify:pages` then checks generated pages, pagination, local
links, feed links, dates and formula errors before deployment.

### Config

Modify `valaxy.config.ts` to custom your blog.

English & Chinese Docs is coming!

> Wait a minute.

### Docker

```bash
docker build . -t your-valaxy-blog-name:latest
```

## Structure

In most cases, you only need to work in the `pages` folder.

### Main folders

- `pages`: your all pages
  - `posts`: write your posts here, will be counted as posts
- `styles`: override theme styles, `index.scss`/`vars.csss`/`index.css` will be loaded automatically
- `components`: custom your vue components (will be loaded automatically)
- `layouts`: custom layouts (use it by `layout: xxx` in md)
- `locales`: custom i18n

### Other

- `.vscode`: recommend some useful plugins & settings, you can preview icon/i18n/class...
- `.github`: GitHub Actions to auto build & deploy to GitHub Pages
- `netlify.toml`: for [netlify](https://www.netlify.com/)
- `vercel.json`: for [vercel](https://vercel.com/)

