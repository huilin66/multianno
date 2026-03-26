import React, { useState } from 'react'; // 【新增】：引入 useState
import { useStore } from './store/useStore';
// 【修改】：确保从 Modules 导入 ProjectMetaModal
import { DataPreload, ViewExtentCheck, SyncAnnotation, DataFormatExchange, ProjectMetaDashboard } from './components/Modules';
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
// 【新增】：引入 Database 图标
import { Menu, Layers, Settings, Download, FolderOpen, Database } from 'lucide-react';

export default function App() {
  const { activeModule, setActiveModule, currentStem } = useStore();

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
        
        <div className="flex items-center justify-center gap-3 w-1/3">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold">
            M
          </div>
          <h1 className="text-xl font-bold tracking-tight">MultiAnno</h1>
          {currentStem && (
            <span className="ml-4 px-3 py-1 bg-neutral-800 rounded-full text-sm font-mono text-neutral-300">
              {currentStem}
            </span>
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

      {/* Dialogs for other modules */}
      <Dialog 
        open={activeModule === 'preload'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>Data Preload</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataPreload />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={activeModule === 'extent'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-6xl sm:max-w-6xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>View Extent Check</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ViewExtentCheck />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={activeModule === 'export'} 
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-3xl sm:max-w-3xl h-[70vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>Export Data</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataFormatExchange />
          </div>
        </DialogContent>
      </Dialog>

{/* 统一格式的 Project Meta 弹窗！ */}
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