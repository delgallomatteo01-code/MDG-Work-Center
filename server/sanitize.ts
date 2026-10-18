import sanitizeHtml from 'sanitize-html';
import { NOTE_HTML_MAX, NOTE_TEXT_MAX } from '../shared/constants';

const ALLOWED_TAGS = ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'];

/** Sanificazione robusta (parser htmlparser2) con whitelist di tag e schemi dei link. */
export function sanitizeNoteHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math'],
    transformTags: {
      a: (tagName, attribs): sanitizeHtml.Tag => {
        const href = (attribs.href ?? '').trim();
        // Destinazione non ammessa: il link resta senza href (inerte). Il tag non viene rinominato
        // perché rinominare durante il parsing può sbilanciare le chiusure.
        if (!/^(https?:|mailto:)/i.test(href)) return { tagName, attribs: {} as sanitizeHtml.Attributes };
        return { tagName, attribs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' } };
      },
    },
  }).trim();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Testo semplice derivato dall'HTML già sanificato. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|h2|h3|li|blockquote|ul|ol)>/gi, '\n');
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, code: string) => {
      if (ENTITIES[code]) return ENTITIES[code];
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function prepareNoteContent(raw: unknown): { html: string; text: string } {
  const input = typeof raw === 'string' ? raw : '';
  if (input.length > NOTE_HTML_MAX * 2) throw new RangeError('Il contenuto della nota è troppo lungo.');
  const html = sanitizeNoteHtml(input);
  if (html.length > NOTE_HTML_MAX) throw new RangeError(`Il contenuto formattato supera ${NOTE_HTML_MAX.toLocaleString('it-IT')} caratteri.`);
  const text = htmlToPlainText(html);
  if (text.length > NOTE_TEXT_MAX) throw new RangeError(`Il testo della nota supera ${NOTE_TEXT_MAX.toLocaleString('it-IT')} caratteri.`);
  return { html, text };
}
