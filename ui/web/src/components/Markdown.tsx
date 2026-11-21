import type { ReactNode } from 'react';

// A small Markdown subset for Claude's replies: headings, paragraphs, lists, tables, code,
// quotes, bold, italics and links. Built as React elements, so no HTML is ever injected.

export function Markdown({ text }: { text: string }) {
  return <div className="md">{blocks(text.replace(/\r\n/g, '\n').split('\n'))}</div>;
}

function blocks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  const key = (): number => out.length;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```'))
        body.push(lines[i++] ?? '');
      i++;
      out.push(<pre key={key()}>{body.join('\n')}</pre>);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min((heading[1] ?? '#').length + 2, 6);
      const Tag = `h${level}` as 'h3';
      out.push(<Tag key={key()}>{inline(heading[2] ?? '')}</Tag>);
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? '')) rows.push(lines[i++] ?? '');
      out.push(<Table key={key()} rows={rows} />);
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i] ?? '')) {
        items.push((lines[i++] ?? '').replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      }
      const children = items.map((item, n) => <li key={n}>{inline(item)}</li>);
      out.push(ordered ? <ol key={key()}>{children}</ol> : <ul key={key()}>{children}</ul>);
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>'))
        quote.push((lines[i++] ?? '').replace(/^>\s?/, ''));
      out.push(<blockquote key={key()}>{inline(quote.join(' '))}</blockquote>);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() && !isBlockStart(lines[i] ?? ''))
      para.push(lines[i++] ?? '');
    out.push(<p key={key()}>{withBreaks(para)}</p>);
  }
  return out;
}

function isBlockStart(line: string): boolean {
  return /^(#{1,4}\s|\s*```|\s*\|.*\|\s*$|\s*([-*+]|\d+[.)])\s+|>)/.test(line);
}

function withBreaks(lines: string[]): ReactNode[] {
  return lines.flatMap((line, n) =>
    n === 0 ? [inline(line)] : [<br key={`br${n}`} />, inline(line)],
  );
}

function Table({ rows }: { rows: string[] }) {
  const cells = (row: string): string[] =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const isDivider = (row: string): boolean => /^\s*\|[\s:|-]+\|\s*$/.test(row);
  const [head, ...rest] = rows;
  const body = rest.filter((row) => !isDivider(row));
  return (
    <div className="md-table">
      <table>
        <thead>
          <tr>{head && cells(head).map((c, n) => <th key={n}>{inline(c)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {cells(row).map((c, n) => (
                <td key={n}>{inline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>)\]]+)|(\*[^*\s][^*]*\*|(?<![\p{L}\p{N}])_[^_\s][^_]*_(?![\p{L}\p{N}]))/gu;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const [token] = m;
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${m.index}`;
    if (m[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2))}</strong>);
    else if (m[3]) {
      const split = token.indexOf('](');
      out.push(<Link key={k} href={token.slice(split + 2, -1)} label={token.slice(1, split)} />);
    } else if (m[4]) out.push(<Link key={k} href={token} label={token} />);
    else out.push(<em key={k}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
