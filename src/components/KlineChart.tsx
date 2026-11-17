import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts';

interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorPoint {
  time: string;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120?: number | null;
  bollUpper: number | null;
  bollLower: number | null;
}

export interface KlinePriceLine {
  price: number;
  color: string;
  title: string;
  lineStyle?: number; // 0 Solid, 1 Dotted, 2 Dashed, 3 LargeDashed
  lineWidth?: 1 | 2 | 3 | 4;
}

interface KlineChartProps {
  bars: Bar[];
  indicators?: IndicatorPoint[];
  showMA?: boolean;
  showMA120?: boolean;
  showBoll?: boolean;
  priceLines?: KlinePriceLine[];
  height?: number;
}

function toChartTime(t: string): any {
  if (t.includes(' ')) {
    const iso = t.replace(' ', 'T') + ':00+08:00';
    return Math.floor(new Date(iso).getTime() / 1000);
  }
  return t.slice(0, 10);
}

export const KlineChart: React.FC<KlineChartProps> = ({
  bars,
  indicators = [],
  showMA = true,
  showMA120 = false,
  showBoll = false,
  priceLines = [],
  height = 420,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !bars.length) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#475569',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      rightPriceScale: {
        borderColor: '#e2e8f0',
      },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: bars[0]?.time.includes(' '),
      },
    });

    // Deduplicate sorted times for lightweight-charts safety
    const seen = new Set<string | number>();
    const cleanBars: { bar: Bar; ct: any; idx: number }[] = [];
    bars.forEach((b, idx) => {
      const ct = toChartTime(b.time);
      if (!seen.has(ct)) {
        seen.add(ct);
        cleanBars.push({ bar: b, ct, idx });
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#dc2626',
      downColor: '#16a34a',
      borderUpColor: '#dc2626',
      borderDownColor: '#16a34a',
      wickUpColor: '#dc2626',
      wickDownColor: '#16a34a',
    });

    candleSeries.setData(
      cleanBars.map(({ bar, ct }) => ({
        time: ct,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
    );

    if (priceLines.length > 0) {
      for (const pl of priceLines) {
        if (typeof pl.price === 'number' && !Number.isNaN(pl.price) && pl.price > 0) {
          candleSeries.createPriceLine({
            price: pl.price,
            color: pl.color,
            lineWidth: pl.lineWidth ?? 1,
            lineStyle: (pl.lineStyle ?? 2) as any,
            axisLabelVisible: true,
            title: pl.title,
          });
        }
      }
    }

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volSeries.setData(
      cleanBars.map(({ bar, ct }) => ({
        time: ct,
        value: bar.volume,
        color: bar.close >= bar.open ? 'rgba(220, 38, 38, 0.25)' : 'rgba(22, 163, 74, 0.25)',
      }))
    );

    if (showMA && indicators.length === bars.length) {
      const ma5 = chart.addSeries(LineSeries, { color: '#2563eb', lineWidth: 1, title: 'MA5' });
      const ma20 = chart.addSeries(LineSeries, { color: '#d97706', lineWidth: 1, title: 'MA20' });
      const ma60 = chart.addSeries(LineSeries, { color: '#7c3aed', lineWidth: 1, title: 'MA60' });

      ma5.setData(
        cleanBars
          .filter(({ idx }) => indicators[idx]?.ma5 !== null)
          .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].ma5! }))
      );
      ma20.setData(
        cleanBars
          .filter(({ idx }) => indicators[idx]?.ma20 !== null)
          .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].ma20! }))
      );
      ma60.setData(
        cleanBars
          .filter(({ idx }) => indicators[idx]?.ma60 !== null)
          .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].ma60! }))
      );

      if (showMA120) {
        const ma120 = chart.addSeries(LineSeries, { color: '#0f172a', lineWidth: 1, lineStyle: 2, title: 'MA120' });
        ma120.setData(
          cleanBars
            .filter(({ idx }) => indicators[idx]?.ma120 !== null && indicators[idx]?.ma120 !== undefined)
            .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].ma120! }))
        );
      }
    }

    if (showBoll && indicators.length === bars.length) {
      const upper = chart.addSeries(LineSeries, {
        color: '#0f766e',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BOLL上轨',
      });
      const lower = chart.addSeries(LineSeries, {
        color: '#0f766e',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BOLL下轨',
      });
      upper.setData(
        cleanBars
          .filter(({ idx }) => indicators[idx]?.bollUpper !== null)
          .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].bollUpper! }))
      );
      lower.setData(
        cleanBars
          .filter(({ idx }) => indicators[idx]?.bollLower !== null)
          .map(({ ct, idx }) => ({ time: ct, value: indicators[idx].bollLower! }))
      );
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [bars, indicators, showMA, showMA120, showBoll, priceLines, height]);

  if (!bars.length) {
    return (
      <div className="h-[340px] flex items-center justify-center border border-slate-200 bg-slate-50 text-sm text-slate-500">
        暂无K线数据（或当前数据源未返回该周期K线）
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
};

export const EquityCurveChart: React.FC<{
  curve: { time: string; strategyEquity: number; benchmarkEquity: number }[];
}> = ({ curve }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !curve.length) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#475569',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0' },
    });

    const strat = chart.addSeries(LineSeries, { color: '#1d4ed8', lineWidth: 2, title: '策略净值' });
    const bench = chart.addSeries(LineSeries, { color: '#94a3b8', lineWidth: 1, lineStyle: 2, title: '买入持有基准' });

    const seen = new Set<string>();
    const dedup = curve.filter((c) => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    });

    strat.setData(dedup.map((d) => ({ time: d.time, value: d.strategyEquity })));
    bench.setData(dedup.map((d) => ({ time: d.time, value: d.benchmarkEquity })));
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [curve]);

  if (!curve.length) return null;
  return <div ref={ref} className="w-full" />;
};
