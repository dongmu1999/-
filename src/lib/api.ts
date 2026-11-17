import { auth } from './firebase';

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // ignore token error for public routes
    }
  }

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `请求失败 (${resp.status})`);
  }
  return data as T;
}

export function formatYuanYi(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '缺失';
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toFixed(2);
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '缺失';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function priceColorClass(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return 'text-slate-700';
  return val > 0 ? 'text-red-600' : 'text-emerald-600';
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
