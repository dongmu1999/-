import assert from 'node:assert/strict';
import { evaluateTradingRule } from '../src/server/engines/tradingRules.ts';
import { computeTechnicalIndicators } from '../src/server/engines/indicators.ts';
import { runAShareBacktest } from '../src/server/engines/backtest.ts';
import { encryptApiKey, decryptApiKey } from '../src/server/crypto.ts';

console.log('1. Testing A-Share Dynamic Trading Rules Engine...');
const mainRule = evaluateTradingRule({ symbol: '600519', name: '贵州茅台' });
assert.equal(mainRule.board, '主板');
assert.equal(mainRule.priceLimitPct, 10);
assert.equal(mainRule.limitUpPrice(100), 110);

const stRule = evaluateTradingRule({ symbol: '000001', name: 'ST测试' });
assert.equal(stRule.priceLimitPct, 5);

const starRule = evaluateTradingRule({ symbol: '688981', name: '中芯国际' });
assert.equal(starRule.board, '科创板');
assert.equal(starRule.priceLimitPct, 20);
assert.equal(starRule.minOrderQty, 200);
assert.equal(starRule.qtyStep, 1);

const bseRule = evaluateTradingRule({ symbol: '830799', name: '艾融软件' });
assert.equal(bseRule.board, '北交所');
assert.equal(bseRule.priceLimitPct, 30);

console.log('2. Testing Server-Side AES-256-GCM Encryption...');
const { encrypted, last4 } = encryptApiKey('sk-test-1234567890abcd');
assert.equal(last4, 'abcd');
assert.equal(decryptApiKey(encrypted), 'sk-test-1234567890abcd');

console.log('3. Testing Technical Indicators & T+1 Backtest Engine...');
const syntheticBars = Array.from({ length: 120 }, (_, i) => {
  const base = 100 + Math.sin(i / 8) * 10 + i * 0.1;
  return {
    time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: Number((base - 0.5).toFixed(2)),
    high: Number((base + 1.5).toFixed(2)),
    low: Number((base - 1.5).toFixed(2)),
    close: Number(base.toFixed(2)),
    volume: 100000 + i * 1000,
  };
});
const tech = computeTechnicalIndicators(syntheticBars);
assert.ok(tech.latest?.ma20 !== null);
assert.ok(tech.latest?.rsi14 !== null);

const bt = runAShareBacktest(syntheticBars, {
  symbol: '600519',
  stockName: '贵州茅台',
  strategyType: 'MA_CROSS',
  periodLabel: '90D',
  initialCapital: 500000,
});
assert.equal(bt.complianceChecks.tPlusOneEnforced, true);
assert.ok(bt.equityCurve.length > 10);

console.log('All engine verification checks passed!');
