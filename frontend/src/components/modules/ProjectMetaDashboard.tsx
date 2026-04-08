// src/components/ProjectMetaDashboard.tsx
import React from 'react';
import { useStore } from '../../store/useStore'; // 确认路径是否正确
import { Button } from '../ui/button';
import { FolderOpen, Layers, Database, Download } from 'lucide-react';
import type { ProjectMetaContract } from '../../config/contract';
import { useTranslation } from 'react-i18next'; // 🌟 引入
import { generateProjectMetaConfig } from '../../lib/projectUtils';

// 🌟 1. 新增：定义组件接收的参数
interface ProjectMetaDashboardProps {
  onClose?: () => void;
}

export function ProjectMetaDashboard({ onClose }: ProjectMetaDashboardProps = {}) {
  const { t } = useTranslation(); // 🌟 激活翻译钩子
  const {projectName, folders, views, setActiveModule } = useStore();

  // 🛡️ 这里加上我们之前讨论的防白屏兜底代码！
  if (!folders || folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 space-y-4">
        <Database className="w-12 h-12 text-blue-500/50 mb-2" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{t('projectMeta.empty.title')}</h2>
        <p>{t('projectMeta.empty.desc')}</p>
        <Button onClick={() => setActiveModule('preload')} className="mt-4">
          <FolderOpen className="w-4 h-4 mr-2" /> {t('projectMeta.empty.goPreload')}
        </Button>
      </div>
    );
  }

  const meta: ProjectMetaContract = generateProjectMetaConfig(useStore.getState());

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_meta.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
      {/* 核心展示区：左右双栏布局 */}
      <div className="flex-1 grid grid-cols-2 gap-6 p-6 overflow-hidden">
        
        {/* 左侧：Folders 信息 */}
        <div className="flex flex-col h-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden rounded-xl">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900">
            <h3 className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-bold">
              <FolderOpen className="w-5 h-5 text-amber-500" /> 
              {t('projectMeta.folders.title')} ({meta.folders.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {meta.folders.map((folder) => (
            // {/* 🌟 1. 外层卡片：日间浅灰，夜间深灰 */}
            <div key={folder.Id} className="bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 transition-colors">
              <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800/50 pb-2 flex-wrap">
                {/* 🌟 2. ID 标签：文字和背景双重适配 */}
                <span className="bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 rounded text-xs font-bold font-mono">{t('projectMeta.folders.id')}: {folder.Id}</span>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-200 truncate" title={folder.path}>{folder.path}</span>
                
                {folder.suffix && (
                  <span className="text-amber-600 dark:text-amber-500 font-mono font-bold bg-amber-100 dark:bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] border border-amber-200 dark:border-amber-500/20 shrink-0">
                    {t('projectMeta.folders.suffix')}: {folder.suffix}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {/* 🌟 3. 三个数据小方块：日间纯白，夜间深灰 */}
                <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800/50 flex flex-col items-center justify-center shadow-sm dark:shadow-none">
                  <span className="text-[10px] text-neutral-500 uppercase">{t('projectMeta.folders.validFiles')}</span>
                  <span className="text-lg font-mono text-green-600 dark:text-green-400">{folder["files in sceneGroups"]}</span>
                </div>
                <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800/50 flex flex-col items-center justify-center shadow-sm dark:shadow-none">
                  <span className="text-[10px] text-neutral-500 uppercase">{t('projectMeta.folders.skipped')}</span>
                  <span className="text-lg font-mono text-red-500 dark:text-red-400">{folder["files Skipped"]}</span>
                </div>
                <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800/50 flex flex-col items-center justify-center shadow-sm dark:shadow-none">
                  <span className="text-[10px] text-neutral-500 uppercase">{t('projectMeta.folders.total')}</span>
                  <span className="text-lg font-mono text-blue-600 dark:text-blue-400">{folder["files total"]}</span>
                </div>
              </div>

              {/* 🌟 4. 底部参数条：日间纯白字变深，夜间恢复 */}
              <div className="bg-white dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-800/50 text-xs font-mono text-neutral-700 dark:text-neutral-400 grid grid-cols-2 gap-y-2 shadow-sm dark:shadow-none transition-colors">
                <div><span className="text-neutral-500 mr-2">{t('projectMeta.folders.size')}:</span>{folder["image meta"].width} x {folder["image meta"].height}</div>
                <div><span className="text-neutral-500 mr-2">{t('projectMeta.folders.bands')}:</span>{folder["image meta"].bands}</div>
                <div className="col-span-2"><span className="text-neutral-500 mr-2">{t('projectMeta.folders.type')}::</span>{folder["image meta"]["data type"]}</div>
              </div>
            </div>
            ))}
            {meta.folders.length === 0 && <div className="text-center text-neutral-500 py-8">{t('projectMeta.folders.noFolders')}</div>}
          </div>
        </div>

        {/* 右侧：Views 信息 */}
        <div className="flex flex-col h-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden rounded-xl">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900">
            <h3 className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-bold">
              <Layers className="w-5 h-5 text-blue-500" /> 
              {t('projectMeta.views.title')} ({meta.views.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {meta.views.map((view) => (
            // {/* 🌟 1. 外层卡片 */}
            <div key={view.id} className="bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 transition-colors">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${view.isMain ? 'bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-600/30' : 'bg-amber-100 dark:bg-amber-600/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-600/30'}`}>
                    {view.id}
                  </span>
                  {view.isMain && <span className="text-[10px] text-neutral-500 border border-neutral-300 dark:border-neutral-700 px-1 rounded">{t('projectMeta.views.baseRef')}</span>}
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">{t('projectMeta.views.folderId')}: {view["folder id"]}</span>
              </div>

              {/* 🌟 2. 内部参数板 */}
              <div className="bg-white dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-800/50 text-xs font-mono text-neutral-700 dark:text-neutral-400 space-y-2 shadow-sm dark:shadow-none transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 w-16">{t('projectMeta.views.bands')}:</span>
                  <div className="flex gap-1">
                  {view.bands.map((b, idx) => (
                    // {/* 🌟 3. Band 小方块：使用 primary 主色调实现日夜自适应 */}
                    <span 
                      key={idx} 
                      className={`w-5 h-5 flex items-center justify-center rounded font-bold shadow-sm text-xs ${
                        b === 0 
                          ? 'bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-600 border border-neutral-200 dark:border-transparent' 
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                </div>
                {view.bands.length === 1 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-neutral-500">{t('projectMeta.views.renderMode')}:</span>
                    <span className="text-amber-600 dark:text-amber-400 capitalize bg-amber-50 dark:bg-amber-400/10 px-1.5 py-0.5 rounded text-[10px] border border-amber-200 dark:border-amber-500/20">
                      {view.renderMode} 
                    </span>
                  </div>
                )}
                {!view.isMain && (
                  <>
                    {/* 🌟 分割线 */}
                    <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-2"></div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">{t('projectMeta.views.crop')}:</span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {view.transform.crop.t.toFixed(1)}%, {view.transform.crop.r.toFixed(1)}%, {view.transform.crop.b.toFixed(1)}%, {view.transform.crop.l.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">{t('projectMeta.views.scale')}:</span>
                      <span className="text-green-600 dark:text-green-400">{view.transform.scaleX.toFixed(3)}, {view.transform.scaleY.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">{t('projectMeta.views.offset')}:</span>
                      <span className="text-primary dark:text-blue-400">{view.transform.offsetX.toFixed(0)}px, {view.transform.offsetY.toFixed(0)}px</span>
                    </div>
                  </>
                )}

                {/* 🌟 新增：在面板底部展示 DIY 颜色配置 */}
                {/* 🌟 核心修复：移除对 view.settings 的严格判断，使用兜底逻辑，保证新老项目必定显示面板 */}
                {(() => {
                  // 智能兜底：如果没有 settings，就强制赋予 1, 1, 1 的默认视觉状态
                  const settings = view.settings || (view.bands.length === 1 
                    ? { minMax: [0, 100] } 
                    : { brightness: 1, contrast: 1, saturation: 1 });

                  return (
                    <>
                      <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-2"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500 shrink-0">Color Adjust:</span>
                        <div className="flex flex-wrap justify-end gap-1.5 text-[10px] font-mono">
                          {view.bands.length === 1 ? (
                            <span className="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 px-1.5 py-0.5 rounded">
                              Stretch: {settings.minMax?.[0] ?? 0}% - {settings.minMax?.[1] ?? 100}%
                            </span>
                          ) : (
                            <>
                              <span className="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 px-1.5 py-0.5 rounded shadow-sm">
                                B:{settings.brightness ?? 1}
                              </span>
                              <span className="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 px-1.5 py-0.5 rounded shadow-sm">
                                C:{settings.contrast ?? 1}
                              </span>
                              <span className="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 px-1.5 py-0.5 rounded shadow-sm">
                                S:{settings.saturation ?? 1}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}


              </div>
            </div>
            ))}
            {meta.views.length === 0 && <div className="text-center text-neutral-500 py-8">{t('projectMeta.views.noViews')}</div>}
          </div>
        </div>

      </div>
      
      {/* 底部操作区 */}
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 transition-colors">
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <Database className="w-3 h-3"/> {t('projectMeta.bottom.liveState')}
        </span>
        {/* 🌟 修改：把按钮包在一个 flex 容器里，并增加 Confirm 按钮 */}
        <div className="flex items-center gap-3">
          <Button onClick={handleExportJSON} variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            <Download className="w-4 h-4 mr-2" /> {t('projectMeta.bottom.downloadJson')}
          </Button>
          
          <Button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              // 🌟 3. 核心修复：如果父组件传了 onClose，就调用父组件的关闭逻辑；否则兜底使用全局切换
              if (onClose) {
                onClose();
              } else {
                setActiveModule('workspace');
              }
            }} 
            variant="default"
          >
            {t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}