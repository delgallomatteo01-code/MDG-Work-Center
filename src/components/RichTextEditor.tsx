import { useEffect, useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Underline } from 'lucide-react';
import { cx } from '../lib';

/** Normalizza un link: http/https/mailto ammessi; senza schema aggiunge https. */
export function normalizeLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // schema non ammesso (es. javascript:)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  return `https://${s.replace(/^\/+/, '')}`;
}

type Cmd = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList';

export function RichTextEditor({ initialHtml, onChange, placeholder }: { initialHtml: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* non supportato */
    }
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || !ref.current || !sel.anchorNode || !ref.current.contains(sel.anchorNode)) return;
      const block = blockOf(sel.anchorNode);
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        h2: block === 'H2',
        blockquote: !!closest(sel.anchorNode, 'BLOCKQUOTE'),
      });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
    // initialHtml è letto solo al montaggio: l'editor non è controllato
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  function closest(node: Node | null, tag: string): Element | null {
    let n: Node | null = node;
    while (n && n !== ref.current) {
      if (n.nodeType === 1 && (n as Element).tagName === tag) return n as Element;
      n = n.parentNode;
    }
    return null;
  }
  function blockOf(node: Node | null): string | null {
    let n: Node | null = node;
    while (n && n !== ref.current) {
      if (n.nodeType === 1 && /^(P|DIV|H2|H3|LI|BLOCKQUOTE)$/.test((n as Element).tagName)) return (n as Element).tagName;
      n = n.parentNode;
    }
    return null;
  }

  function exec(cmd: string, value?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    emit();
  }

  function toggleBlock(tag: 'h2' | 'blockquote') {
    const isOn = tag === 'h2' ? active.h2 : active.blockquote;
    exec('formatBlock', isOn ? '<p>' : `<${tag}>`);
  }

  function openLink() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    const a = sel?.anchorNode ? closest(sel.anchorNode, 'A') : null;
    setLinkValue(a?.getAttribute('href') ?? '');
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    const url = normalizeLink(linkValue);
    if (!url) return setLinkError('Usa un indirizzo http, https o mailto.');
    ref.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
    } else {
      document.execCommand('createLink', false, url);
    }
    setLinkOpen(false);
    emit();
  }

  const Btn = ({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      className={cx('icon-btn', on && 'on')}
      title={label}
      aria-label={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formattazione">
        {(
          [
            ['bold', 'Grassetto', Bold],
            ['italic', 'Corsivo', Italic],
            ['underline', 'Sottolineato', Underline],
          ] as [Cmd, string, typeof Bold][]
        ).map(([cmd, label, Icon]) => (
          <Btn key={cmd} on={active[cmd]} label={label} onClick={() => exec(cmd)}>
            <Icon size={16} />
          </Btn>
        ))}
        <span className="rte-sep" />
        <Btn on={active.h2} label="Titolo H2" onClick={() => toggleBlock('h2')}>
          <Heading2 size={16} />
        </Btn>
        <Btn on={active.insertUnorderedList} label="Elenco puntato" onClick={() => exec('insertUnorderedList')}>
          <List size={16} />
        </Btn>
        <Btn on={active.insertOrderedList} label="Elenco numerato" onClick={() => exec('insertOrderedList')}>
          <ListOrdered size={16} />
        </Btn>
        <Btn on={active.blockquote} label="Citazione" onClick={() => toggleBlock('blockquote')}>
          <Quote size={16} />
        </Btn>
        <span className="rte-sep" />
        <Btn label="Inserisci link" onClick={openLink}>
          <Link2 size={16} />
        </Btn>
        <Btn
          label="Rimuovi formattazione"
          onClick={() => {
            exec('removeFormat');
            exec('unlink');
            exec('formatBlock', '<p>');
          }}
        >
          <RemoveFormatting size={16} />
        </Btn>
      </div>
      {linkOpen && (
        <div className="link-pop">
          <input
            className="input"
            autoFocus
            placeholder="https://… oppure mailto:…"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setLinkOpen(false);
              }
            }}
            aria-label="Indirizzo del link"
          />
          <button type="button" className="btn btn-sm btn-dark" onClick={applyLink}>
            Inserisci
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setLinkOpen(false)}>
            Annulla
          </button>
          {linkError && (
            <span className="form-error" style={{ alignSelf: 'center' }}>
              {linkError}
            </span>
          )}
        </div>
      )}
      <div
        ref={ref}
        className="rte-area rich"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Contenuto della nota"
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={(e) => {
          // incolla come testo semplice: niente stili o script esterni
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          emit();
        }}
      />
    </div>
  );
}
