// src/config/colors.ts

// ==========================================
// 1. Colormap 色带配置 (用于单波段伪彩色渲染)
// ==========================================
export interface ColormapConfig {
  name: string;
  gradient: string;
}

export const COLOR_MAPS: ColormapConfig[] = [
  { name: 'gray', gradient: 'linear-gradient(to right, #000000, #ffffff)' },
  { name: 'jet', gradient: 'linear-gradient(to right, #00007F, #0000FF, #007FFF, #00FFFF, #7FFF7F, #FFFF00, #FF7F00, #FF0000, #7F0000)' },
  { name: 'viridis', gradient: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)' },
  { name: 'plasma', gradient: 'linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)' },
  { name: 'inferno', gradient: 'linear-gradient(to right, #000004, #420a68, #932667, #dd513a, #fca50a, #fcffa4)' },
  { name: 'bone', gradient: 'linear-gradient(to right, #000000, #4a4a68, #a2a2ba, #ffffff)' },
  { name: 'hot', gradient: 'linear-gradient(to right, #0b0000, #ff0000, #ffff00, #ffffff)' }
] as const;


// ==========================================
// 2. 波段方块 (Channels) 高亮样式配置
// ==========================================
// 这里存储的是 Tailwind CSS 的类名字符串。
// 顺序对应：Band 1, Band 2, Band 3, Band 4, Band 5... (循环使用)
export const BAND_COLORS: string[] = [
  'bg-red-50 border-red-500 text-red-600 shadow-[0_0_5px_rgba(239,68,68,0.3)]',       // 波段 1 (红)
  'bg-green-50 border-green-500 text-green-600 shadow-[0_0_5px_rgba(34,197,94,0.3)]',   // 波段 2 (绿)
  'bg-blue-50 border-blue-500 text-blue-600 shadow-[0_0_5px_rgba(59,130,246,0.3)]',    // 波段 3 (蓝)
  'bg-purple-50 border-purple-500 text-purple-600 shadow-[0_0_5px_rgba(168,85,247,0.3)]', // 波段 4 (紫)
  'bg-amber-50 border-amber-500 text-amber-600 shadow-[0_0_5px_rgba(245,158,11,0.3)]',  // 波段 5 (黄/琥珀)
  'bg-cyan-50 border-cyan-500 text-cyan-600 shadow-[0_0_5px_rgba(6,182,212,0.3)]',      // 波段 6 (青)
  'bg-pink-50 border-pink-500 text-pink-600 shadow-[0_0_5px_rgba(236,72,153,0.3)]',     // 波段 7 (粉色)
  'bg-lime-50 border-lime-500 text-lime-600 shadow-[0_0_5px_rgba(132,204,22,0.3)]',     // 波段 8 (石灰绿)
];

// 波段方块【未选中】时的默认基础样式
export const BAND_BASE_STYLE = "w-7 h-7 rounded border flex items-center justify-center text-xs font-bold transition-all duration-150";
export const BAND_UNSELECTED_STYLE = "bg-neutral-50 border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:bg-neutral-100";


// ==========================================
// 3. 全局 UI 主题配置 (🌟 预留坑位，暂不接管系统)
// ==========================================
// 未来可以通过这组配置，配合 Context 或 CSS 变量来实现一键切换 深/浅/护眼 模式
export const UI_THEMES = {
  light: {
    background: '#ffffff',
    cardBg: '#f8fafc',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
  },
  dark: {
    background: '#0a0a0a',
    cardBg: '#171717',
    textPrimary: '#f8fafc',
    textSecondary: '#a1a1aa',
    border: '#262626',
  }
};