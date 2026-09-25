const allowedTag = /<\/?(?:strong|em|u|s|ul|ol|li)>|<br\s*\/?>|<a\s+href="([^"]*)">|<\/a>|<img\s+src="([^"]*)"\s+alt="([^"]*)"\s*\/?>/gi;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeMediaUrl(url: string) {
  return /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(url) ? url : "";
}

function safeLinkUrl(url: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : "";
}

function legacyMarkupToHtml(content: string) {
  return String(content ?? "")
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)]+)\)/gi, (_, alt: string, url: string) => {
      const safeUrl = safeMediaUrl(url);
      return safeUrl ? `<img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(alt)}">` : alt;
    })
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)]+)\)/gi, (_, text: string, url: string) => {
      const safeUrl = safeLinkUrl(url);
      return safeUrl ? `<a href="${escapeAttribute(safeUrl)}">${text}</a>` : text;
    })
    .replace(/\*{4}([\s\S]+?)\*{4}/g, "<strong>$1</strong>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
}

export function richTextToSafeHtml(content: string) {
  const source = legacyMarkupToHtml(content);
  let html = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  allowedTag.lastIndex = 0;

  while ((match = allowedTag.exec(source)) !== null) {
    if (match.index > cursor) html += escapeHtml(source.slice(cursor, match.index));
    const token = match[0];

    if (/^<a\s/i.test(token)) {
      const url = safeLinkUrl(match[1] ?? "");
      html += url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">` : "";
    } else if (/^<img\s/i.test(token)) {
      const url = safeMediaUrl(match[2] ?? "");
      html += url
        ? `<img class="rich-text-image" src="${escapeAttribute(url)}" alt="${escapeAttribute(match[3] || "Message image")}">`
        : escapeHtml(match[3] || "");
    } else {
      html += token.toLowerCase() === "<br/>" ? "<br>" : token;
    }

    cursor = match.index + token.length;
  }

  if (cursor < source.length) html += escapeHtml(source.slice(cursor));
  return html;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#96;/gi, "`");
}

export function richTextToPlainText(content: string) {
  return decodeEntities(
    legacyMarkupToHtml(content)
      .replace(/<img\s+[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function RichText({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div
      className={`rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: richTextToSafeHtml(content) }}
    />
  );
}
