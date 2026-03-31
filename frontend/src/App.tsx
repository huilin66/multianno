import React, { useState, useEffect } from 'react'; 
import { useStore } from './store/useStore';
import { 
  LoadProject, 
  CreateProject, 
  DataPreload, 
  ViewExtentCheck, 
  SyncAnnotation, 
  DataFormatExchange, 
  ProjectMetaDashboard 
} from './components/Modules';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
// 🌟 引入新的图标: FolderPlus 和 Upload
import { Menu, Settings, Download, FolderOpen, Database, FolderPlus, Upload, Sun, Moon } from 'lucide-react';

export default function App() {
  const { activeModule, setActiveModule, currentStem, projectName, theme, setTheme} = useStore();

  // 🌟 4. 核心逻辑：监听 theme 变化，动态切换 HTML 根节点的 class
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0 h-14">
        <div className="flex items-center gap-4 w-1/3">
          <DropdownMenu>
          {/* 找到 App.tsx 第 44 行左右 */}
            {/* 🌟 完美避开 button 嵌套报错 */}
            <DropdownMenuTrigger className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors outline-none cursor-pointer shrink-0 text-neutral-700 dark:text-neutral-200">
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              
              {/* 🌟 1. 修复菜单栏：创建新项目 */}
              <DropdownMenuItem onClick={() => setActiveModule('createproject')}>
                <FolderPlus className="w-4 h-4 mr-2" /> Create New Project
              </DropdownMenuItem>
              
              {/* 🌟 2. 修复菜单栏：加载现有项目 */}
              <DropdownMenuItem onClick={() => setActiveModule('loadproject')}>
                <Upload className="w-4 h-4 mr-2" /> Load Project
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => setActiveModule('preload')}>
                <FolderOpen className="w-4 h-4 mr-2" /> Data Preload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('extent')}>
                <Settings className="w-4 h-4 mr-2" /> View Extent Check
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('meta')}>
                <Database className="w-4 h-4 mr-2" /> Project Meta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('export')}>
                <Download className="w-4 h-4 mr-2" /> Export Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* 中间区域：Logo + 软件名 + 项目名 + 当前切片 */}
        {/* 中间区域：Logo + 软件名 + 项目名 + 当前切片 */}
        <div className="flex items-center justify-center gap-3 w-1/2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold shadow-sm">
            MA
          </div>
          {/* 🌟 1. 主标题：日间深灰，夜间纯白 */}
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white transition-colors">
            MultiAnno
          </h1>
          
          {/* 🌟 2. 分隔线：日间浅灰，夜间深灰 */}
          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 transition-colors" />
          
          {/* 🌟 3. 项目名：日间深蓝，夜间浅蓝 */}
          <span className="text-sm font-semibold text-primary tracking-wide truncate max-w-[200px] transition-colors" title={projectName}>
            {projectName}
          </span>

          {/* 🌟 4. 当前切片 (Stem) 药丸标签：日间浅灰底深色字，夜间深灰底浅色字 */}
          {currentStem && (
            <>
              <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 transition-colors" />
              <span className="px-3 py-1 bg-neutral-200 dark:bg-neutral-800 rounded-full text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate max-w-[150px] transition-colors">
                {currentStem}
              </span>
            </>
          )}
        </div>

        {/* 右侧区域：放置主题切换按钮 */}
        <div className="w-1/3 flex justify-end items-center gap-2">
          
          {/* 🌟 6. 主题切换按钮本尊 */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-full"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {/* 根据当前状态渲染不同的图标 */}
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 transition-all" /> 
            ) : (
              <Moon className="w-5 h-5 transition-all" />
            )}
          </Button>

        </div>
      </header>

      {/* Main Content Area - Always Workspace */}
      <main className="flex-grow overflow-hidden relative">
        <SyncAnnotation />
      </main>

      {/* ============== 以下是各种 Dialog 容器 ============== */}

      {/* 🌟 新增：Create Project 弹窗 */}
      <Dialog 
        open={activeModule === 'createproject'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
      {/* 🌟 修复后：去掉了 bg-neutral-900 text-white 等，使用标准样式 */}
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary"/> Create New Project
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
             {/* 传入 onClose 回调，以便组件内部点 Cancel 时可以关闭弹窗 */}
            <CreateProject onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 🌟 新增：Load Project 弹窗 */}
      <Dialog 
        open={activeModule === 'loadproject'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        {/* 🌟 修复后：去掉硬编码颜色 */}
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary"/> Load Project
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <LoadProject 
               onClose={() => setActiveModule('workspace')} 
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 原有的 Preload 弹窗 */}
      <Dialog 
        open={activeModule === 'preload'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle>Data Preload</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataPreload />
          </div>
        </DialogContent>
      </Dialog>

      {/* 原有的 Extent Check 弹窗 */}
      <Dialog 
        open={activeModule === 'extent'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-6xl sm:max-w-6xl h-[90vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle>View Extent Check</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ViewExtentCheck />
          </div>
        </DialogContent>
      </Dialog>

      {/* 原有的 Export Data 弹窗 */}
      <Dialog 
        open={activeModule === 'export'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-3xl sm:max-w-3xl h-[70vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle>Export Data</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataFormatExchange />
          </div>
        </DialogContent>
      </Dialog>

      {/* 统一格式的 Project Meta 弹窗 */}
      <Dialog 
        open={activeModule === 'meta'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <Database className="w-5 h-5 text-blue-400"/> Project Metadata Dashboard
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ProjectMetaDashboard onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}