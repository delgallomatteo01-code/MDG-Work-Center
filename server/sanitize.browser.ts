// Variante browser di server/sanitize.ts (build Artifact): DOMPurify con la stessa whitelist.
import DOMPurify from 'dompurify';
import { NOTE_HTML_MAX, NOTE_TEXT_MAX } from '../shared/constants';

const ALLOWED_TAGS = ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'];

export function sanitizeNoteHtml(input: string): string {
  const frag = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;
  frag.querySelectorAll('a').forEach((a) => {
    const href = (a.getAttribute('href') ?? '').trim();
    if (/^(https?:|mailto:)/i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer nofollow');
    } else a.removeAttribute('href');
  });
  const box = document.createElement('div');
  box.appendChild(frag);
  return box.innerHTML.trim();
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '$&• ')
      .replace(/<\/(p|div|h2|h3|li|blockquote|ul|ol)>/gi, '$&\n'),
    'text/html',
  );
  return (doc.body.textContent ?? '')
    .replace(/ /g, ' ')
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
