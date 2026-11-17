import { db } from '../../db/index.ts';
import { tradingRules } from '../../db/schema.ts';

export type ExchangeCode = 'SH' | 'SZ' | 'BJ';
export type BoardType = '主板' | '创业板' | '科创板' | '北交所';

export interface StockRuleContext {
  symbol: string;
  name?: string;
  exchange?: ExchangeCode;
  board?: BoardType;
  isSt?: boolean;
  isDelisting?: boolean;
  isSuspended?: boolean;
  listDate?: string | null; // YYYY-MM-DD
  tradeDate?: string; // YYYY-MM-DD
  isMarginEligible?: boolean | null;
}

export interface EvaluatedTradingRule {
  exchange: ExchangeCode;
  board: BoardType;
  securityType: string;
  priceLimitPct: number | null; // null means no price limit (new stock initial phase)
  limitUpPrice: (prevClose: number) => number | null;
  limitDownPrice: (prevClose: number) => number | null;
  tPlusRule: 'T+1';
  minOrderQty: number;
  qtyStep: number;
  tickSize: number;
  callAuctionDesc: string;
  continuousAuctionDesc: string;
  afterHoursDesc: string | null;
  tempHaltDesc: string | null;
  fees: {
    commissionRatePct: number;
    minCommissionYuan: number;
    stampDutySellPct: number;
    transferFeePct: number;
  };
  shortSellingNote: string;
  ruleCode: string;
  ruleName: string;
  effectiveDate: string;
  sourceUrl: string;
  version: string;
  needsVerification: boolean;
  verificationNotice: string | null;
}

export function inferExchangeAndBoard(symbol: string): {
  exchange: ExchangeCode;
  board: BoardType;
  tsCode: string;
  tencentCode: string;
  eastmoneySecId: string;
} {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  if (clean.startsWith('688') || clean.startsWith('689')) {
    return {
      exchange: 'SH',
      board: '科创板',
      tsCode: `${clean}.SH`,
      tencentCode: `sh${clean}`,
      eastmoneySecId: `1.${clean}`,
    };
  }
  if (clean.startsWith('60') || clean.startsWith('6')) {
    return {
      exchange: 'SH',
      board: '主板',
      tsCode: `${clean}.SH`,
      tencentCode: `sh${clean}`,
      eastmoneySecId: `1.${clean}`,
    };
  }
  if (clean.startsWith('300') || clean.startsWith('301')) {
    return {
      exchange: 'SZ',
      board: '创业板',
      tsCode: `${clean}.SZ`,
      tencentCode: `sz${clean}`,
      eastmoneySecId: `0.${clean}`,
    };
  }
  if (
    clean.startsWith('43') ||
    clean.startsWith('83') ||
    clean.startsWith('87') ||
    clean.startsWith('920')
  ) {
    return {
      exchange: 'BJ',
      board: '北交所',
      tsCode: `${clean}.BJ`,
      tencentCode: `bj${clean}`,
      eastmoneySecId: `0.${clean}`,
    };
  }
  return {
    exchange: 'SZ',
    board: '主板',
    tsCode: `${clean}.SZ`,
    tencentCode: `sz${clean}`,
    eastmoneySecId: `0.${clean}`,
  };
}

function approxTradingDaysSince(listDate: string | null | undefined, refDate?: string): number | null {
  if (!listDate || !/^\d{4}-\d{2}-\d{2}/.test(listDate)) return null;
  const start = new Date(listDate.slice(0, 10)).getTime();
  const end = refDate ? new Date(refDate.slice(0, 10)).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const calendarDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  if (calendarDays < 0) return 0;
  // Conservative estimate: 5/7 trading days
  return Math.floor((calendarDays * 5) / 7) + 1;
}

export function roundTick(price: number, tickSize = 0.01): number {
  return Math.round(price / tickSize) * tickSize;
}

export function evaluateTradingRule(ctx: StockRuleContext): EvaluatedTradingRule {
  const inferred = inferExchangeAndBoard(ctx.symbol);
  const exchange = ctx.exchange || inferred.exchange;
  const board = ctx.board || inferred.board;
  const nameUpper = (ctx.name || '').toUpperCase();
  const isSt = Boolean(ctx.isSt || nameUpper.includes('ST'));
  const isDelisting = Boolean(ctx.isDelisting || nameUpper.includes('退'));
  const tradingDays = approxTradingDaysSince(ctx.listDate, ctx.tradeDate);
  const isFirstDay = tradingDays !== null && tradingDays <= 1;
  const isFirst5Days = tradingDays !== null && tradingDays <= 5;

  let priceLimitPct: number | null = 10;
  let securityType = '普通A股';
  let ruleCode = 'MAIN_10';
  let ruleName = '沪深主板普通股票交易规则';
  let minOrderQty = 100;
  let qtyStep = 100;
  let afterHoursDesc: string | null = '无盘后固定价格交易';
  let tempHaltDesc: string | null = '盘中涨跌幅异常波动可依交易所公告实施临时停牌';
  let sourceUrl =
    exchange === 'SH'
      ? 'https://www.sse.com.cn/lawandrules/sselaws/trading/stock/'
      : 'https://www.szse.cn/lawrules/rule/stock/';
  let effectiveDate = '2023-04-10';
  let needsVerification = false;
  let verificationNotice: string | null = null;

  if (board === '北交所') {
    sourceUrl = 'https://www.bse.cn/rule/trading_rule.html';
    effectiveDate = '2021-11-15';
    minOrderQty = 100;
    qtyStep = 1;
    afterHoursDesc = '北交所盘后固定价格交易（15:05-15:30，如适用）';
    if (isFirstDay) {
      priceLimitPct = null;
      securityType = '北交所新股首日';
      ruleCode = 'BSE_NEW_DAY1';
      ruleName = '北交所新股上市首日规则';
      tempHaltDesc = '盘中成交价较开盘价首次上涨或下跌达30%、60%时，各临时停牌10分钟';
      needsVerification = true;
      verificationNotice = '上市日期接近首日，请核实交易所当日新股上市公告与临停状态';
    } else {
      priceLimitPct = 30;
      securityType = isSt ? '北交所风险警示' : '北交所普通股票';
      ruleCode = 'BSE_30';
      ruleName = '北交所30%涨跌幅交易规则';
      tempHaltDesc = '无价格涨跌幅限制情形除外，普通交易日实行±30%涨跌幅';
    }
  } else if (board === '科创板' || board === '创业板') {
    effectiveDate = board === '科创板' ? '2019-07-22' : '2020-08-24';
    minOrderQty = board === '科创板' ? 200 : 100;
    qtyStep = board === '科创板' ? 1 : 100;
    afterHoursDesc = '15:05-15:30 盘后固定价格交易（按收盘价撮合）';
    if (isFirst5Days) {
      priceLimitPct = null;
      securityType = `${board}新股前5日`;
      ruleCode = board === '科创板' ? 'STAR_NEW_5D' : 'CHINEXT_NEW_5D';
      ruleName = `${board}新股前5个交易日不设涨跌幅规则`;
      tempHaltDesc = '盘中成交价较开盘价首次上涨或下跌达30%、60%时，各临时停牌10分钟';
      needsVerification = true;
      verificationNotice = '新股上市前5个交易日无涨跌幅限制，具体以交易所上市公告日历为准';
    } else {
      priceLimitPct = 20;
      securityType = isSt ? `${board}风险警示(ST/*ST)` : `${board}普通股票`;
      ruleCode = board === '科创板' ? 'STAR_20' : 'CHINEXT_20';
      ruleName = `${board}20%涨跌幅交易规则`;
      tempHaltDesc = '连续竞价阶段存在有效申报价格范围限制（±2%价格笼子）';
    }
  } else {
    // 沪深主板（全面注册制后 2023-04-10 起主板新股前5日不设涨跌幅）
    effectiveDate = '2023-04-10';
    if (isFirst5Days) {
      priceLimitPct = null;
      securityType = '主板新股前5日';
      ruleCode = 'MAIN_NEW_5D';
      ruleName = '全面注册制主板新股前5日不设涨跌幅规则';
      tempHaltDesc = '盘中成交价较开盘价首次上涨或下跌达30%、60%时，各临时停牌10分钟';
      needsVerification = true;
      verificationNotice = '请核对上市日期确认是否仍处于上市前5个交易日内';
    } else if (isDelisting) {
      priceLimitPct = null;
      securityType = '退市整理期';
      ruleCode = 'MAIN_DELIST';
      ruleName = '主板退市整理期规则（首日不设涨跌幅，次日起10%）';
      needsVerification = true;
      verificationNotice = '检测到“退”字样，退市整理期首日与次日起涨跌幅不同，务必核实交易所公告';
    } else if (isSt) {
      priceLimitPct = 5;
      securityType = '主板风险警示(ST/*ST)';
      ruleCode = 'MAIN_ST_5';
      ruleName = '主板ST/*ST风险警示股票5%涨跌幅规则';
    } else {
      priceLimitPct = 10;
      securityType = '主板普通A股';
      ruleCode = 'MAIN_10';
      ruleName = '沪深主板普通股票10%涨跌幅规则';
    }
  }

  const limitUpPrice = (prevClose: number) => {
    if (priceLimitPct === null || !prevClose || prevClose <= 0) return null;
    return Number((prevClose * (1 + priceLimitPct / 100)).toFixed(2));
  };
  const limitDownPrice = (prevClose: number) => {
    if (priceLimitPct === null || !prevClose || prevClose <= 0) return null;
    return Number((prevClose * (1 - priceLimitPct / 100)).toFixed(2));
  };

  return {
    exchange,
    board,
    securityType,
    priceLimitPct,
    limitUpPrice,
    limitDownPrice,
    tPlusRule: 'T+1',
    minOrderQty,
    qtyStep,
    tickSize: 0.01,
    callAuctionDesc: '09:15-09:25 开盘集合竞价（09:20-09:25不可撤单）；14:57-15:00 收盘集合竞价',
    continuousAuctionDesc: '09:30-11:30、13:00-14:57（科创/创业板及主板适用价格笼子约束）',
    afterHoursDesc,
    tempHaltDesc,
    fees: {
      commissionRatePct: 0.025,
      minCommissionYuan: 5,
      stampDutySellPct: 0.05, // 2023-08-28起证券交易印花税减半为卖出0.05%
      transferFeePct: exchange === 'SH' ? 0.001 : 0.001,
    },
    shortSellingNote:
      ctx.isMarginEligible === true
        ? '若在两融标的清单内方可融券，但需考虑券源余量及监管暂停融券新规限制'
        : '普通A股默认仅按做多/持有/观望评估，未确认两融标的及券源前禁止假定可融券做空',
    ruleCode,
    ruleName,
    effectiveDate,
    sourceUrl,
    version: '2026.1-official',
    needsVerification,
    verificationNotice,
  };
}

export async function seedDefaultTradingRules() {
  const defaults = [
    {
      ruleCode: 'MAIN_10',
      ruleName: '沪深主板普通股票10%涨跌幅规则',
      exchange: 'SH',
      board: '主板',
      securityType: '普通A股',
      priceLimitPct: 10,
      tPlusRule: 'T+1',
      minOrderQty: 100,
      qtyStep: 100,
      tickSize: 0.01,
      callAuctionDesc: '09:15-09:25 开盘集合竞价；14:57-15:00 收盘集合竞价（深市）/14:57-15:00（沪市）',
      continuousAuctionDesc: '09:30-11:30、13:00-14:57 连续竞价，适用基准价格±2%价格笼子',
      afterHoursDesc: '无盘后固定价格交易',
      tempHaltDesc: '无涨跌幅限制期间适用30%/60%临停10分钟规则',
      stampDutySellPct: 0.05,
      transferFeePct: 0.001,
      effectiveDate: '2023-04-10',
      expiryDate: null,
      sourceUrl: 'https://www.sse.com.cn/lawandrules/sselaws/trading/stock/',
      version: '2026.1-official',
      needsVerification: false,
    },
    {
      ruleCode: 'MAIN_ST_5',
      ruleName: '沪深主板风险警示股票(ST/*ST)5%涨跌幅规则',
      exchange: 'ALL',
      board: '主板',
      securityType: 'ST/*ST',
      priceLimitPct: 5,
      tPlusRule: 'T+1',
      minOrderQty: 100,
      qtyStep: 100,
      tickSize: 0.01,
      callAuctionDesc: '09:15-09:25 开盘集合竞价；14:57-15:00 收盘集合竞价',
      continuousAuctionDesc: '09:30-11:30、13:00-14:57 连续竞价，当日单只风险警示股累计买入一般不超过50万股',
      afterHoursDesc: '无盘后固定价格交易',
      tempHaltDesc: '交易所按风险警示交易实施细则监管',
      stampDutySellPct: 0.05,
      transferFeePct: 0.001,
      effectiveDate: '2023-04-10',
      expiryDate: null,
      sourceUrl: 'https://www.szse.cn/lawrules/rule/stock/',
      version: '2026.1-official',
      needsVerification: false,
    },
    {
      ruleCode: 'CHINEXT_20',
      ruleName: '深交所创业板20%涨跌幅交易规则',
      exchange: 'SZ',
      board: '创业板',
      securityType: '普通A股及ST/*ST',
      priceLimitPct: 20,
      tPlusRule: 'T+1',
      minOrderQty: 100,
      qtyStep: 100,
      tickSize: 0.01,
      callAuctionDesc: '09:15-09:25 开盘集合竞价；14:57-15:00 收盘集合竞价',
      continuousAuctionDesc: '09:30-11:30、13:00-14:57 连续竞价（有效申报±2%价格笼子，单笔限价最高30万股）',
      afterHoursDesc: '15:05-15:30 盘后定价交易',
      tempHaltDesc: '新股前5日30%/60%盘中临停10分钟',
      stampDutySellPct: 0.05,
      transferFeePct: 0.001,
      effectiveDate: '2020-08-24',
      expiryDate: null,
      sourceUrl: 'https://www.szse.cn/lawrules/rule/stock/',
      version: '2026.1-official',
      needsVerification: false,
    },
    {
      ruleCode: 'STAR_20',
      ruleName: '上交所科创板20%涨跌幅交易规则',
      exchange: 'SH',
      board: '科创板',
      securityType: '普通A股及ST/*ST',
      priceLimitPct: 20,
      tPlusRule: 'T+1',
      minOrderQty: 200,
      qtyStep: 1,
      tickSize: 0.01,
      callAuctionDesc: '09:15-09:25 开盘集合竞价；14:57-15:00 收盘集合竞价',
      continuousAuctionDesc: '09:30-11:30、13:00-14:57 连续竞价（最低申报200股，1股递增，适用±2%价格笼子）',
      afterHoursDesc: '15:05-15:30 盘后固定价格交易',
      tempHaltDesc: '新股前5日30%/60%盘中临停10分钟',
      stampDutySellPct: 0.05,
      transferFeePct: 0.001,
      effectiveDate: '2019-07-22',
      expiryDate: null,
      sourceUrl: 'https://www.sse.com.cn/lawandrules/sselaws/star/',
      version: '2026.1-official',
      needsVerification: false,
    },
    {
      ruleCode: 'BSE_30',
      ruleName: '北京证券交易所30%涨跌幅交易规则',
      exchange: 'BJ',
      board: '北交所',
      securityType: '普通股票',
      priceLimitPct: 30,
      tPlusRule: 'T+1',
      minOrderQty: 100,
      qtyStep: 1,
      tickSize: 0.01,
      callAuctionDesc: '09:15-09:25 开盘集合竞价；14:57-15:00 收盘集合竞价',
      continuousAuctionDesc: '09:30-11:30、13:00-14:57 连续竞价（最低申报100股，1股递增）',
      afterHoursDesc: '按北交所盘后交易规则执行',
      tempHaltDesc: '新股上市首日不设涨跌幅，设30%/60%临停10分钟机制',
      stampDutySellPct: 0.05,
      transferFeePct: 0.001,
      effectiveDate: '2021-11-15',
      expiryDate: null,
      sourceUrl: 'https://www.bse.cn/rule/trading_rule.html',
      version: '2026.1-official',
      needsVerification: false,
    },
  ];

  for (const r of defaults) {
    await db
      .insert(tradingRules)
      .values(r)
      .onConflictDoNothing({ target: tradingRules.ruleCode });
  }
}
