import type { ThemeMode } from '../storage/settings'

export const CONTENT_THEME_CSS = `
  :host {
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-pop: cubic-bezier(0.34, 1.5, 0.64, 1);
    --dur-fast: 240ms;
    --dur-pop: 340ms;
    --font: system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;

    --bg: #f7f8fc;
    --surface: #ffffff;
    --surface-2: #f2f4fa;
    --surface-3: #e9edf7;
    --border: #e6eaf3;
    --text: #1a1d2b;
    --text-muted: #5f6779;
    --text-faint: #98a0b3;
    --brand: #4f6bf0;
    --brand-strong: #3a54d8;
    --brand-soft: #edf1ff;
    --on-brand: #ffffff;
    --brand-grad: linear-gradient(135deg, #5a78ff, #4f6bf0);
    --brand-glow: 0 6px 16px -10px rgba(79, 107, 240, 0.75);
    --danger: #d93b32;
    --danger-soft: #fdecea;
    --ok: #067a4d;
    --ok-soft: #e7f6ee;
    --warn: #a85a00;
    --warn-soft: #fef3e2;
    --mark-error: #ef4444;
    --mark-warn: #f59e0b;
    --mark-add: #16a34a;
    --radius-sm: 10px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --shadow-sm: 0 1px 2px rgba(20, 28, 60, 0.06);
    --shadow-md: 0 14px 34px -14px rgba(43, 60, 140, 0.28);
  }

  @media (prefers-color-scheme: dark) {
    :host(:not([data-theme="light"])) {
      --bg: #0f1118;
      --surface: #171a23;
      --surface-2: #1d2130;
      --surface-3: #262b3d;
      --border: #2a3042;
      --text: #e9ecf5;
      --text-muted: #9aa4bb;
      --text-faint: #7a8399;
      --brand: #7d8eff;
      --brand-strong: #94a2ff;
      --brand-soft: rgba(125, 142, 255, 0.15);
      --on-brand: #10131c;
      --brand-grad: linear-gradient(135deg, #8c9bff, #7d8eff);
      --brand-glow: 0 6px 18px -10px rgba(125, 142, 255, 0.85);
      --danger: #ff8078;
      --danger-soft: #331b1b;
      --ok: #4ade80;
      --ok-soft: #12291c;
      --warn: #e7a93c;
      --warn-soft: #2c2413;
      --mark-error: #f87171;
      --mark-warn: #fbbf24;
      --mark-add: #4ade80;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
      --shadow-md: 0 18px 40px -18px rgba(0, 0, 0, 0.6);
    }
  }

  :host([data-theme="dark"]) {
    --bg: #0f1118;
    --surface: #171a23;
    --surface-2: #1d2130;
    --surface-3: #262b3d;
    --border: #2a3042;
    --text: #e9ecf5;
    --text-muted: #9aa4bb;
    --text-faint: #7a8399;
    --brand: #7d8eff;
    --brand-strong: #94a2ff;
    --brand-soft: rgba(125, 142, 255, 0.15);
    --on-brand: #10131c;
    --brand-grad: linear-gradient(135deg, #8c9bff, #7d8eff);
    --brand-glow: 0 6px 18px -10px rgba(125, 142, 255, 0.85);
    --danger: #ff8078;
    --danger-soft: #331b1b;
    --ok: #4ade80;
    --ok-soft: #12291c;
    --warn: #e7a93c;
    --warn-soft: #2c2413;
    --mark-error: #f87171;
    --mark-warn: #fbbf24;
    --mark-add: #4ade80;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 18px 40px -18px rgba(0, 0, 0, 0.6);
  }
`

export function applyHostTheme(host: HTMLElement, theme: ThemeMode): void {
  if (theme === 'auto') {
    host.removeAttribute('data-theme')
    return
  }
  host.setAttribute('data-theme', theme)
}
