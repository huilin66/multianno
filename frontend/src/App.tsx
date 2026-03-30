import React, { useState } from 'react'; 
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
import { Menu, Settings, Download, FolderOpen, Database, FolderPlus, Upload } from 'lucide-react';

export default function App() {
  const { activeModule, setActiveModule, currentStem, projectName} = useStore();

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900 shrink-0 h-14">
        <div className="flex items-center gap-4 w-1/3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
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
        {/* 稍微把宽度调大一点，比如 w-1/2，防止名字太长挤压 */}
        <div className="flex items-center justify-center gap-3 w-1/2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold">
            MA
          </div>
          <h1 className="text-xl font-bold tracking-tight">MultiAnno</h1>
          
          {/* 🌟 新增：显示当前项目名称 */}
          <div className="h-4 w-[1px] bg-neutral-700" />
          <span className="text-sm font-semibold text-blue-400 tracking-wide truncate max-w-[200px]" title={projectName}>
            {projectName}
          </span>

          {/* 原有的 currentStem 显示 */}
          {currentStem && (
            <>
              <div className="h-4 w-[1px] bg-neutral-700" />
              <span className="px-3 py-1 bg-neutral-800 rounded-full text-xs font-mono text-neutral-300 truncate max-w-[150px]">
                {currentStem}
              </span>
            </>
          )}
        </div>

        <div className="w-1/3 flex justify-end">
          {/* Future top-right actions */}
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
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-emerald-400"/> Create New Project
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
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-400"/> Load Project
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
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
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
        <DialogContent className="max-w-6xl sm:max-w-6xl h-[90vh] flex flex-col p-0 border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
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
        <DialogContent className="max-w-3xl sm:max-w-3xl h-[70vh] flex flex-col p-0 border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
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
        <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 bg-neutral-950 border-neutral-800 overflow-hidden">
          <DialogHeader className="p-4 border-b border-neutral-800 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-white">
              <Database className="w-5 h-5 text-blue-400"/> Project Metadata Dashboard
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ProjectMetaDashboard />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}