// src/components/ProjectMetaDashboard.tsx
import React from 'react';
import { useStore } from '../store/useStore'; // 确认路径是否正确
import { Button } from './ui/button';
import { FolderOpen, Layers, Database, Download } from 'lucide-react';
import type { ProjectMetaContract } from '../config/contract';

export function ProjectMetaDashboard() {
  const {projectName, folders, views, setActiveModule } = useStore();

  // 🛡️ 这里加上我们之前讨论的防白屏兜底代码！
  if (!folders || folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-neutral-950 text-neutral-400 space-y-4">
        <Database className="w-12 h-12 text-blue-500/50 mb-2" />
        <h2 className="text-xl font-semibold text-neutral-200">No Project Meta</h2>
        <p>Please load data folders first.</p>
        <Button onClick={() => setActiveModule('preload')} className="mt-4">
          <FolderOpen className="w-4 h-4 mr-2" /> Go to Data Preload
        </Button>
      </div>
    );
  }
  const generateProjectMeta = (): ProjectMetaContract => {
    return {
      projectName: projectName || "Untitled Project",
      folders: folders.map((f, i) => ({
        Id: i + 1,
        path: f.path,
        suffix: f.suffix || "",
        "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
        "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
        "files total": f.files ? f.files.length : 0,
        "image meta": {
          width: f.metadata?.width || 'Unknown',
          height: f.metadata?.height || 'Unknown',
          bands: f.metadata?.bands || 'Unknown',
          "data type": f.metadata?.fileType || 'uint8'
        }
      })),
      views: views.map((v, i) => {
        const fIndex = folders.findIndex(f => f.id === v.folderId);
        
        const safeTransform = {
          crop: (v.transform as any)?.crop || { t: 0, r: 100, b: 100, l: 0 },
          scaleX: v.transform?.scaleX ?? 1,
          scaleY: v.transform?.scaleY ?? (v.transform?.scaleX ?? 1),
          offsetX: v.transform?.offsetX ?? 0,
          offsetY: v.transform?.offsetY ?? 0
        };

        return {
          id: v.isMain ? 'main view' : `aug view ${i}`, 
          "folder id": fIndex >= 0 ? fIndex + 1 : 'Unknown',
          bands: v.bands,
          // 🌟 核心新增：只有当波段数为 1 时，才把 colormap 写入配置
          renderMode:v.bands.length === 3 ? 'rgb' : (v.colormap || 'gray'),
          isMain: v.isMain,
          transform: safeTransform
        };
      })
    };
  };

  const meta = generateProjectMeta();

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project_meta.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* 核心展示区：左右双栏布局 */}
      <div className="flex-1 grid grid-cols-2 gap-6 p-6 overflow-hidden">
        
        {/* 左侧：Folders 信息 */}
        <div className="flex flex-col h-full border border-neutral-800 bg-neutral-900 overflow-hidden rounded-xl">
          <div className="p-4 border-b border-neutral-800 shrink-0 bg-neutral-900">
            <h3 className="flex items-center gap-2 text-neutral-200 font-bold">
              <FolderOpen className="w-5 h-5 text-amber-500" /> 
              Data Folders ({meta.folders.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {meta.folders.map((folder) => (
              <div key={folder.Id} className="bg-black/40 border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 border-b border-neutral-800/50 pb-2 flex-wrap">
                  <span className="bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs font-bold font-mono">ID: {folder.Id}</span>
                  <span className="text-sm font-semibold text-neutral-200 truncate" title={folder.path}>{folder.path}</span>
                  
                  {/* 🌟 新增：在 Dashboard 面板中显示后缀 */}
                  {folder.suffix && (
                    <span className="text-amber-500 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/20 shrink-0">
                      Suffix: {folder.suffix}
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800/50 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-neutral-500 uppercase">Valid Files</span>
                    <span className="text-lg font-mono text-green-400">{folder["files in sceneGroups"]}</span>
                  </div>
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800/50 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-neutral-500 uppercase">Skipped</span>
                    <span className="text-lg font-mono text-red-400">{folder["files Skipped"]}</span>
                  </div>
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800/50 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-neutral-500 uppercase">Total</span>
                    <span className="text-lg font-mono text-blue-400">{folder["files total"]}</span>
                  </div>
                </div>

                <div className="bg-neutral-900 p-3 rounded border border-neutral-800/50 text-xs font-mono text-neutral-400 grid grid-cols-2 gap-y-2">
                  <div><span className="text-neutral-500 mr-2">Size:</span>{folder["image meta"].width} x {folder["image meta"].height}</div>
                  <div><span className="text-neutral-500 mr-2">Bands:</span>{folder["image meta"].bands}</div>
                  <div className="col-span-2"><span className="text-neutral-500 mr-2">Type:</span>{folder["image meta"]["data type"]}</div>
                </div>
              </div>
            ))}
            {meta.folders.length === 0 && <div className="text-center text-neutral-500 py-8">No folders loaded.</div>}
          </div>
        </div>

        {/* 右侧：Views 信息 */}
        <div className="flex flex-col h-full border border-neutral-800 bg-neutral-900 overflow-hidden rounded-xl">
          <div className="p-4 border-b border-neutral-800 shrink-0 bg-neutral-900">
            <h3 className="flex items-center gap-2 text-neutral-200 font-bold">
              <Layers className="w-5 h-5 text-blue-500" /> 
              Configured Views ({meta.views.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {meta.views.map((view) => (
              <div key={view.id} className="bg-black/40 border border-neutral-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800/50 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${view.isMain ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'bg-amber-600/20 text-amber-400 border border-amber-600/30'}`}>
                      {view.id}
                    </span>
                    {view.isMain && <span className="text-[10px] text-neutral-500 border border-neutral-700 px-1 rounded">Base Reference</span>}
                  </div>
                  <span className="text-xs text-neutral-400 font-mono">Folder ID: {view["folder id"]}</span>
                </div>

                <div className="bg-neutral-900 p-3 rounded border border-neutral-800/50 text-xs font-mono text-neutral-400 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 w-16">Bands:</span>
                    <div className="flex gap-1">
                      {view.bands.map((b, idx) => (
                         <span key={idx} className={`w-5 h-5 flex items-center justify-center rounded ${b === 0 ? 'bg-neutral-800 text-neutral-600' : 'bg-neutral-700 text-white'}`}>{b}</span>
                      ))}
                    </div>
                  </div>
                  {/* 找到 Dashboard 里的这段代码进行修正 */}
                  {view.bands.length === 1 && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-neutral-500">Render Mode:</span>
                      <span className="text-amber-400 capitalize bg-amber-400/10 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/20">
                        {/* 🌟 统一使用我们契约里定义的 renderMode 字段 */}
                        {view.renderMode} 
                      </span>
                    </div>
                  )}
                  {!view.isMain && (
                    <>
                      <div className="h-px bg-neutral-800 my-2"></div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Crop:</span>
                        <span className="text-amber-400">
                          {view.transform.crop.t.toFixed(1)}%, {view.transform.crop.r.toFixed(1)}%, {view.transform.crop.b.toFixed(1)}%, {view.transform.crop.l.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Scale:</span>
                        <span className="text-green-400">{view.transform.scaleX.toFixed(3)}, {view.transform.scaleY.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Offset:</span>
                        <span className="text-blue-400">{view.transform.offsetX.toFixed(0)}px, {view.transform.offsetY.toFixed(0)}px</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {meta.views.length === 0 && <div className="text-center text-neutral-500 py-8">No views configured.</div>}
          </div>
        </div>

      </div>
      
      {/* 底部操作区 */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-900 flex justify-between items-center shrink-0">
         <span className="text-xs text-neutral-500 flex items-center gap-1">
           <Database className="w-3 h-3"/> Live Project State
         </span>
         <Button onClick={handleExportJSON} variant="outline" className="border-blue-800 text-blue-400 hover:bg-blue-900/30">
           <Download className="w-4 h-4 mr-2" /> Download JSON Config
         </Button>
      </div>
    </div>
  );
}