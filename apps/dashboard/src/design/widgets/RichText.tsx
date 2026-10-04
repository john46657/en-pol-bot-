import { parseRichText, type Inline } from '@nexus/design/client';
import { Fragment } from 'react';

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === 'text') return <Fragment key={i}>{n.s}</Fragment>;
        if (n.t === 'b')
          return (
            <strong key={i}>
              <Inl nodes={n.children} />
            </strong>
          );
        if (n.t === 'i')
          return (
            <em key={i}>
              <Inl nodes={n.children} />
            </em>
          );
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            <Inl nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

/** Zeigt den einfachen Text-Dialekt (Überschrift, Liste, fett, kursiv, Link) – ohne je HTML aus der Eingabe zu erzeugen. */
export function RichText({ source }: { source: string }) {
  const blocks = parseRichText(source);
  return (
    <div className="rich">
      {blocks.map((b, i) => {
        if (b.t === 'h') {
          const H = `h${b.level + 2}` as 'h3' | 'h4' | 'h5'; // Überschriften im Widget nie größer als h3
          return (
            <H key={i}>
              <Inl nodes={b.inline} />
            </H>
          );
        }
        if (b.t === 'ul')
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inl nodes={it} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            <Inl nodes={b.inline} />
          </p>
        );
      })}
    </div>
  );
}
