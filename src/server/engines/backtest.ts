import { computeTechnicalIndicators, OhlcvBar } from './indicators.ts';
import { evaluateTradingRule } from './tradingRules.ts';

export type BacktestStrategyType =
  | 'MA_CROSS'
  | 'BOLL_RSI'
  | 'BREAKOUT_MOMENTUM'
  | 'VALUE_DISCIPLINE';

export interface BacktestParams {
  symbol: string;
  stockName: string;
  strategyType: BacktestStrategyType;
  periodLabel: '30D' | '90D' | '180D' | '1Y' | '3Y' | '5Y';
  initialCapital: number;
  commissionRatePct?: number;
  slippageBps?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}

export interface BacktestTradeRecord {
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  shares: number;
  pnlYuan: number;
  returnPct: number;
  holdingDays: number;
  exitReason: string;
}

export function runAShareBacktest(bars: OhlcvBar[], params: BacktestParams) {
  const periodDaysMap: Record<string, number> = {
    '30D': 22,
    '90D': 65,
    '180D': 125,
    '1Y': 250,
    '3Y': 750,
    '5Y': 1250,
  };
  const lookbackNeeded = 60;
  const targetBars = periodDaysMap[params.periodLabel] || 250;
  const sliced = bars.slice(-(targetBars + lookbackNeeded));
  const summary = computeTechnicalIndicators(sliced);
  const series = summary.series;

  const startIdx = Math.min(lookbackNeeded, Math.max(20, Math.floor(sliced.length * 0.2)));
  const rule = evaluateTradingRule({ symbol: params.symbol, name: params.stockName });
  const limitPct = rule.priceLimitPct ?? 20;

  const commRate = (params.commissionRatePct ?? rule.fees.commissionRatePct) / 100;
  const stampDutySell = rule.fees.stampDutySellPct / 100;
  const transferFee = rule.fees.transferFeePct / 100;
  const slip = (params.slippageBps ?? 10) / 10000;
  const stopLossPct = params.stopLossPct ?? 8;
  const takeProfitPct = params.takeProfitPct ?? 20;

  let cash = params.initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let entryIdx = -1;
  let entryDate = '';
  let blockedBuyCount = 0;
  let blockedSellCount = 0;

  const trades: BacktestTradeRecord[] = [];
  const equityCurve: { time: string; strategyEquity: number; benchmarkEquity: number }[] = [];
  const basePrice = sliced[startIdx]?.open || 1;

  for (let i = startIdx; i < sliced.length - 1; i++) {
    const barToday = sliced[i];
    const barNext = sliced[i + 1]; // Execution strictly at t+1 open (no look-ahead)
    const indToday = series[i];
    const indPrev = series[i - 1];

    // Check one-word limit-up/limit-down on barNext open
    const limitUpThreshold = barToday.close * (1 + limitPct / 100 - 0.002);
    const limitDownThreshold = barToday.close * (1 - limitPct / 100 + 0.002);
    const isNextLockedLimitUp = barNext.open >= limitUpThreshold && barNext.low >= limitUpThreshold;
    const isNextLockedLimitDown = barNext.open <= limitDownThreshold && barNext.high <= limitDownThreshold;

    // 1. Signal generation strictly from t close indicators
    let wantBuy = false;
    let wantSell = false;
    let sellReason = '策略离场信号';

    if (params.strategyType === 'MA_CROSS') {
      if (indToday.ma5 && indToday.ma20 && indPrev.ma5 && indPrev.ma20) {
        if (indPrev.ma5 <= indPrev.ma20 && indToday.ma5 > indToday.ma20) wantBuy = true;
        if (indPrev.ma5 >= indPrev.ma20 && indToday.ma5 < indToday.ma20) {
          wantSell = true;
          sellReason = 'MA5下穿MA20死叉离场';
        }
      }
    } else if (params.strategyType === 'BOLL_RSI') {
      if (indToday.bollLower && indToday.rsi14 !== null) {
        if (barToday.close <= indToday.bollLower * 1.01 && indToday.rsi14 < 38) wantBuy = true;
        if ((indToday.bollUpper && barToday.close >= indToday.bollUpper) || indToday.rsi14 > 72) {
          wantSell = true;
          sellReason = '触及布林上轨或RSI超买';
        }
      }
    } else if (params.strategyType === 'BREAKOUT_MOMENTUM') {
      const prev20High = Math.max(...sliced.slice(Math.max(0, i - 20), i).map((b) => b.high));
      if (barToday.close > prev20High && indToday.macdDif !== null && indToday.macdDea !== null && indToday.macdDif > indToday.macdDea) {
        wantBuy = true;
      }
      if (indToday.ma10 && barToday.close < indToday.ma10) {
        wantSell = true;
        sellReason = '跌破10日趋势线止盈/止损';
      }
    } else {
      // VALUE_DISCIPLINE: accumulate below MA60 + RSI < 45, trim above 15% over MA60
      if (indToday.ma60 && indToday.rsi14 !== null) {
        if (barToday.close < indToday.ma60 * 0.96 && indToday.rsi14 < 45) wantBuy = true;
        if (barToday.close > indToday.ma60 * 1.18 && indToday.rsi14 > 68) {
          wantSell = true;
          sellReason = '偏离长期均线过高兑现';
        }
      }
    }

    // Stop loss / Take profit check on t close
    if (shares > 0) {
      const unrealPct = ((barToday.close - entryPrice) / entryPrice) * 100;
      if (unrealPct <= -stopLossPct) {
        wantSell = true;
        sellReason = `触发止损 (-${stopLossPct}%)`;
      } else if (unrealPct >= takeProfitPct) {
        wantSell = true;
        sellReason = `触发止盈 (+${takeProfitPct}%)`;
      }
    }

    // T+1 Check: must hold at least 1 bar (i > entryIdx)
    if (shares > 0 && wantSell && i > entryIdx) {
      if (isNextLockedLimitDown) {
        blockedSellCount++;
      } else {
        const execPrice = Number((barNext.open * (1 - slip)).toFixed(2));
        const gross = shares * execPrice;
        const comm = Math.max(rule.fees.minCommissionYuan, gross * commRate);
        const duty = gross * stampDutySell;
        const trans = gross * transferFee;
        const net = gross - comm - duty - trans;
        const costBasis = shares * entryPrice;
        const pnlYuan = Number((net - costBasis).toFixed(2));
        const retPct = Number(((pnlYuan / costBasis) * 100).toFixed(2));
        trades.push({
          buyDate: entryDate,
          sellDate: barNext.time,
          buyPrice: entryPrice,
          sellPrice: execPrice,
          shares,
          pnlYuan,
          returnPct: retPct,
          holdingDays: i + 1 - entryIdx,
          exitReason: sellReason,
        });
        cash += net;
        shares = 0;
        entryPrice = 0;
      }
    } else if (shares === 0 && wantBuy) {
      if (isNextLockedLimitUp) {
        blockedBuyCount++;
      } else {
        const execPrice = Number((barNext.open * (1 + slip)).toFixed(2));
        const step = rule.qtyStep;
        const maxShares = Math.floor((cash * 0.98) / execPrice / step) * step;
        if (maxShares >= rule.minOrderQty) {
          const gross = maxShares * execPrice;
          const comm = Math.max(rule.fees.minCommissionYuan, gross * commRate);
          const trans = gross * transferFee;
          const totalOut = gross + comm + trans;
          if (totalOut <= cash) {
            cash -= totalOut;
            shares = maxShares;
            entryPrice = execPrice;
            entryIdx = i + 1;
            entryDate = barNext.time;
          }
        }
      }
    }

    const totalEq = cash + shares * barNext.close;
    const benchEq = (params.initialCapital / basePrice) * barNext.close;
    equityCurve.push({
      time: barNext.time,
      strategyEquity: Number(totalEq.toFixed(2)),
      benchmarkEquity: Number(benchEq.toFixed(2)),
    });
  }

  // Close open position at last bar valuation for metrics
  const finalEquity =
    equityCurve.length > 0
      ? equityCurve[equityCurve.length - 1].strategyEquity
      : params.initialCapital;
  const finalBench =
    equityCurve.length > 0
      ? equityCurve[equityCurve.length - 1].benchmarkEquity
      : params.initialCapital;

  const totalReturnPct = Number((((finalEquity - params.initialCapital) / params.initialCapital) * 100).toFixed(2));
  const benchmarkReturnPct = Number((((finalBench - params.initialCapital) / params.initialCapital) * 100).toFixed(2));
  const years = Math.max(0.08, equityCurve.length / 245);
  const annualReturnPct = Number(((Math.pow(Math.max(0.01, finalEquity / params.initialCapital), 1 / years) - 1) * 100).toFixed(2));

  // Max Drawdown & Sharpe
  let peak = params.initialCapital;
  let maxDrawdownPct = 0;
  const dailyRets: number[] = [];
  for (let i = 0; i < equityCurve.length; i++) {
    const eq = equityCurve[i].strategyEquity;
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    if (i > 0) {
      dailyRets.push((eq - equityCurve[i - 1].strategyEquity) / equityCurve[i - 1].strategyEquity);
    }
  }

  let sharpeRatio = 0;
  if (dailyRets.length > 5) {
    const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
    const std = Math.sqrt(
      dailyRets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyRets.length
    );
    if (std > 0) sharpeRatio = Number((((mean - 0.02 / 245) / std) * Math.sqrt(245)).toFixed(2));
  }

  const wins = trades.filter((t) => t.pnlYuan > 0);
  const losses = trades.filter((t) => t.pnlYuan <= 0);
  const winRatePct = trades.length ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length) : 0;
  const profitLossRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : wins.length ? 9.99 : 0;
  const avgHoldingDays = trades.length
    ? Number((trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length).toFixed(1))
    : 0;
  const maxSingleLossPct = trades.length
    ? Number(Math.min(0, ...trades.map((t) => t.returnPct)).toFixed(2))
    : 0;

  return {
    totalReturnPct,
    annualReturnPct,
    benchmarkReturnPct,
    winRatePct,
    profitLossRatio,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    sharpeRatio,
    tradeCount: trades.length,
    avgHoldingDays,
    maxSingleLossPct,
    equityCurve,
    tradesLog: trades,
    complianceChecks: {
      tPlusOneEnforced: true,
      noLookAheadBias: '信号仅基于t日收盘数据生成，严格在t+1日开盘按滑点撮合',
      priceLimitRuleApplied: `${rule.board} (${limitPct}%涨跌幅，一字涨停无法买入/一字跌停无法卖出)`,
      blockedBuyCount,
      blockedSellCount,
      feesApplied: `佣金${rule.fees.commissionRatePct}% + 卖出印花税${rule.fees.stampDutySellPct}% + 过户费${rule.fees.transferFeePct}% + 滑点${params.slippageBps ?? 10}bps`,
      survivorshipBiasNote: '单标的真实前复权历史样本回测；历史表现不代表未来收益',
    },
  };
}
