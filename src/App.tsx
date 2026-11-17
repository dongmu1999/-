import React, { useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Compass,
  LogIn,
  LogOut,
  Search,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MarketMonitorCenter } from './pages/MarketMonitorCenter';
import { ScreenerAndComparePage } from './pages/ScreenerAndComparePage';
import { StockResearchWorkbench } from './pages/StockResearchWorkbench';
import { BacktestAlertsSystemPage } from './pages/BacktestAlertsSystemPage';
import { CuratedStocksPage } from './pages/CuratedStocksPage';

type ActiveView = 'market' | 'curated' | 'screener' | 'research' | 'backtest' | 'alerts' | 'system';

const MainShell: React.FC = () => {
  const { user, loading, authError, signInWithGoogle, logout } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('market');
  const [activeSymbol, setActiveSymbol] = useState('600519');
  const [quickCode, setQuickCode] = useState('');

  const handleSelectStock = (symbol: string) => {
    const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
    if (/^\d{6}$/.test(clean)) {
      setActiveSymbol(clean);
      setActiveView('research');
    }
  };

  const handleQuickJump = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickCode.replace(/[^0-9]/g, '').slice(0, 6);
    if (/^\d{6}$/.test(clean)) {
      handleSelectStock(clean);
      setQuickCode('');
    }
  };

  const navItems: { id: ActiveView; label: string; sub: string; icon: React.ReactNode }[] = [
    {
      id: 'market',
      label: 'A股市场监控中心',
      sub: '指数 · 涨停梯队 · 情绪 · 板块',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'curated',
      label: '精选好股研究',
      sub: '百股严选 · K线买点 · 止盈止损',
      icon: <Award className="w-4 h-4" />,
    },
    {
      id: 'screener',
      label: '选股筛选与多股对比',
      sub: '全市场搜索 · 筛选器 · 自选股',
      icon: <SlidersHorizontal className="w-4 h-4" />,
    },
    {
      id: 'research',
      label: '个股深度与AI决策',
      sub: `当前标的 ${activeSymbol} · 价值/短线/计划`,
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 'backtest',
      label: '历史回测与自动复盘',
      sub: 'T+1涨跌停回测 · 1-20日跟踪',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: 'alerts',
      label: '风险预警与研究档案',
      sub: '站内预警 · 历史报告导出',
      icon: <Bell className="w-4 h-4" />,
    },
    {
      id: 'system',
      label: '数据源、规则与设置',
      sub: '风控预算 · 加密AI · 交易规则',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between hidden md:flex">
        <div>
          <div className="h-14 px-5 flex items-center border-b border-slate-200">
            <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
              China Stock Intelligence
            </span>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div className={`text-[11px] truncate ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {item.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">研究合规原则</div>
          <div>数据来源可追溯 · 证据优先于观点</div>
          <div>默认不自动下单 · 计划需人工确认</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Clean 3-Zone Contract) */}
        <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="md:hidden text-sm font-bold text-slate-900 whitespace-nowrap">
              CSI V3.0
            </span>
            <span className="hidden md:inline text-xs font-medium text-slate-500 whitespace-nowrap">
              A股AI智能研究与投资决策系统
            </span>
          </div>

          {/* Quick Jump Code Search */}
          <form onSubmit={handleQuickJump} className="flex-1 max-w-md flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                placeholder="输入6位A股代码直达深度研究 (如 600519 / 300750 / 688981)"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0"
            >
              研究
            </button>
          </form>

          {/* Primary Auth Action */}
          <div className="flex items-center gap-3 shrink-0">
            {loading ? (
              <span className="text-xs text-slate-400">验证中...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 hidden sm:inline truncate max-w-[140px]">
                  {user.email}
                </span>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  退出
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                Google 登录
              </button>
            )}
          </div>
        </header>

        {/* Mobile Nav Strip */}
        <div className="md:hidden px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeView === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {authError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {authError}
          </div>
        )}

        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
          {activeView === 'market' && <MarketMonitorCenter onSelectStock={handleSelectStock} />}
          {activeView === 'curated' && <CuratedStocksPage onSelectStock={handleSelectStock} />}
          {activeView === 'screener' && <ScreenerAndComparePage onSelectStock={handleSelectStock} />}
          {activeView === 'research' && (
            <StockResearchWorkbench symbol={activeSymbol} onSelectStock={handleSelectStock} />
          )}
          {activeView === 'backtest' && (
            <BacktestAlertsSystemPage
              defaultSection="backtest"
              activeSymbol={activeSymbol}
              onSelectStock={handleSelectStock}
            />
          )}
          {activeView === 'alerts' && (
            <BacktestAlertsSystemPage
              defaultSection="alerts_history"
              activeSymbol={activeSymbol}
              onSelectStock={handleSelectStock}
            />
          )}
          {activeView === 'system' && (
            <BacktestAlertsSystemPage
              defaultSection="system"
              activeSymbol={activeSymbol}
              onSelectStock={handleSelectStock}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  );
}
