'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Spinner } from '@/components/ui';
import { computeErLayout, ER_HEADER_H, ER_ROW_H, type ErModel, type ErLayout, type ErNode } from '@/lib/server/dbExplorer/types';

interface Props { connRef: string; db: string; schema: string; }

export function ErDiagram({ connRef, db, schema }: Props) {
  const t = useTranslations();
  const [model, setModel] = useState<ErModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.dbxEr(connRef, db, schema)
      .then((m: ErModel) => { if (alive) setModel(m); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [connRef, db, schema]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={22} /></div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)', fontSize: '13px' }}>{error}</div>;
  if (!model || model.tables.length === 0) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{t('dbx.erEmpty')}</div>;
  }

  const layout: ErLayout = computeErLayout(model.tables, model.edges);
  const nodeByName = new Map<string, ErNode>(layout.nodes.map(n => [n.name, n]));

  return (
    <div>
      {model.edges.length === 0 && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('dbx.erNoFk')}</p>
      )}
      <div style={{ overflow: 'auto', maxHeight: '72vh', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-base)' }}>
        <svg width={layout.width} height={layout.height} style={{ display: 'block', fontFamily: 'var(--font-mono)' }}>
          {/* Kenarlar (FK) — kutuların altında çizilsin diye önce */}
          {model.edges.map((e, i) => {
            const a = nodeByName.get(e.fromTable), b = nodeByName.get(e.toTable);
            if (!a || !b) return null;
            const x1 = a.x + a.w, y1 = a.y + ER_HEADER_H / 2;
            const x2 = b.x, y2 = b.y + ER_HEADER_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.6} />
            );
          })}
          {/* Tablo kutuları */}
          {layout.nodes.map(node => (
            <g key={node.name}>
              <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={6}
                fill="var(--bg-surface)" stroke="var(--border-light)" strokeWidth={1} />
              <rect x={node.x} y={node.y} width={node.w} height={ER_HEADER_H} rx={6}
                fill="var(--bg-elevated)" stroke="var(--border-light)" strokeWidth={1} />
              <text x={node.x + 10} y={node.y + ER_HEADER_H / 2 + 4} fontSize={12} fontWeight={600} fill="var(--text-primary)">
                {node.name}
              </text>
              {node.columns.map((col, ci) => {
                const cy = node.y + ER_HEADER_H + ci * ER_ROW_H;
                const badge = col.isPk ? 'PK' : col.isFk ? 'FK' : '';
                return (
                  <g key={col.name}>
                    <text x={node.x + 10} y={cy + ER_ROW_H / 2 + 4} fontSize={11}
                      fill={col.isPk ? 'var(--accent)' : 'var(--text-secondary)'}>
                      {col.name}
                    </text>
                    {badge && (
                      <text x={node.x + node.w - 10} y={cy + ER_ROW_H / 2 + 4} fontSize={9} textAnchor="end"
                        fill={col.isPk ? 'var(--accent)' : 'var(--text-muted)'} fontFamily="var(--font-sans)">
                        {badge}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
