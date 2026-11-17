import React from 'react';
import { formatYuanYi } from '../lib/api';

// 1. 6-Axis Hexagonal Radar Chart for Dual-Track Scores
export const ScoreRadarChart: React.FC<{
  title: string;
  total: number;
  grade: string;
  accentColor: string;
  dimensions: { key: string; label: string; score: number; maxScore: number }[];
}> = ({ title, total, grade, accentColor, dimensions }) => {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const levels = [0.25, 0.5, 0.75, 1];
  const count = dimensions.length || 6;

  const getPoint = (idx: number, ratio: number) => {
    const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
    return {
      x: cx + radius * ratio * Math.cos(angle),
      y: cy + radius * ratio * Math.sin(angle),
    };
  };

  const dataPoints = dimensions.map((d, idx) => {
    const r = d.maxScore > 0 ? Math.max(0.08, Math.min(1, d.score / d.maxScore)) : 0;
    return getPoint(idx, r);
  });

  const polygonStr = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center gap-4">
      <div className="shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {/* Concentric Hexagons */}
          {levels.map((lv) => {
            const pts = Array.from({ length: count })
              .map((_, i) => {
                const p = getPoint(i, lv);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(' ');
            return (
              <polygon
                key={lv}
                points={pts}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          {/* Axis Lines & Labels */}
          {dimensions.map((d, i) => {
            const outer = getPoint(i, 1);
            const labelPt = getPoint(i, 1.24);
            const pct = d.maxScore > 0 ? Math.round((d.score / d.maxScore) * 100) : 0;
            return (
              <g key={d.key}>
                <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#e2e8f0" strokeWidth="1" />
                <text
                  x={labelPt.x}
                  y={labelPt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-600 text-[10px] font-medium"
                >
                  {d.label.replace('长期', '').replace('水平', '').replace('前景', '')} ({pct}%)
                </text>
              </g>
            );
          })}
          {/* Score Area */}
          <polygon
            points={polygonStr}
            fill={accentColor}
            fillOpacity="0.18"
            stroke={accentColor}
            strokeWidth="2"
          />
          {dataPoints.map((p, idx) => (
            <circle key={idx} cx={p.x} cy={p.y} r="3.2" fill={accentColor} stroke="#fff" strokeWidth="1.2" />
          ))}
        </svg>
      </div>

      <div className="flex-1 w-full space-y-2.5 text-xs">
        <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
          <span className="font-semibold text-slate-900">{title}</span>
          <span>
            <span className="text-xl font-bold font-mono tabular-nums" style={{ color: accentColor }}>
              {total}
            </span>
            <span className="text-slate-500 ml-1 font-mono">/ 100 · {grade}</span>
          </span>
        </div>
        <div className="space-y-1.5">
          {dimensions.map((d) => {
            const pct = d.maxScore > 0 ? (d.score / d.maxScore) * 100 : 0;
            return (
              <div key={d.key} className="space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-700">{d.label}</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {d.score} / {d.maxScore}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: accentColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 2. Revenue, Net Profit & Operating Cash Flow Grouped Bar Chart
export const FinancialTrendChart: React.FC<{
  rows: any[];
  title: string;
}> = ({ rows, title }) => {
  const ordered = [...rows]
    .filter((r) => r.revenue !== null || r.netProfit !== null)
    .slice(0, 6)
    .reverse();

  if (ordered.length === 0) {
    return (
      <div className="p-5 bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
        暂无足够周期的财务趋势数据用于绘图。
      </div>
    );
  }

  const maxAbs = Math.max(
    1,
    ...ordered.flatMap((r) => [
      Math.abs(r.revenue || 0),
      Math.abs(r.netProfit || 0),
      Math.abs(r.operatingCashFlow || 0),
    ])
  );

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-700 inline-block" />
            营业收入
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600 inline-block" />
            归母净利润
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />
            经营现金流
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
        {ordered.map((r) => {
          const revH = r.revenue ? Math.max(4, Math.round((Math.abs(r.revenue) / maxAbs) * 100)) : 0;
          const npH = r.netProfit ? Math.max(4, Math.round((Math.abs(r.netProfit) / maxAbs) * 100)) : 0;
          const cfH = r.operatingCashFlow ? Math.max(4, Math.round((Math.abs(r.operatingCashFlow) / maxAbs) * 100)) : 0;
          return (
            <div key={r.reportDate} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between">
              <div className="h-28 flex items-end justify-center gap-2 border-b border-slate-200 pb-1.5">
                <div className="flex flex-col items-center justify-end h-full w-4">
                  <div
                    title={`营收 ${formatYuanYi(r.revenue)}`}
                    className="w-full bg-blue-700 rounded-t-sm"
                    style={{ height: `${revH}%` }}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-4">
                  <div
                    title={`净利 ${formatYuanYi(r.netProfit)}`}
                    className={`w-full rounded-t-sm ${(r.netProfit || 0) >= 0 ? 'bg-red-600' : 'bg-emerald-600'}`}
                    style={{ height: `${npH}%` }}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-4">
                  <div
                    title={`现金流 ${formatYuanYi(r.operatingCashFlow)}`}
                    className={`w-full rounded-t-sm ${(r.operatingCashFlow || 0) >= 0 ? 'bg-teal-600' : 'bg-amber-600'}`}
                    style={{ height: `${cfH}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 text-center space-y-0.5 text-[11px] font-mono tabular-nums">
                <div className="font-semibold text-slate-900">{r.reportDate}</div>
                <div className="text-blue-700">{formatYuanYi(r.revenue)}</div>
                <div className={(r.netProfit || 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                  净利 {formatYuanYi(r.netProfit)}
                </div>
                <div className="text-slate-500 text-[10px]">
                  ROE {r.roe !== null ? `${r.roe.toFixed(1)}%` : '-'} · 毛利 {r.grossMargin !== null ? `${r.grossMargin.toFixed(1)}%` : '-'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 3. Main Business Composition Stacked Bar & Margin Breakdown
export const BusinessMixChart: React.FC<{
  composition: any[];
}> = ({ composition }) => {
  const byProduct = composition.filter((c) => c.type === '按产品');
  const items = (byProduct.length ? byProduct : composition).slice(0, 6);
  if (!items.length) return null;

  const colors = ['#1d4ed8', '#0284c7', '#0d9488', '#6366f1', '#64748b', '#94a3b8'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-900">
          主营收入构成可视化 ({items[0]?.type || '业务结构'} · {items[0]?.reportDate})
        </span>
      </div>
      {/* Proportional stacked bar */}
      <div className="h-4 w-full bg-slate-100 rounded-md overflow-hidden flex">
        {items.map((c, idx) => (
          <div
            key={idx}
            title={`${c.itemName}: ${c.ratioPct ?? 0}%`}
            style={{
              width: `${Math.max(2, Number(c.ratioPct || 0))}%`,
              backgroundColor: colors[idx % colors.length],
            }}
            className="h-full border-r border-white last:border-r-0"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {items.map((c, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="text-slate-800 truncate" title={c.itemName}>
                {c.itemName}
              </span>
            </div>
            <div className="font-mono tabular-nums text-right shrink-0 ml-2">
              <span className="font-semibold text-slate-900">{c.ratioPct !== null ? `${c.ratioPct.toFixed(1)}%` : '-'}</span>
              {c.grossMarginPct !== null && (
                <span className="text-slate-500 ml-1.5 text-[11px]">毛利{c.grossMarginPct.toFixed(1)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. Visual Price Range & Scenario Ladder
export const PriceRangeLadder: React.FC<{
  title: string;
  currentPrice: number | null;
  markers: { label: string; value: number; colorClass: string }[];
}> = ({ title, currentPrice, markers }) => {
  const valid = markers.filter((m) => typeof m.value === 'number' && !Number.isNaN(m.value) && m.value > 0);
  if (currentPrice) {
    valid.push({ label: '现价', value: currentPrice, colorClass: 'bg-slate-900 text-white' });
  }
  if (valid.length < 2) return null;

  const min = Math.min(...valid.map((v) => v.value)) * 0.96;
  const max = Math.max(...valid.map((v) => v.value)) * 1.04;
  const span = Math.max(0.01, max - min);
  const posPct = (val: number) => Math.max(2, Math.min(98, ((val - min) / span) * 100));

  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
      <div className="flex items-center justify-between font-medium text-slate-900">
        <span>{title}</span>
        {currentPrice !== null && (
          <span className="font-mono text-slate-600">当前价：{currentPrice.toFixed(2)} 元</span>
        )}
      </div>
      <div className="relative h-8 flex items-center">
        <div className="w-full h-2 bg-slate-200 rounded-full relative">
          {valid.map((m, idx) => (
            <div
              key={`${m.label}-${idx}`}
              style={{ left: `${posPct(m.value)}%` }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              title={`${m.label}: ${m.value.toFixed(2)}`}
            >
              <div className={`w-3 h-3 rounded-full border-2 border-white shadow ${m.colorClass.split(' ')[0]}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        {[...valid]
          .sort((a, b) => a.value - b.value)
          .map((m, i) => (
            <div key={i} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span className={`w-2 h-2 rounded-full ${m.colorClass.split(' ')[0]}`} />
              <span className="font-sans text-slate-600">{m.label}:</span>
              <span className="font-semibold text-slate-900">{m.value.toFixed(2)}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

// 5. Capital Flow Breakdown Bars + Intraday Cumulative Curve
export const CapitalFlowVisuals: React.FC<{
  todaySnapshot: any;
  intradayCurve: { time: string; mainNetInflowEst: number; superLargeNetInflow: number; retailNetInflow: number }[];
}> = ({ todaySnapshot, intradayCurve }) => {
  const buckets = todaySnapshot
    ? [
        { label: '主力合计', val: todaySnapshot.mainNetInflowEst || 0 },
        { label: '超大单', val: todaySnapshot.superLargeNetInflow || 0 },
        { label: '大单', val: todaySnapshot.largeNetInflow || 0 },
        { label: '中单', val: todaySnapshot.mediumNetInflow || 0 },
        { label: '小单', val: todaySnapshot.smallNetInflow || 0 },
      ]
    : [];

  const maxBucket = Math.max(1, ...buckets.map((b) => Math.abs(b.val)));

  // Intraday curve SVG
  const width = 460;
  const height = 140;
  const padX = 8;
  const padY = 14;
  const curveVals = intradayCurve.map((p) => p.mainNetInflowEst);
  const cMax = curveVals.length ? Math.max(0, ...curveVals) : 1;
  const cMin = curveVals.length ? Math.min(0, ...curveVals) : -1;
  const cRange = Math.max(1, cMax - cMin);
  const zeroY = padY + ((cMax - 0) / cRange) * (height - padY * 2);

  const polyPoints = intradayCurve
    .map((p, idx) => {
      const x = padX + (idx / Math.max(1, intradayCurve.length - 1)) * (width - padX * 2);
      const y = padY + ((cMax - p.mainNetInflowEst) / cRange) * (height - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latestMain = intradayCurve.length ? intradayCurve[intradayCurve.length - 1].mainNetInflowEst : 0;
  const strokeColor = latestMain >= 0 ? '#dc2626' : '#059669';

  return (
    <div className="space-y-4">
      {buckets.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-700">当日各维度资金估算净流向对比</div>
          <div className="space-y-2">
            {buckets.map((b) => {
              const pct = Math.min(100, Math.round((Math.abs(b.val) / maxBucket) * 100));
              const isPos = b.val >= 0;
              return (
                <div key={b.label} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <div className="col-span-3 text-slate-600">{b.label}</div>
                  <div className="col-span-6 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isPos ? 'bg-red-600' : 'bg-emerald-600'}`}
                      style={{ width: `${Math.max(3, pct)}%` }}
                    />
                  </div>
                  <div
                    className={`col-span-3 text-right font-mono tabular-nums font-medium ${
                      isPos ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {isPos ? '+' : ''}
                    {formatYuanYi(b.val)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {intradayCurve.length > 2 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-800">分时累计主力估算净流入轨迹 ({intradayCurve[0].time} - {intradayCurve[intradayCurve.length - 1].time})</span>
            <span className={`font-mono font-semibold ${latestMain >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {latestMain >= 0 ? '+' : ''}
              {formatYuanYi(latestMain)}
            </span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
            <line
              x1={padX}
              y1={zeroY}
              x2={width - padX}
              y2={zeroY}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              points={polyPoints}
            />
          </svg>
        </div>
      )}
    </div>
  );
};

// 6. RSI(14) Horizontal Zone Bar
export const RsiZoneBar: React.FC<{ rsi: number | null | undefined }> = ({ rsi }) => {
  if (rsi === null || rsi === undefined) return null;
  const clamped = Math.max(0, Math.min(100, rsi));
  const label = rsi >= 70 ? '超买警戒区' : rsi <= 30 ? '超卖观察区' : '常态震荡区';
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-slate-600">RSI(14) 强弱位置标尺</span>
        <span className="font-mono font-semibold text-slate-900">
          {rsi.toFixed(1)} · <span className={rsi >= 70 ? 'text-red-600' : rsi <= 30 ? 'text-emerald-600' : 'text-blue-700'}>{label}</span>
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full overflow-hidden flex">
        <div className="w-[30%] bg-emerald-100 border-r border-white" title="超卖区 (0-30)" />
        <div className="w-[40%] bg-slate-200 border-r border-white" title="中性区 (30-70)" />
        <div className="w-[30%] bg-red-100" title="超买区 (70-100)" />
        <div
          style={{ left: `${clamped}%` }}
          className="absolute top-0 bottom-0 w-1 bg-slate-900 -translate-x-1/2"
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-slate-400">
        <span>0 (超卖&lt;30)</span>
        <span>50</span>
        <span>(超买&gt;70) 100</span>
      </div>
    </div>
  );
};
