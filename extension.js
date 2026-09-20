'use strict';

const path = require('path');

// swimlane.js は parse/render がDOMに依存しないので、拡張機能ホスト（Node.js）側で
// そのまま require して同期的にSVG文字列を作れる。Webview側でスクリプトを走らせる必要がない。
let swimlaneModule = null;
function getSwimlane() {
  if (!swimlaneModule) {
    swimlaneModule = require(path.join(__dirname, 'media', 'swimlane.js'));
  }
  return swimlaneModule;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * VS Code の Markdown プレビュー拡張点。
 * ```swimlane フェンスだけを横取りしてSVGに差し替え、それ以外の言語は
 * 既定のfenceレンダラー（シンタックスハイライト等）にそのまま委譲する。
 */
function extendMarkdownIt(md) {
  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0].toLowerCase();

    if (lang !== 'swimlane') {
      return defaultFence(tokens, idx, options, env, self);
    }

    let result;
    try {
      result = getSwimlane().render(token.content);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      return `<pre class="swimlane-error">${escapeHtml(message)}</pre>\n`;
    }

    if (result.ok) {
      return `<div class="swimlane-diagram">${result.svg}</div>\n`;
    }
    return `<pre class="swimlane-error">${escapeHtml(result.errors.join('\n'))}</pre>\n`;
  };

  return md;
}

function activate() {
  return { extendMarkdownIt };
}

function deactivate() {}

module.exports = { activate, deactivate, extendMarkdownIt };
