/**
 * Flatten interactive daily-brief HTML for email clients (no JavaScript).
 * All sections are shown vertically; tab bars are hidden.
 */
import * as cheerio from "cheerio";

const PANEL_LABELS = {
  politics: "时政观察",
  finance: "财经要点",
  trading: "市场行情",
  community: "社区讨论",
  tech: "技术动态",
};

const EMAIL_STYLE = `
  .tabs, .sub-tabs, .source-tabs, .trading-group-tabs { display: none !important; }
  .panel, .sub-content, .source-content, .trading-group-content {
    display: block !important;
    visibility: visible !important;
  }
  .email-banner {
    background: #f4f4f5;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 0 0 1.5rem;
    font-size: 14px;
    line-height: 1.5;
    color: #444;
  }
  .email-l1 {
    font-size: 1.45rem;
    font-weight: 700;
    margin: 2.25rem 0 1rem;
    padding-bottom: 0.35rem;
    border-bottom: 2px solid #222;
  }
  .email-l2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 1.5rem 0 0.75rem;
    color: #222;
  }
  .email-l3 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 1.1rem 0 0.5rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

function tabLabel($, selector) {
  const text = $(selector).first().text().replace(/\s*\d+\s*$/, "").trim();
  return text || null;
}

/** @param {string} html */
export function flattenHtmlForEmail(html) {
  const $ = cheerio.load(html);
  $("script").remove();

  $("section.panel").each((_, el) => {
    const panel = $(el);
    const id = panel.attr("data-panel") ?? "";
    const title = PANEL_LABELS[id] ?? id;
    panel.before(`<h2 class="email-l1">${title}</h2>`);
  });

  $(".sub-content").each((_, el) => {
    const block = $(el);
    const sub = block.attr("data-sub-content");
    const cat = block.attr("data-cat");
    const name =
      tabLabel($, `.sub-tab[data-sub="${sub}"][data-cat="${cat}"]`) ?? sub;
    if (name) block.before(`<h3 class="email-l2">${name}</h3>`);
  });

  $(".source-content").each((_, el) => {
    const block = $(el);
    const srcId = block.attr("data-source-content");
    const name = tabLabel($, `.source-tab[data-source="${srcId}"]`);
    if (name) block.before(`<h4 class="email-l3">${name}</h4>`);
  });

  $(".trading-group-content").each((_, el) => {
    const block = $(el);
    const grp = block.attr("data-group");
    const name =
      tabLabel($, `.trading-group-tab[data-group="${grp}"]`) ?? grp;
    if (name) block.before(`<h3 class="email-l2">${name}</h3>`);
  });

  $("main").prepend(
    `<div class="email-banner">` +
      `邮件内为<strong>全文展开版</strong>（无需点击标签）。` +
      `若需交互切换标签，请下载附件 <code>.html</code> 并用 Chrome / Edge 浏览器打开。` +
      `</div>`,
  );

  $("head").append(`<style>${EMAIL_STYLE}</style>`);
  return $.html();
}
