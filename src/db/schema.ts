import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Users & Personal Settings (linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  // Encrypted AI provider configuration (never exposed to client in plaintext)
  aiProviderType: text('ai_provider_type').default('gemini').notNull(), // 'gemini' | 'openai_compatible'
  aiBaseUrl: text('ai_base_url'),
  aiModelName: text('ai_model_name').default('gemini-4-hydrogen'),
  aiApiKeyEncrypted: text('ai_api_key_encrypted'),
  aiApiKeyLast4: text('ai_api_key_last4'),
  aiTemperature: doublePrecision('ai_temperature').default(0.2),
  // Risk management defaults
  totalCapital: doublePrecision('total_capital').default(500000),
  maxSingleLossPct: doublePrecision('max_single_loss_pct').default(2.0),
  maxPositionPerStockPct: doublePrecision('max_position_per_stock_pct').default(20.0),
  maxTotalExposurePct: doublePrecision('max_total_exposure_pct').default(80.0),
  maxDrawdownLimitPct: doublePrecision('max_drawdown_limit_pct').default(15.0),
  dailyLossLimitPct: doublePrecision('daily_loss_limit_pct').default(3.0),
  defaultTradingStyle: text('default_trading_style').default('波段'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Stocks Master Table
export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull().unique(), // e.g. '600519'
  tsCode: text('ts_code').notNull(), // e.g. '600519.SH'
  name: text('name').notNull(),
  exchange: text('exchange').notNull(), // 'SH' | 'SZ' | 'BJ'
  board: text('board').notNull(), // '主板' | '创业板' | '科创板' | '北交所'
  securityType: text('security_type').default('A股').notNull(),
  industry: text('industry'),
  sector: text('sector'),
  concepts: jsonb('concepts').$type<string[]>().default([]),
  isSt: boolean('is_st').default(false).notNull(),
  isDelisting: boolean('is_delisting').default(false).notNull(),
  isSuspended: boolean('is_suspended').default(false).notNull(),
  isNewStock: boolean('is_new_stock').default(false).notNull(),
  listDate: text('list_date'),
  totalShares: doublePrecision('total_shares'),
  floatShares: doublePrecision('float_shares'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date'),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 3. Stock Quotes (Snapshots)
export const stockQuotes = pgTable('stock_quotes', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  price: doublePrecision('price'),
  prevClose: doublePrecision('prev_close'),
  open: doublePrecision('open'),
  high: doublePrecision('high'),
  low: doublePrecision('low'),
  changePct: doublePrecision('change_pct'),
  changeAmt: doublePrecision('change_amt'),
  volume: doublePrecision('volume'),
  amount: doublePrecision('amount'),
  turnoverRate: doublePrecision('turnover_rate'),
  volumeRatio: doublePrecision('volume_ratio'),
  totalMarketCap: doublePrecision('total_market_cap'),
  floatMarketCap: doublePrecision('float_market_cap'),
  peTtm: doublePrecision('pe_ttm'),
  pb: doublePrecision('pb'),
  ps: doublePrecision('ps'),
  dividendYield: doublePrecision('dividend_yield'),
  high52w: doublePrecision('high_52w'),
  low52w: doublePrecision('low_52w'),
  isRealtime: boolean('is_realtime').default(false).notNull(),
  delayNotice: text('delay_notice'),
  rawPayload: jsonb('raw_payload'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('延迟').notNull(),
});

// 4. Stock OHLCV (Multi-timeframe K-line)
export const stockOhlcv = pgTable(
  'stock_ohlcv',
  {
    id: serial('id').primaryKey(),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(), // '1m','5m','15m','30m','60m','day','week','month'
    adjustType: text('adjust_type').default('qfq').notNull(),
    tradeTime: text('trade_time').notNull(), // YYYY-MM-DD or YYYY-MM-DD HH:mm
    open: doublePrecision('open').notNull(),
    high: doublePrecision('high').notNull(),
    low: doublePrecision('low').notNull(),
    close: doublePrecision('close').notNull(),
    volume: doublePrecision('volume').notNull(),
    amount: doublePrecision('amount'),
    turnoverRate: doublePrecision('turnover_rate'),
    dataSource: text('data_source').notNull(),
    collectedAt: timestamp('collected_at').defaultNow().notNull(),
    dataDate: text('data_date').notNull(),
    dataStatus: text('data_status').default('正常').notNull(),
  },
  (table) => [
    uniqueIndex('idx_ohlcv_symbol_tf_time').on(table.symbol, table.timeframe, table.tradeTime),
  ]
);

// 5. Financial Statements
export const financialStatements = pgTable(
  'financial_statements',
  {
    id: serial('id').primaryKey(),
    symbol: text('symbol').notNull(),
    reportDate: text('report_date').notNull(), // YYYY-MM-DD
    reportType: text('report_type').notNull(), // '年报' | '一季报' | '中报' | '三季报'
    revenue: doublePrecision('revenue'),
    revenueYoy: doublePrecision('revenue_yoy'),
    netProfit: doublePrecision('net_profit'),
    netProfitYoy: doublePrecision('net_profit_yoy'),
    deductedNetProfit: doublePrecision('deducted_net_profit'),
    grossMargin: doublePrecision('gross_margin'),
    netMargin: doublePrecision('net_margin'),
    roe: doublePrecision('roe'),
    roic: doublePrecision('roic'),
    eps: doublePrecision('eps'),
    operatingCashFlow: doublePrecision('operating_cash_flow'),
    debtToAssetRatio: doublePrecision('debt_to_asset_ratio'),
    accountsReceivable: doublePrecision('accounts_receivable'),
    inventory: doublePrecision('inventory'),
    goodwill: doublePrecision('goodwill'),
    currentRatio: doublePrecision('current_ratio'),
    cashFlowToNetProfit: doublePrecision('cash_flow_to_net_profit'),
    rawJson: jsonb('raw_json'),
    dataSource: text('data_source').notNull(),
    collectedAt: timestamp('collected_at').defaultNow().notNull(),
    dataDate: text('data_date').notNull(),
    dataStatus: text('data_status').default('正常').notNull(),
  },
  (table) => [
    uniqueIndex('idx_fin_symbol_date_type').on(table.symbol, table.reportDate, table.reportType),
  ]
);

// 6. Technical Indicators
export const technicalIndicators = pgTable('technical_indicators', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  calcDate: text('calc_date').notNull(),
  ma5: doublePrecision('ma5'),
  ma10: doublePrecision('ma10'),
  ma20: doublePrecision('ma20'),
  ma60: doublePrecision('ma60'),
  ma120: doublePrecision('ma120'),
  ma250: doublePrecision('ma250'),
  ema12: doublePrecision('ema12'),
  ema26: doublePrecision('ema26'),
  macdDif: doublePrecision('macd_dif'),
  macdDea: doublePrecision('macd_dea'),
  macdHist: doublePrecision('macd_hist'),
  rsi14: doublePrecision('rsi14'),
  kdjK: doublePrecision('kdj_k'),
  kdjD: doublePrecision('kdj_d'),
  kdjJ: doublePrecision('kdj_j'),
  bollUpper: doublePrecision('boll_upper'),
  bollMid: doublePrecision('boll_mid'),
  bollLower: doublePrecision('boll_lower'),
  atr14: doublePrecision('atr14'),
  obv: doublePrecision('obv'),
  vwap: doublePrecision('vwap'),
  vwapMethodology: text('vwap_methodology'),
  signals: jsonb('signals').$type<string[]>().default([]),
  supportLevels: jsonb('support_levels').$type<number[]>().default([]),
  resistanceLevels: jsonb('resistance_levels').$type<number[]>().default([]),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 7. Company News
export const companyNews = pgTable('company_news', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  publishedAt: text('published_at').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url'),
  sentimentLabel: text('sentiment_label'), // '利好' | '利空' | '中性'
  impactLogic: text('impact_logic'),
  impactHorizon: text('impact_horizon'),
  uncertainty: text('uncertainty'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 8. Company Announcements
export const companyAnnouncements = pgTable('company_announcements', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  announcementId: text('announcement_id'),
  title: text('title').notNull(),
  category: text('category'),
  publishedAt: text('published_at').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  sentimentLabel: text('sentiment_label'), // '利好' | '利空' | '中性'
  impactLogic: text('impact_logic'),
  impactHorizon: text('impact_horizon'),
  uncertainty: text('uncertainty'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 9. Industry Data
export const industryData = pgTable('industry_data', {
  id: serial('id').primaryKey(),
  industryCode: text('industry_code').notNull(),
  industryName: text('industry_name').notNull(),
  changePct: doublePrecision('change_pct'),
  turnoverAmount: doublePrecision('turnover_amount'),
  turnoverRate: doublePrecision('turnover_rate'),
  netInflowEst: doublePrecision('net_inflow_est'),
  upCount: integer('up_count'),
  downCount: integer('down_count'),
  leadingStockCode: text('leading_stock_code'),
  leadingStockName: text('leading_stock_name'),
  leadingStockPct: doublePrecision('leading_stock_pct'),
  lifecycleStage: text('lifecycle_stage'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 10. Sector Data (Market Indices & Board Statistics)
export const sectorData = pgTable('sector_data', {
  id: serial('id').primaryKey(),
  sectorCode: text('sector_code').notNull(),
  sectorName: text('sector_name').notNull(),
  lastPrice: doublePrecision('last_price'),
  changePct: doublePrecision('change_pct'),
  amount: doublePrecision('amount'),
  amountChangePct: doublePrecision('amount_change_pct'),
  upCount: integer('up_count'),
  downCount: integer('down_count'),
  flatCount: integer('flat_count'),
  limitUpCount: integer('limit_up_count'),
  limitDownCount: integer('limit_down_count'),
  brokenBoardCount: integer('broken_board_count'),
  sealRate: doublePrecision('seal_rate'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 11. Concept Data
export const conceptData = pgTable('concept_data', {
  id: serial('id').primaryKey(),
  conceptCode: text('concept_code').notNull(),
  conceptName: text('concept_name').notNull(),
  changePct: doublePrecision('change_pct'),
  turnoverAmount: doublePrecision('turnover_amount'),
  netInflowEst: doublePrecision('net_inflow_est'),
  upCount: integer('up_count'),
  downCount: integer('down_count'),
  leadingStockCode: text('leading_stock_code'),
  leadingStockName: text('leading_stock_name'),
  leadingStockPct: doublePrecision('leading_stock_pct'),
  lifecycleStage: text('lifecycle_stage'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 12. Capital Flow (Explicitly marked as vendor estimated definition)
export const capitalFlow = pgTable('capital_flow', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  tradeDate: text('trade_date').notNull(),
  mainNetInflowEst: doublePrecision('main_net_inflow_est'),
  superLargeNetInflow: doublePrecision('super_large_net_inflow'),
  largeNetInflow: doublePrecision('large_net_inflow'),
  mediumNetInflow: doublePrecision('medium_net_inflow'),
  smallNetInflow: doublePrecision('small_net_inflow'),
  definitionNote: text('definition_note').notNull(),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 13. Dragon Tiger List (龙虎榜)
export const dragonTiger = pgTable('dragon_tiger', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  tradeDate: text('trade_date').notNull(),
  closePrice: doublePrecision('close_price'),
  changePct: doublePrecision('change_pct'),
  reason: text('reason').notNull(),
  netBuyAmount: doublePrecision('net_buy_amount'),
  buyAmount: doublePrecision('buy_amount'),
  sellAmount: doublePrecision('sell_amount'),
  hasInstitutionSeat: boolean('has_institution_seat').default(false),
  seatsDetail: jsonb('seats_detail'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 14. Margin Data (融资融券)
export const marginData = pgTable('margin_data', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  tradeDate: text('trade_date').notNull(),
  rzBalance: doublePrecision('rz_balance'),
  rqBalance: doublePrecision('rq_balance'),
  rzNetBuy: doublePrecision('rz_net_buy'),
  isMarginEligible: boolean('is_margin_eligible').default(false),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('缺失').notNull(),
});

// 15. Institutional Holdings
export const institutionalHoldings = pgTable('institutional_holdings', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  reportDate: text('report_date').notNull(),
  institutionType: text('institution_type'),
  institutionName: text('institution_name'),
  holdShares: doublePrecision('hold_shares'),
  holdRatio: doublePrecision('hold_ratio'),
  changeShares: doublePrecision('change_shares'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 16. Shareholder Changes
export const shareholderChanges = pgTable('shareholder_changes', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  announceDate: text('announce_date').notNull(),
  holderName: text('holder_name').notNull(),
  changeDirection: text('change_direction').notNull(), // '增持' | '减持'
  changeShares: doublePrecision('change_shares'),
  changeRatio: doublePrecision('change_ratio'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 17. Restricted Share Unlock Events
export const unlockEvents = pgTable('unlock_events', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  unlockDate: text('unlock_date').notNull(),
  unlockShares: doublePrecision('unlock_shares'),
  unlockRatioPct: doublePrecision('unlock_ratio_pct'),
  shareType: text('share_type'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 18. Macro Economic Data
export const macroData = pgTable('macro_data', {
  id: serial('id').primaryKey(),
  indicatorKey: text('indicator_key').notNull(), // 'CPI','PPI','PMI','GDP','M2','SHIBOR','LPR','FX_USDCNY'
  indicatorName: text('indicator_name').notNull(),
  period: text('period').notNull(),
  value: doublePrecision('value').notNull(),
  yoyChange: doublePrecision('yoy_change'),
  unit: text('unit').notNull(),
  policyNote: text('policy_note'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 19. Valuation Results
export const valuationResults = pgTable('valuation_results', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  calcDate: text('calc_date').notNull(),
  currentPrice: doublePrecision('current_price'),
  peTtm: doublePrecision('pe_ttm'),
  pb: doublePrecision('pb'),
  ps: doublePrecision('ps'),
  peg: doublePrecision('peg'),
  evEbitda: doublePrecision('ev_ebitda'),
  dividendYield: doublePrecision('dividend_yield'),
  pePercentile: doublePrecision('pe_percentile'),
  optimisticTarget: doublePrecision('optimistic_target'),
  neutralTarget: doublePrecision('neutral_target'),
  pessimisticTarget: doublePrecision('pessimistic_target'),
  marginOfSafetyPct: doublePrecision('margin_of_safety_pct'),
  assumptionsJson: jsonb('assumptions_json'),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataDate: text('data_date').notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 20. Model Versions
export const modelVersions = pgTable('model_versions', {
  id: serial('id').primaryKey(),
  versionCode: text('version_code').notNull().unique(),
  modelName: text('model_name').notNull(),
  longTermWeights: jsonb('long_term_weights').notNull(),
  shortTermWeights: jsonb('short_term_weights').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(false).notNull(),
  validationSummary: jsonb('validation_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 21. AI Multi-Role Analysis
export const aiAnalysis = pgTable('ai_analysis', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  modelVersion: text('model_version').notNull(),
  llmModelUsed: text('llm_model_used').notNull(),
  roleOutputs: jsonb('role_outputs').notNull(), // 9 roles structured output
  chiefConclusion: jsonb('chief_conclusion').notNull(),
  conflictsIdentified: jsonb('conflicts_identified'),
  missingDataWarnings: jsonb('missing_data_warnings').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 22. AI Dual-Track Scores
export const aiScores = pgTable('ai_scores', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  modelVersion: text('model_version').notNull(),
  longTermTotal: doublePrecision('long_term_total').notNull(),
  longTermGrade: text('long_term_grade').notNull(),
  longTermBreakdown: jsonb('long_term_breakdown').notNull(),
  shortTermTotal: doublePrecision('short_term_total').notNull(),
  shortTermGrade: text('short_term_grade').notNull(),
  shortTermBreakdown: jsonb('short_term_breakdown').notNull(),
  dataSource: text('data_source').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 23. AI Predictions (Tracked over 1/3/5/10/20 trading days)
export const aiPredictions = pgTable('ai_predictions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  stockName: text('stock_name').notNull(),
  predictTime: timestamp('predict_time').defaultNow().notNull(),
  predictDate: text('predict_date').notNull(),
  basePrice: doublePrecision('base_price').notNull(),
  longTermScore: doublePrecision('long_term_score'),
  shortTermScore: doublePrecision('short_term_score'),
  stance: text('stance').notNull(), // '买入关注' | '持有' | '减仓' | '卖出' | '观望'
  horizon: text('horizon').notNull(),
  targetPrice: doublePrecision('target_price'),
  stopLossPrice: doublePrecision('stop_loss_price'),
  evidenceSummary: text('evidence_summary').notNull(),
  modelVersion: text('model_version').notNull(),
  ret1d: doublePrecision('ret_1d'),
  ret3d: doublePrecision('ret_3d'),
  ret5d: doublePrecision('ret_5d'),
  ret10d: doublePrecision('ret_10d'),
  ret20d: doublePrecision('ret_20d'),
  outcomeStatus: text('outcome_status').default('跟踪中').notNull(), // '跟踪中' | '命中' | '失效' | '中性'
  reviewNotes: text('review_notes'),
  lastTrackedAt: timestamp('last_tracked_at'),
});

// 24. Trading Plans (Risk-budget bound)
export const tradingPlans = pgTable('trading_plans', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  stockName: text('stock_name').notNull(),
  tradingStyle: text('trading_style').notNull(),
  stance: text('stance').notNull(),
  entryLow: doublePrecision('entry_low'),
  entryHigh: doublePrecision('entry_high'),
  breakoutCondition: text('breakout_condition'),
  stopLossPrice: doublePrecision('stop_loss_price').notNull(),
  takeProfitTargets: jsonb('take_profit_targets').$type<number[]>().default([]),
  riskRewardRatio: doublePrecision('risk_reward_ratio'),
  suggestedPositionPct: doublePrecision('suggested_position_pct').notNull(),
  suggestedShares: integer('suggested_shares').notNull(),
  maxLossYuan: doublePrecision('max_loss_yuan').notNull(),
  holdingHorizon: text('holding_horizon').notNull(),
  invalidationCondition: text('invalidation_condition').notNull(),
  applicableRuleSummary: text('applicable_rule_summary').notNull(),
  userConfirmed: boolean('user_confirmed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 25. Backtest Results
export const backtestResults = pgTable('backtest_results', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  strategyType: text('strategy_type').notNull(),
  periodLabel: text('period_label').notNull(), // '30D'|'90D'|'180D'|'1Y'|'3Y'|'5Y'
  paramsJson: jsonb('params_json').notNull(),
  totalReturnPct: doublePrecision('total_return_pct').notNull(),
  annualReturnPct: doublePrecision('annual_return_pct').notNull(),
  benchmarkReturnPct: doublePrecision('benchmark_return_pct').notNull(),
  winRatePct: doublePrecision('win_rate_pct').notNull(),
  profitLossRatio: doublePrecision('profit_loss_ratio').notNull(),
  maxDrawdownPct: doublePrecision('max_drawdown_pct').notNull(),
  sharpeRatio: doublePrecision('sharpe_ratio').notNull(),
  tradeCount: integer('trade_count').notNull(),
  avgHoldingDays: doublePrecision('avg_holding_days').notNull(),
  maxSingleLossPct: doublePrecision('max_single_loss_pct').notNull(),
  equityCurve: jsonb('equity_curve').notNull(),
  tradesLog: jsonb('trades_log').notNull(),
  complianceChecks: jsonb('compliance_checks').notNull(), // T+1, limit-up/down lock, slippage, fees
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 26. Analysis Reports
export const analysisReports = pgTable('analysis_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  stockName: text('stock_name').notNull(),
  title: text('title').notNull(),
  reportMarkdown: text('report_markdown').notNull(),
  reportJson: jsonb('report_json').notNull(),
  modelVersion: text('model_version').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 27. Alert Rules
export const alertRules = pgTable('alert_rules', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: text('symbol').notNull(),
  stockName: text('stock_name'),
  ruleType: text('rule_type').notNull(), // '突破压力位'|'跌破支撑'|'放量异常'|'涨跌停'|'公告提醒'|'情绪阈值'
  thresholdValue: doublePrecision('threshold_value'),
  cooldownMinutes: integer('cooldown_minutes').default(60).notNull(),
  channel: text('channel').default('站内通知').notNull(),
  webhookUrl: text('webhook_url'),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 28. Alert Events
export const alertEvents = pgTable('alert_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  ruleId: integer('rule_id').references(() => alertRules.id),
  symbol: text('symbol').notNull(),
  eventTitle: text('event_title').notNull(),
  conditionDesc: text('condition_desc').notNull(),
  actualData: text('actual_data').notNull(),
  notifyStatus: text('notify_status').default('已送达站内').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
});

// 29. Market Sentiment
export const marketSentiment = pgTable('market_sentiment', {
  id: serial('id').primaryKey(),
  tradeDate: text('trade_date').notNull(),
  phaseLabel: text('phase_label').notNull(), // '冰点'|'修复'|'回暖'|'高潮'|'分歧'|'退潮'
  sentimentScore: doublePrecision('sentiment_score').notNull(),
  upCount: integer('up_count'),
  downCount: integer('down_count'),
  limitUpCount: integer('limit_up_count'),
  limitDownCount: integer('limit_down_count'),
  brokenBoardCount: integer('broken_board_count'),
  sealRatePct: doublePrecision('seal_rate_pct'),
  maxContinuousBoards: integer('max_continuous_boards'),
  promotionRatePct: doublePrecision('promotion_rate_pct'),
  totalTurnoverYi: doublePrecision('total_turnover_yi'),
  prevDayLimitUpAvgPct: doublePrecision('prev_day_limit_up_avg_pct'),
  quantitativeBasis: jsonb('quantitative_basis').notNull(),
  dataSource: text('data_source').notNull(),
  collectedAt: timestamp('collected_at').defaultNow().notNull(),
  dataStatus: text('data_status').default('正常').notNull(),
});

// 30. Dynamic A-Share Trading Rules Engine Table
export const tradingRules = pgTable('trading_rules', {
  id: serial('id').primaryKey(),
  ruleCode: text('rule_code').notNull().unique(),
  ruleName: text('rule_name').notNull(),
  exchange: text('exchange').notNull(), // 'SH'|'SZ'|'BJ'|'ALL'
  board: text('board').notNull(), // '主板'|'创业板'|'科创板'|'北交所'|'ALL'
  securityType: text('security_type').notNull(), // '普通A股'|'ST/*ST'|'新股前5日'|'新股首日'|'退市整理'
  priceLimitPct: doublePrecision('price_limit_pct'), // null means no price limit
  tPlusRule: text('t_plus_rule').default('T+1').notNull(),
  minOrderQty: integer('min_order_qty').default(100).notNull(),
  qtyStep: integer('qty_step').default(100).notNull(),
  tickSize: doublePrecision('tick_size').default(0.01).notNull(),
  callAuctionDesc: text('call_auction_desc').notNull(),
  continuousAuctionDesc: text('continuous_auction_desc').notNull(),
  afterHoursDesc: text('after_hours_desc'),
  tempHaltDesc: text('temp_halt_desc'),
  stampDutySellPct: doublePrecision('stamp_duty_sell_pct').default(0.05).notNull(),
  transferFeePct: doublePrecision('transfer_fee_pct').default(0.001).notNull(),
  effectiveDate: text('effective_date').notNull(),
  expiryDate: text('expiry_date'),
  sourceUrl: text('source_url').notNull(),
  version: text('version').notNull(),
  needsVerification: boolean('needs_verification').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 31. Data Sources Registry
export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  sourceKey: text('source_key').notNull().unique(),
  sourceName: text('source_name').notNull(),
  category: text('category').notNull(),
  licenseType: text('license_type').notNull(), // '官方公开'|'第三方免费'|'商业授权'
  isEnabled: boolean('is_enabled').default(true).notNull(),
  status: text('status').default('正常').notNull(), // '正常'|'延迟'|'缺失'|'异常'|'接口未连接'
  rateLimitNote: text('rate_limit_note'),
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
});

// 32. Data Quality Logs
export const dataQualityLogs = pgTable('data_quality_logs', {
  id: serial('id').primaryKey(),
  sourceKey: text('source_key').notNull(),
  endpoint: text('endpoint').notNull(),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms'),
  missingFields: jsonb('missing_fields').$type<string[]>().default([]),
  message: text('message'),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
});

// 33. User Watchlists
export const userWatchlists = pgTable(
  'user_watchlists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    symbol: text('symbol').notNull(),
    stockName: text('stock_name').notNull(),
    groupName: text('group_name').default('核心观察池').notNull(),
    notes: text('notes'),
    targetBuyPrice: doublePrecision('target_buy_price'),
    stopLossPrice: doublePrecision('stop_loss_price'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_watchlist_user_symbol').on(table.userId, table.symbol)]
);

// 34. Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  target: text('target'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 35. Saved Stock Screener Presets
export const stockScreens = pgTable('stock_screens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  name: text('name').notNull(),
  conditionsJson: jsonb('conditions_json').notNull(),
  lastRunCount: integer('last_run_count'),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
