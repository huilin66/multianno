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
  'bg-blue-50 border-primary text-blue-600 shadow-[0_0_5px_rgba(59,130,246,0.3)]',    // 波段 3 (蓝)
  'bg-purple-50 border-purple-500 text-purple-600 shadow-[0_0_5px_rgba(168,85,247,0.3)]', // 波段 4 (紫)
  'bg-amber-50 border-amber-500 text-amber-600 shadow-[0_0_5px_rgba(245,158,11,0.3)]',  // 波段 5 (黄/琥珀)
  'bg-cyan-50 border-cyan-500 text-cyan-600 shadow-[0_0_5px_rgba(6,182,212,0.3)]',      // 波段 6 (青)
  'bg-pink-50 border-pink-500 text-pink-600 shadow-[0_0_5px_rgba(236,72,153,0.3)]',     // 波段 7 (粉色)
  'bg-lime-50 border-lime-500 text-lime-600 shadow-[0_0_5px_rgba(132,204,22,0.3)]',     // 波段 8 (石灰绿)
];

// 波段方块【未选中】时的默认基础样式
export const BAND_BASE_STYLE = "w-7 h-7 rounded border flex items-center justify-center text-xs font-bold transition-all duration-150";
export const BAND_UNSELECTED_STYLE = "bg-neutral-50 border-neutral-200 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 hover:bg-neutral-100";
export const BRAND_COLOR = {
  light: '#2563eb', // 对应上面的日间蓝色
  dark: '#3b82f6',  // 对应上面的夜间蓝色
};

// ==========================================
// 3. 全局 UI 主题配置 (🌟 预留坑位，暂不接管系统)
// ==========================================
// 未来可以通过这组配置，配合 Context 或 CSS 变量来实现一键切换 深/浅/护眼 模式
// src/config/colors.ts
export const UI_THEMES = {
  light: {
    // 画布背景色
    canvasMainBg: '#f1f5f9', // 浅灰色底
    canvasAugBg: 'rgba(239, 68, 68, 0.05)', // 非常淡的红色底
    mockBorder: '#cbd5e1', // 浅色边框
    
    // 标注完成的颜色 (原来是纯绿色 #0f0)
    annoDoneStroke: '#16a34a', // 柔和的深绿
    annoDoneFill: 'rgba(34, 197, 94, 0.15)',
    annoDoneText: '#15803d',
    
    // 正在绘制的颜色 (原来是纯黄色 #ff0)
    // annoDrawingStroke: '#eab308', // 柔和的琥珀黄
    // annoDrawingFill: 'rgba(234, 179, 8, 0.2)',

    // 🌟 将主交互色应用到绘制中（比如正在拉伸的框、激活的点等）
    interactivePrimary: BRAND_COLOR.light, 
    annoDrawingStroke: BRAND_COLOR.light,
    annoDrawingFill: 'rgba(37, 99, 235, 0.2)', // 蓝色半透明
  },
  dark: {
    // 画布背景色
    canvasMainBg: '#171717', // 深黑灰底 (原来的 #333)
    canvasAugBg: 'rgba(255, 100, 100, 0.15)', 
    mockBorder: '#555555',
    
    // 标注完成的颜色
    annoDoneStroke: '#4ade80', // 亮绿色
    annoDoneFill: 'rgba(74, 222, 128, 0.2)',
    annoDoneText: '#4ade80',
    
    // 正在绘制的颜色
    // annoDrawingStroke: '#facc15', // 亮黄色
    // annoDrawingFill: 'rgba(250, 204, 21, 0.2)',

    interactivePrimary: BRAND_COLOR.dark,
    annoDrawingStroke: BRAND_COLOR.dark,
    annoDrawingFill: 'rgba(59, 130, 246, 0.2)', // 蓝色半透明
  }
};

// ==========================================
// 4. 类别标签预设颜色配置 (Taxonomy Colors)
// ==========================================
export const TAXONOMY_COLORS: string[] = [
  '#ef4444', // Red
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#14b8a6', // Teal
];


// 🌟 核心引擎 1：纯前端的高精度科学色彩映射表 (LUT)
export const COLOR_MAP_LUT: Record<string, number[][]> = {
  gray: [[0,0,0], [255,255,255]],
  jet: [[0,0,131], [0,0,255], [0,255,255], [255,255,0], [255,0,0], [128,0,0]],
  viridis: [[68,1,84], [72,40,120], [62,74,137], [49,104,142], [38,130,142], [31,158,137], [53,183,121], [109,205,89], [180,222,44], [253,231,37]],
  plasma: [[13,8,135], [75,3,161], [126,3,168], [170,35,149], [204,70,120], [229,107,93], [248,149,64], [253,195,40], [240,249,33]],
  inferno: [[0,0,4], [32,11,83], [87,21,126], [148,43,128], [211,81,113], [245,136,96], [252,202,70], [252,255,164]]
};