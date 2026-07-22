import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshots = path.join(root, "store", "screenshots");
const promo = path.join(root, "store", "promo");
const icon = fs
  .readFileSync(path.join(root, "assets", "icons", "icon-128.png"))
  .toString("base64");
const iconUrl = `data:image/png;base64,${icon}`;

fs.mkdirSync(screenshots, { recursive: true });
fs.mkdirSync(promo, { recursive: true });

const baseStyle = `
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #0f1419;
    background: #f5f7f9;
    letter-spacing: 0;
  }
  .browser {
    width: 1140px;
    height: 712px;
    margin: 44px auto;
    overflow: hidden;
    border: 1px solid #d8e0e6;
    border-radius: 8px;
    background: white;
    box-shadow: 0 18px 50px rgb(15 20 25 / 10%);
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 14px;
    border-bottom: 1px solid #eff3f4;
    background: #f7f9f9;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #c8d1d8; }
  .address {
    height: 26px;
    margin-left: 8px;
    padding: 5px 14px;
    border: 1px solid #e2e8ec;
    border-radius: 6px;
    color: #536471;
    background: white;
    font-size: 12px;
    flex: 1;
  }
  .app-icon { width: 28px; height: 28px; }
  .workspace { display: grid; grid-template-columns: 92px 618px 1fr; height: 670px; }
  .nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 26px;
    padding-top: 24px;
    border-right: 1px solid #eff3f4;
  }
  .nav .brand { font-size: 23px; font-weight: 700; }
  .nav .item { width: 24px; height: 24px; color: #0f1419; font-size: 21px; text-align: center; }
  .nav .post { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: white; background: #0f1419; font-size: 20px; }
  .feed { border-right: 1px solid #eff3f4; background: white; }
  .tabs { display: flex; height: 58px; border-bottom: 1px solid #eff3f4; }
  .tab { display: grid; place-items: center; width: 50%; color: #536471; font-size: 14px; font-weight: 600; }
  .tab.active { color: #0f1419; box-shadow: inset 0 -3px #1d9bf0; }
  .composer { display: flex; gap: 12px; min-height: 92px; padding: 17px 20px; border-bottom: 1px solid #eff3f4; color: #536471; }
  .avatar { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%; background: #dfe8ed; }
  .avatar.dark { background: #a9bac5; }
  .post-row { display: flex; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #eff3f4; }
  .post-body { min-width: 0; flex: 1; }
  .meta { display: flex; gap: 6px; align-items: baseline; font-size: 14px; }
  .name { font-weight: 700; }
  .handle { color: #536471; }
  .copy { margin-top: 7px; font-size: 15px; line-height: 1.45; }
  .media { height: 145px; margin-top: 13px; border: 1px solid #d8e0e6; border-radius: 8px; background: linear-gradient(145deg, #eef3f5, #dbe6eb); }
  .actions { display: flex; justify-content: space-between; margin-top: 14px; color: #536471; font-size: 13px; }
  .settings { padding: 28px 30px; background: #f7f9fb; }
  .settings-title { display: flex; align-items: center; gap: 11px; margin-bottom: 4px; font-size: 20px; font-weight: 750; }
  .settings-title img { width: 38px; height: 38px; }
  .status { margin: 0 0 18px 49px; color: #536471; font-size: 13px; }
  .toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 57px; border-bottom: 1px solid #e6ecef; }
  .toggle:last-child { border-bottom: 0; }
  .toggle-copy { display: grid; gap: 3px; }
  .toggle-copy strong { font-size: 13px; }
  .toggle-copy span { color: #536471; font-size: 11px; }
  .switch { position: relative; width: 40px; height: 23px; border-radius: 999px; background: #1d9bf0; flex: 0 0 auto; }
  .switch.off { background: #8a98a5; }
  .switch::after { content: ""; position: absolute; top: 3px; right: 3px; width: 17px; height: 17px; border-radius: 50%; background: white; }
  .switch.off::after { right: 20px; }
`;

const post = ({ dark = false, name, handle, copy, media = false }) => `
  <article class="post-row">
    <div class="avatar${dark ? " dark" : ""}"></div>
    <div class="post-body">
      <div class="meta"><span class="name">${name}</span><span class="handle">${handle} · 2h</span></div>
      <div class="copy">${copy}</div>
      ${media ? '<div class="media"></div>' : ""}
      <div class="actions"><span>○</span><span>↻</span><span>♡</span><span>▥</span><span>⌑</span></div>
    </div>
  </article>`;

const screenshotOne = `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head><body>
  <div class="browser">
    <div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><div class="address">x.com/home</div><img class="app-icon" src="${iconUrl}"></div>
    <div class="workspace">
      <nav class="nav"><div class="brand">X</div><div class="item">⌂</div><div class="item">⌕</div><div class="item">♢</div><div class="item">○</div><div class="item">⌑</div><div class="item">♙</div><div class="post">✎</div></nav>
      <main class="feed"><div class="tabs"><div class="tab">おすすめ</div><div class="tab active">フォロー中</div></div><div class="composer"><div class="avatar"></div><div>いまどうしてる？</div></div>
        ${post({ name: "Aiko Tanaka", handle: "@aiko", copy: "A quieter interface makes it easier to focus on the ideas, not the numbers." })}
        ${post({ dark: true, name: "Jun Park", handle: "@jun", copy: "A small design change can make the whole timeline feel calmer.", media: true })}
      </main>
      <aside class="settings"><div class="settings-title"><img src="${iconUrl}"><span>Zen View</span></div><p class="status">設定を保存しました</p>
        <div class="toggle"><div class="toggle-copy"><strong>数値を表示する</strong><span>返信・リポスト・いいね・表示数</span></div><div class="switch off"></div></div>
        <div class="toggle"><div class="toggle-copy"><strong>広告ポストを表示する</strong><span>Ad / Ads / 広告 / Promoted</span></div><div class="switch off"></div></div>
        <div class="toggle"><div class="toggle-copy"><strong>右欄: トレンドを表示する</strong><span>いまを見つけよう・話題</span></div><div class="switch off"></div></div>
        <div class="toggle"><div class="toggle-copy"><strong>右欄: ニュースを表示する</strong><span>本日のニュース・今日のニュース</span></div><div class="switch off"></div></div>
        <div class="toggle"><div class="toggle-copy"><strong>左ナビの文字を表示する</strong><span>ホーム・検索・通知など</span></div><div class="switch off"></div></div>
      </aside>
    </div>
  </div>
</body></html>`;

const comparisonStyle = `
  ${baseStyle}
  body { padding: 50px 58px; background: white; }
  h1 { margin: 0; font-size: 42px; line-height: 1.1; }
  .sub { margin-top: 10px; color: #536471; font-size: 18px; }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; }
  .sample { height: 610px; overflow: hidden; border: 1px solid #d8e0e6; border-radius: 8px; background: white; }
  .sample-head { display: flex; align-items: center; justify-content: space-between; height: 54px; padding: 0 18px; border-bottom: 1px solid #eff3f4; font-size: 15px; font-weight: 700; }
  .sample-head img { width: 32px; height: 32px; }
  .sample-grid { display: grid; grid-template-columns: 145px 1fr 170px; height: 556px; }
  .sample-grid.clean { grid-template-columns: 70px 1fr; }
  .mini-nav { padding: 19px 14px; border-right: 1px solid #eff3f4; font-size: 14px; line-height: 2.55; }
  .mini-nav.compact { text-align: center; font-size: 20px; line-height: 2.25; }
  .mini-feed { border-right: 1px solid #eff3f4; }
  .mini-post { padding: 16px; border-bottom: 1px solid #eff3f4; font-size: 14px; line-height: 1.45; }
  .mini-post strong { display: block; margin-bottom: 5px; }
  .metrics { display: flex; justify-content: space-between; margin-top: 13px; color: #536471; font-size: 11px; }
  .rail { padding: 14px; background: #f7f9f9; }
  .rail-box { margin-bottom: 12px; padding: 12px; border: 1px solid #e1e8ed; border-radius: 8px; font-size: 12px; line-height: 1.5; }
  .clean .metrics, .clean .rail { display: none; }
`;

const screenshotTwo = `<!doctype html><html><head><meta charset="utf-8"><style>${comparisonStyle}</style></head><body>
  <h1>Keep the posts. Remove the noise.</h1><div class="sub">Choose exactly what stays visible on X.</div>
  <div class="compare">
    <section class="sample"><div class="sample-head"><span>Default view</span><span>More interface</span></div><div class="sample-grid">
      <div class="mini-nav"><b>X</b><br>Home<br>Explore<br>Notifications<br>Messages<br>Bookmarks<br>Premium<br>Profile</div>
      <div class="mini-feed"><div class="mini-post"><strong>Aiko Tanaka @aiko</strong>A quieter interface makes it easier to focus on the ideas.<div class="metrics"><span>12 replies</span><span>34 reposts</span><span>280 likes</span></div></div><div class="mini-post"><strong>Jun Park @jun</strong>Design for reading, not distraction.<div class="metrics"><span>8 replies</span><span>15 reposts</span><span>120 likes</span></div></div></div>
      <div class="rail"><div class="rail-box"><b>Subscribe to Premium</b><br>Unlock more features</div><div class="rail-box"><b>What's happening</b><br>Trending now<br>News and updates</div><div class="rail-box"><b>Who to follow</b><br>Suggested accounts</div></div>
    </div></section>
    <section class="sample"><div class="sample-head"><span>Zen View</span><img src="${iconUrl}"></div><div class="sample-grid clean">
      <div class="mini-nav compact"><b>X</b><br>⌂<br>⌕<br>♢<br>○<br>⌑<br>♙<br>✎</div>
      <div class="mini-feed"><div class="mini-post"><strong>Aiko Tanaka @aiko</strong>A quieter interface makes it easier to focus on the ideas.<div class="metrics"></div></div><div class="mini-post"><strong>Jun Park @jun</strong>Design for reading, not distraction.<div class="metrics"></div></div></div>
    </div></section>
  </div>
</body></html>`;

const promoStyle = `
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; }
  body { display: flex; align-items: center; gap: 22px; padding: 32px 38px; background: white; color: #0f1419; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
  img { width: 118px; height: 118px; flex: 0 0 auto; }
  h1 { margin: 0; font-size: 27px; line-height: 1.1; }
  p { margin: 10px 0 0; color: #536471; font-size: 15px; line-height: 1.35; }
`;

const promoTile = `<!doctype html><html><head><meta charset="utf-8"><style>${promoStyle}</style></head><body><img src="${iconUrl}"><div><h1>Zen View<br>for X</h1><p>A calmer way<br>to read X.</p></div></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.setContent(screenshotOne, { waitUntil: "load" });
await page.screenshot({ path: path.join(screenshots, "01-settings-and-clean-feed.png") });

await page.setContent(screenshotTwo, { waitUntil: "load" });
await page.screenshot({ path: path.join(screenshots, "02-before-and-after.png") });

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(promoTile, { waitUntil: "load" });
await page.screenshot({ path: path.join(promo, "small-promo-440x280.png") });

await browser.close();
console.log("Generated Chrome Web Store media.");
