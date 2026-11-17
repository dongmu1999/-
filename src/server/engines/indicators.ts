export interface OhlcvBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number | null;
}

export interface IndicatorSeriesPoint {
  time: string;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma250: number | null;
  ema12: number | null;
  ema26: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
  rsi14: number | null;
  kdjK: number | null;
  kdjD: number | null;
  kdjJ: number | null;
  bollUpper: number | null;
  bollMid: number | null;
  bollLower: number | null;
  atr14: number | null;
  obv: number;
  vwap: number | null;
}

export interface TechnicalSummary {
  latest: IndicatorSeriesPoint | null;
  maAlignment: string;
  trendDirection: '上行趋势' | '震荡整理' | '下行趋势' | '数据不足';
  crossovers: string[];
  volumeAnalysis: string;
  divergenceSignals: string[];
  candlestickPatterns: string[];
  volatilityState: string;
  breakoutState: string;
  supportLevels: number[];
  resistanceLevels: number[];
  vwapMethodology: string;
  series: IndicatorSeriesPoint[];
}

function sma(values: number[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += values[i];
  return Number((sum / period).toFixed(4));
}

export function computeTechnicalIndicators(bars: OhlcvBar[]): TechnicalSummary {
  if (!bars || bars.length === 0) {
    return {
      latest: null,
      maAlignment: '数据不足',
      trendDirection: '数据不足',
      crossovers: [],
      volumeAnalysis: '暂无K线成交量数据',
      divergenceSignals: [],
      candlestickPatterns: [],
      volatilityState: '数据不足',
      breakoutState: '数据不足',
      supportLevels: [],
      resistanceLevels: [],
      vwapMethodology: '基于累计典型价 (H+L+C)/3 × 成交量加权平均计算（无逐笔Tick数据时为周期近似口径）',
      series: [],
    };
  }

  const closes = bars.map((b) => b.close);
  const ema12Arr: number[] = [];
  const ema26Arr: number[] = [];
  const difArr: number[] = [];
  const deaArr: number[] = [];

  const k12 = 2 / 13;
  const k26 = 2 / 27;
  const k9 = 2 / 10;

  let prevEma12 = closes[0];
  let prevEma26 = closes[0];
  let prevDea = 0;

  for (let i = 0; i < bars.length; i++) {
    const c = closes[i];
    if (i === 0) {
      prevEma12 = c;
      prevEma26 = c;
    } else {
      prevEma12 = c * k12 + prevEma12 * (1 - k12);
      prevEma26 = c * k26 + prevEma26 * (1 - k26);
    }
    ema12Arr.push(prevEma12);
    ema26Arr.push(prevEma26);
    const dif = prevEma12 - prevEma26;
    difArr.push(dif);
    prevDea = i === 0 ? dif : dif * k9 + prevDea * (1 - k9);
    deaArr.push(prevDea);
  }

  // RSI(14) Wilder
  const rsiArr: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length > 14) {
    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gainSum += diff;
      else lossSum += -diff;
    }
    let avgGain = gainSum / 14;
    let avgLoss = lossSum / 14;
    rsiArr[14] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
    for (let i = 15; i < bars.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * 13 + gain) / 14;
      avgLoss = (avgLoss * 13 + loss) / 14;
      rsiArr[i] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
    }
  }

  // KDJ(9,3,3)
  let kVal = 50;
  let dVal = 50;
  const kdjArr: { k: number; d: number; j: number }[] = [];
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - 8);
    let low9 = Infinity;
    let high9 = -Infinity;
    for (let j = start; j <= i; j++) {
      if (bars[j].low < low9) low9 = bars[j].low;
      if (bars[j].high > high9) high9 = bars[j].high;
    }
    const rsv = high9 === low9 ? 50 : ((bars[i].close - low9) / (high9 - low9)) * 100;
    kVal = (2 / 3) * kVal + (1 / 3) * rsv;
    dVal = (2 / 3) * dVal + (1 / 3) * kVal;
    const jVal = 3 * kVal - 2 * dVal;
    kdjArr.push({
      k: Number(kVal.toFixed(2)),
      d: Number(dVal.toFixed(2)),
      j: Number(jVal.toFixed(2)),
    });
  }

  // ATR(14)
  const trArr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (i === 0) {
      trArr.push(b.high - b.low);
    } else {
      const pc = bars[i - 1].close;
      trArr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
    }
  }

  // OBV & Rolling 20-bar VWAP
  let obv = 0;
  const series: IndicatorSeriesPoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (i > 0) {
      if (b.close > bars[i - 1].close) obv += b.volume;
      else if (b.close < bars[i - 1].close) obv -= b.volume;
    }

    const ma20 = sma(closes, i, 20);
    let bollUpper: number | null = null;
    let bollLower: number | null = null;
    if (ma20 !== null) {
      let variance = 0;
      for (let j = i - 19; j <= i; j++) {
        variance += Math.pow(closes[j] - ma20, 2);
      }
      const std = Math.sqrt(variance / 20);
      bollUpper = Number((ma20 + 2 * std).toFixed(3));
      bollLower = Number((ma20 - 2 * std).toFixed(3));
    }

    // 20-bar VWAP
    let pvSum = 0;
    let vSum = 0;
    const vStart = Math.max(0, i - 19);
    for (let j = vStart; j <= i; j++) {
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
      pvSum += tp * bars[j].volume;
      vSum += bars[j].volume;
    }
    const vwap = vSum > 0 ? Number((pvSum / vSum).toFixed(3)) : null;

    series.push({
      time: b.time,
      ma5: sma(closes, i, 5),
      ma10: sma(closes, i, 10),
      ma20,
      ma60: sma(closes, i, 60),
      ma120: sma(closes, i, 120),
      ma250: sma(closes, i, 250),
      ema12: Number(ema12Arr[i].toFixed(3)),
      ema26: Number(ema26Arr[i].toFixed(3)),
      macdDif: Number(difArr[i].toFixed(4)),
      macdDea: Number(deaArr[i].toFixed(4)),
      macdHist: Number(((difArr[i] - deaArr[i]) * 2).toFixed(4)),
      rsi14: rsiArr[i],
      kdjK: kdjArr[i].k,
      kdjD: kdjArr[i].d,
      kdjJ: kdjArr[i].j,
      bollUpper,
      bollMid: ma20,
      bollLower,
      atr14: sma(trArr, i, 14),
      obv: Math.round(obv),
      vwap,
    });
  }

  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;

  // MA Alignment & Trend
  let maAlignment = '均线交织';
  let trendDirection: '上行趋势' | '震荡整理' | '下行趋势' | '数据不足' = '震荡整理';
  if (latest.ma5 && latest.ma10 && latest.ma20 && latest.ma60) {
    if (latest.ma5 > latest.ma10 && latest.ma10 > latest.ma20 && latest.ma20 > latest.ma60) {
      maAlignment = '多头排列 (MA5 > MA10 > MA20 > MA60)';
      trendDirection = '上行趋势';
    } else if (latest.ma5 < latest.ma10 && latest.ma10 < latest.ma20 && latest.ma20 < latest.ma60) {
      maAlignment = '空头排列 (MA5 < MA10 < MA20 < MA60)';
      trendDirection = '下行趋势';
    } else if (lastBar.close > latest.ma20 && latest.ma20 > latest.ma60) {
      maAlignment = '偏多震荡（站稳MA20与MA60之上）';
      trendDirection = '上行趋势';
    } else if (lastBar.close < latest.ma20 && latest.ma20 < latest.ma60) {
      maAlignment = '偏空承压（运行于MA20与MA60下方）';
      trendDirection = '下行趋势';
    }
  } else if (latest.ma5 && latest.ma20) {
    trendDirection = lastBar.close > latest.ma20 ? '上行趋势' : '震荡整理';
    maAlignment = '中长期均线样本不足，仅参考短中期MA5/MA20';
  }

  const crossovers: string[] = [];
  if (prev && latest.ma5 && latest.ma10 && prev.ma5 && prev.ma10) {
    if (prev.ma5 <= prev.ma10 && latest.ma5 > latest.ma10) crossovers.push('MA5 上穿 MA10 金叉');
    if (prev.ma5 >= prev.ma10 && latest.ma5 < latest.ma10) crossovers.push('MA5 下穿 MA10 死叉');
  }
  if (prev && latest.macdDif !== null && latest.macdDea !== null && prev.macdDif !== null && prev.macdDea !== null) {
    if (prev.macdDif <= prev.macdDea && latest.macdDif > latest.macdDea) crossovers.push('MACD DIF 上穿 DEA 金叉');
    if (prev.macdDif >= prev.macdDea && latest.macdDif < latest.macdDea) crossovers.push('MACD DIF 下穿 DEA 死叉');
  }
  if (prev && latest.kdjK !== null && latest.kdjD !== null && prev.kdjK !== null && prev.kdjD !== null) {
    if (prev.kdjK <= prev.kdjD && latest.kdjK > latest.kdjD) crossovers.push('KDJ 低位/中位金叉');
    if (prev.kdjK >= prev.kdjD && latest.kdjK < latest.kdjD) crossovers.push('KDJ 死叉');
  }

  // Volume & Divergence
  const recent20Bars = bars.slice(-20);
  const avgVol20 = recent20Bars.reduce((s, b) => s + b.volume, 0) / recent20Bars.length;
  const volRatio20 = avgVol20 > 0 ? lastBar.volume / avgVol20 : 1;
  let volumeAnalysis = `当前成交量相对20周期均量比 ${volRatio20.toFixed(2)}x`;
  if (volRatio20 >= 1.8) volumeAnalysis += '（显著放量）';
  else if (volRatio20 >= 1.2) volumeAnalysis += '（温和放量）';
  else if (volRatio20 <= 0.65) volumeAnalysis += '（明显缩量）';
  else volumeAnalysis += '（量能平稳）';

  const divergenceSignals: string[] = [];
  if (bars.length >= 15) {
    const seg1 = bars.slice(-15, -5);
    const seg2 = bars.slice(-5);
    const maxP1 = Math.max(...seg1.map((b) => b.high));
    const maxP2 = Math.max(...seg2.map((b) => b.high));
    const maxV1 = Math.max(...seg1.map((b) => b.volume));
    const maxV2 = Math.max(...seg2.map((b) => b.volume));
    if (maxP2 > maxP1 * 1.02 && maxV2 < maxV1 * 0.85) {
      divergenceSignals.push('近期价格创新高但量能未同步放大（量价顶背离警示）');
    }
    const minP1 = Math.min(...seg1.map((b) => b.low));
    const minP2 = Math.min(...seg2.map((b) => b.low));
    if (minP2 < minP1 * 0.98 && latest.obv > series[series.length - 10].obv) {
      divergenceSignals.push('价格下探但OBV指标抬升（潜在底背离观察）');
    }
  }

  // Candlestick patterns
  const candlestickPatterns: string[] = [];
  const body = Math.abs(lastBar.close - lastBar.open);
  const range = Math.max(0.0001, lastBar.high - lastBar.low);
  const upperShadow = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const lowerShadow = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  if (body / range < 0.12) candlestickPatterns.push('十字星（多空分歧）');
  if (lowerShadow > body * 2.2 && upperShadow < body * 0.5) candlestickPatterns.push('长下影线（下方承接）');
  if (upperShadow > body * 2.2 && lowerShadow < body * 0.5) candlestickPatterns.push('长上影线（上方抛压）');
  if (
    prevBar &&
    lastBar.close > lastBar.open &&
    prevBar.close < prevBar.open &&
    lastBar.close > prevBar.open &&
    lastBar.open < prevBar.close
  ) {
    candlestickPatterns.push('阳包阴看涨吞没');
  }

  // Support / Resistance & Breakout
  const window60 = bars.slice(-60);
  const high60 = Math.max(...window60.map((b) => b.high));
  const low60 = Math.min(...window60.map((b) => b.low));
  const window20 = bars.slice(-20, -1);
  const prevHigh20 = window20.length ? Math.max(...window20.map((b) => b.high)) : high60;
  const prevLow20 = window20.length ? Math.min(...window20.map((b) => b.low)) : low60;

  let breakoutState = '区间内运行';
  if (lastBar.close > prevHigh20 && volRatio20 >= 1.2) {
    breakoutState = `放量突破20周期高点 (${prevHigh20.toFixed(2)})`;
  } else if (lastBar.high > prevHigh20 && lastBar.close <= prevHigh20) {
    breakoutState = `盘中冲高回落未站稳前高 (${prevHigh20.toFixed(2)})，警惕假突破`;
  } else if (lastBar.close < prevLow20) {
    breakoutState = `跌破20周期支撑 (${prevLow20.toFixed(2)})`;
  }

  const supportLevels = Array.from(
    new Set(
      [prevLow20, latest.ma20, latest.ma60, latest.bollLower, low60]
        .filter((v): v is number => v !== null && v > 0 && v <= lastBar.close * 1.02)
        .map((v) => Number(v.toFixed(2)))
    )
  )
    .sort((a, b) => b - a)
    .slice(0, 3);

  const resistanceLevels = Array.from(
    new Set(
      [prevHigh20, latest.bollUpper, high60]
        .filter((v): v is number => v !== null && v >= lastBar.close * 0.99)
        .map((v) => Number(v.toFixed(2)))
    )
  )
    .sort((a, b) => a - b)
    .slice(0, 3);

  let volatilityState = '波动率平稳';
  if (latest.atr14 && lastBar.close > 0) {
    const atrPct = (latest.atr14 / lastBar.close) * 100;
    if (atrPct > 4.5) volatilityState = `高波动状态 (ATR占比 ${atrPct.toFixed(2)}%)`;
    else if (atrPct < 1.8) volatilityState = `低波动收敛 (ATR占比 ${atrPct.toFixed(2)}%)`;
    else volatilityState = `中等波动 (ATR占比 ${atrPct.toFixed(2)}%)`;
  }

  return {
    latest,
    maAlignment,
    trendDirection,
    crossovers,
    volumeAnalysis,
    divergenceSignals,
    candlestickPatterns,
    volatilityState,
    breakoutState,
    supportLevels,
    resistanceLevels,
    vwapMethodology: '基于20周期滚动典型价 (H+L+C)/3 × 成交量加权平均计算（无逐笔Tick数据时为周期近似口径）',
    series,
  };
}
