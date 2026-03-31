import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';

import type { ProjectMetaContract } from '../../config/contract';
import { 
  Layers, FolderOpen, Check,  CheckCircle2,
  Eye, EyeOff, Maximize, Move, MousePointer2, Square, RotateCcw,Zap,
  Hand,  AlertCircle, Database, Trash2
} from 'lucide-react';
import { useTranslation } from 'react-i18next'; // 🌟 引入

export function ViewExtentCheck() {
  const { t } = useTranslation();
  // 合并为这一行：
  // const { projectName, views, folders, updateView, setActiveModule, savedAlignments, addSavedAlignment, removeSavedAlignment } = useStore();
  const { projectName, views, folders, updateView, setActiveModule, savedAlignments, addSavedAlignment, removeSavedAlignment, completedViews, setCompletedViews } = useStore();
// 🛡️ 兜底防线：如果没有绑定 View 或没有数据
  if (!views || views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 space-y-4">
        <AlertCircle className="w-12 h-12 text-yellow-500/80 mb-2" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{t('viewExtent.errors.missingConfig')}</h2>
        <p>{t('viewExtent.errors.missingDesc')}</p>
        <Button 
          onClick={() => setActiveModule('preload')} 
          variant="secondary" 
          className="mt-4"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          {t('viewExtent.errors.goPreload')}
        </Button>
      </div>
    );
  }

  const mainView = views.find(v => v.isMain);
  const augViews = views.filter(v => !v.isMain);

  // --- 状态管理 ---
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.5 });
  const [mode, setMode] = useState<'pan' | 'align'>('pan');
  const [alignSubMode, setAlignSubMode] = useState<'crop' | 'transform'>('transform');
  const [activeAugId, setActiveAugId] = useState<string>(augViews[0]?.id || '');
  const activeAugView = augViews.find(v => v.id === activeAugId) || augViews[0];
  // const [topBarConfig, setTopBarConfig] = useState({ opacity: 0.6, curtain: 100, isBlinking: false, showOutsideCrop: true });
  // 【修改1】：将透明度、水平卷帘、垂直卷帘整合为一个互斥模式
// 【修改1】：将 isBlinking 改为 showAugView，默认开启 (true)
  const [topBarConfig, setTopBarConfig] = useState({ 
    mode: 'opacity' as 'opacity' | 'swipeX' | 'swipeY', 
    value: 0.6, 
    showAugView: true, 
    showOutsideCrop: true 
  });
  // 操作A：裁剪范围状态
  const [crops, setCrops] = useState<Record<string, { t: number, r: number, b: number, l: number }>>({});
  const activeCrop = activeAugView ? (crops[activeAugView.id] || { t: 0, r: 100, b: 100, l: 0 }) : { t: 0, r: 100, b: 100, l: 0 };
  const [draggingEdge, setDraggingEdge] = useState<'t' | 'r' | 'b' | 'l' | null>(null);

  // 操作B：拉伸控制状态
  const [draggingTransformHandle, setDraggingTransformHandle] = useState<'t' | 'l' | 'r' | 'b' | 'br' | null>(null);
  

  // 用于强制刷新右侧参数显示面板的 Tick
  const [renderTick, setRenderTick] = useState(0);
  
  // --- 【高性能重构】专用 Refs ---
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const tempTransformRef = useRef({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainImgRef = useRef<HTMLImageElement>(null);
  const augImgRef = useRef<HTMLImageElement>(null);
  const augTransformContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeAugView) {
      tempTransformRef.current = { 
        offsetX: activeAugView.transform.offsetX, 
        offsetY: activeAugView.transform.offsetY,
        scaleX: activeAugView.transform.scaleX,
        // 兼容老数据，如果没有 scaleY，默认等于 scaleX
        scaleY: activeAugView.transform.scaleY || activeAugView.transform.scaleX
      };
    }
  }, [activeAugId]);


  const getPreviewUrl = (view: typeof mainView) => {
    if (!view) return '';
    const folder = folders.find(f => f.id === view.folderId);
    if (!folder) return '';
    return `http://localhost:8080/api/project/preview?folderPath=${encodeURIComponent(folder.path)}&bands=${view.bands.join(',')}`;
  };

  const updateAugDOMTransform = () => {
    if (!augTransformContainerRef.current) return;
    const { offsetX, offsetY, scaleX, scaleY } = tempTransformRef.current;
    augTransformContainerRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scaleX}, ${scaleY})`;
  };
// 【新增】解决跳变的核心：在点击手柄的瞬间，强制同步最新的鼠标物理坐标
  const startEdgeDrag = (e: React.PointerEvent, edge: 't' | 'r' | 'b' | 'l') => {
    e.stopPropagation();
    setDraggingEdge(edge);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };
// 确保这里的参数类型包含了 't' 和 'l'
  const startTransformDrag = (e: React.PointerEvent, handle: 't' | 'l' | 'r' | 'b' | 'br') => {
    e.stopPropagation();
    setDraggingTransformHandle(handle);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    
    if (activeAugView) {
        tempTransformRef.current.scaleX = activeAugView.transform.scaleX || 1;
        tempTransformRef.current.scaleY = activeAugView.transform.scaleY || activeAugView.transform.scaleX || 1;
    }
  };
  const handlePointerDown = (e: React.PointerEvent) => {
    if (draggingEdge || draggingTransformHandle) return; 
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    
    if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
        tempTransformRef.current = { 
            offsetX: activeAugView.transform.offsetX, 
            offsetY: activeAugView.transform.offsetY,
            scaleX: activeAugView.transform.scaleX,
            scaleY: activeAugView.transform.scaleY || activeAugView.transform.scaleX
        };
    }

    if (canvasRef.current) {
        canvasRef.current.setPointerCapture(e.pointerId);
        canvasRef.current.style.userSelect = 'none'; 
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    
    // 【操作B：边框拉伸】
// 【操作B：边框拉伸】
// 【操作B：全方位拉伸与吸附】
    if (draggingTransformHandle && mode === 'align' && alignSubMode === 'transform' && augImgRef.current && mainImgRef.current) {
        const mainRect = mainImgRef.current.getBoundingClientRect();
        const augRect = augImgRef.current.getBoundingClientRect();
        const snapThreshold = 6; // 吸附阈值

        // 基础增量（需除以视口缩放以保持像素同步）
        const deltaX = dx / viewport.scale;
        const deltaY = dy / viewport.scale;

        // 获取当前物理尺寸
        const currentWidth = augRect.width / viewport.scale;
        const currentHeight = augRect.height / viewport.scale;

        // --- 核心逻辑：根据不同手柄执行 Scale 变化与 Offset 补偿 ---
        
        // 1. 右边缘 (ScaleX)
        if (draggingTransformHandle === 'r' || draggingTransformHandle === 'br') {
            const newScaleX = tempTransformRef.current.scaleX * (1 + deltaX / currentWidth);
            // 简单吸附：如果右边缘靠近 Main 右边缘
            if (Math.abs(augRect.right - mainRect.right) < snapThreshold) {
                const snappedWidth = (mainRect.right - augRect.left) / viewport.scale;
                tempTransformRef.current.scaleX = snappedWidth / (augRect.width / viewport.scale / tempTransformRef.current.scaleX);
            } else {
                tempTransformRef.current.scaleX = Math.max(0.01, newScaleX);
            }
        }

        // 2. 底边缘 (ScaleY)
        if (draggingTransformHandle === 'b' || draggingTransformHandle === 'br') {
            const newScaleY = tempTransformRef.current.scaleY * (1 + deltaY / currentHeight);
            if (Math.abs(augRect.bottom - mainRect.bottom) < snapThreshold) {
                const snappedHeight = (mainRect.bottom - augRect.top) / viewport.scale;
                tempTransformRef.current.scaleY = snappedHeight / (augRect.height / viewport.scale / tempTransformRef.current.scaleY);
            } else {
                tempTransformRef.current.scaleY = Math.max(0.01, newScaleY);
            }
        }

        // 3. 左边缘 (ScaleX + OffsetX 补偿)
        if (draggingTransformHandle === 'l') {
            // 往左拉 dx 是负的，宽度增加
            const newScaleX = tempTransformRef.current.scaleX * (1 - deltaX / currentWidth);
            if (Math.abs(augRect.left - mainRect.left) < snapThreshold) {
                const snappedWidth = (augRect.right - mainRect.left) / viewport.scale;
                const oldScaleX = tempTransformRef.current.scaleX;
                tempTransformRef.current.scaleX = snappedWidth / (augRect.width / viewport.scale / oldScaleX);
                tempTransformRef.current.offsetX -= (mainRect.left - augRect.left) / viewport.scale;
            } else {
                tempTransformRef.current.scaleX = Math.max(0.01, newScaleX);
                tempTransformRef.current.offsetX += deltaX;
            }
        }

        // 4. 顶边缘 (ScaleY + OffsetY 补偿)
        if (draggingTransformHandle === 't') {
            const newScaleY = tempTransformRef.current.scaleY * (1 - deltaY / currentHeight);
            if (Math.abs(augRect.top - mainRect.top) < snapThreshold) {
                const snappedHeight = (augRect.bottom - mainRect.top) / viewport.scale;
                const oldScaleY = tempTransformRef.current.scaleY;
                tempTransformRef.current.scaleY = snappedHeight / (augRect.height / viewport.scale / oldScaleY);
                tempTransformRef.current.offsetY -= (mainRect.top - augRect.top) / viewport.scale;
            } else {
                tempTransformRef.current.scaleY = Math.max(0.01, newScaleY);
                tempTransformRef.current.offsetY += deltaY;
            }
        }

        requestAnimationFrame(updateAugDOMTransform);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // 【操作A：裁剪高亮范围与吸附】
// 【操作A：裁剪高亮范围与吸附】
    if (draggingEdge && augImgRef.current && mainImgRef.current) {
      const rect = augImgRef.current.getBoundingClientRect();
      // 增加防御性检查，防止除以 0
      if (rect.width === 0 || rect.height === 0) return;

      const dxPct = (dx / rect.width) * 100;
      const dyPct = (dy / rect.height) * 100;
      
      let newCrop = { ...activeCrop };
      
      // 优化：将边界限制稍微放宽（允许 0 到 100.1），防止因浮点数误差导致无法拖动到底边
      if (draggingEdge === 't') newCrop.t = Math.max(0, Math.min(newCrop.b - 0.5, newCrop.t + dyPct));
      if (draggingEdge === 'b') newCrop.b = Math.min(100, Math.max(newCrop.t + 0.5, newCrop.b + dyPct));
      if (draggingEdge === 'l') newCrop.l = Math.max(0, Math.min(newCrop.r - 0.5, newCrop.l + dxPct));
      if (draggingEdge === 'r') newCrop.r = Math.min(100, Math.max(newCrop.l + 0.5, newCrop.r + dxPct));

      // --- 重新设计的吸附逻辑 ---
      const mainRect = mainImgRef.current.getBoundingClientRect();
      const snapThresholdPx = 8; // 稍微调大一点点提高易用性
      
      // 计算当前裁剪边在屏幕上的真实物理坐标
      const currentPhysicalT = rect.top + (newCrop.t / 100) * rect.height;
      const currentPhysicalB = rect.top + (newCrop.b / 100) * rect.height;
      const currentPhysicalL = rect.left + (newCrop.l / 100) * rect.width;
      const currentPhysicalR = rect.left + (newCrop.r / 100) * rect.width;

      // 吸附：当物理坐标靠近 Main View 边界时，强制对齐
      // 解决“吸附后难移动”：只有当鼠标移动带来的位置改变超过阈值时才强制跳出
      if (draggingEdge === 't' && Math.abs(currentPhysicalT - mainRect.top) < snapThresholdPx) 
        newCrop.t = ((mainRect.top - rect.top) / rect.height) * 100;
      
      if (draggingEdge === 'b' && Math.abs(currentPhysicalB - mainRect.bottom) < snapThresholdPx) 
        newCrop.b = ((mainRect.bottom - rect.top) / rect.height) * 100;
      
      if (draggingEdge === 'l' && Math.abs(currentPhysicalL - mainRect.left) < snapThresholdPx) 
        newCrop.l = ((mainRect.left - rect.left) / rect.width) * 100;
      
      if (draggingEdge === 'r' && Math.abs(currentPhysicalR - mainRect.right) < snapThresholdPx) 
        newCrop.r = ((mainRect.right - rect.left) / rect.width) * 100;

      // 最后的安全检查，确保百分比不越界
      newCrop.t = Math.max(0, newCrop.t);
      newCrop.b = Math.min(100, newCrop.b);
      newCrop.l = Math.max(0, newCrop.l);
      newCrop.r = Math.min(100, newCrop.r);

      setCrops({ ...crops, [activeAugView.id]: newCrop });
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDraggingRef.current) return;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    if (mode === 'pan') {
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
      // 【操作B：平移】
      tempTransformRef.current.offsetX += (dx / viewport.scale);
      tempTransformRef.current.offsetY += (dy / viewport.scale);
      requestAnimationFrame(updateAugDOMTransform);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // 操作B结束：保存缩放或平移状态到 Store
    if ((draggingTransformHandle || isDraggingRef.current) && mode === 'align' && alignSubMode === 'transform' && activeAugView) {
        updateView(activeAugView.id, { 
            transform: { 
                ...activeAugView.transform, 
                offsetX: tempTransformRef.current.offsetX,
                offsetY: tempTransformRef.current.offsetY,
                scaleX: tempTransformRef.current.scaleX,
                scaleY: tempTransformRef.current.scaleY,
            } 
        });
    }

    isDraggingRef.current = false;
    setDraggingEdge(null);
    setDraggingTransformHandle(null);
    
    if (canvasRef.current) {
        canvasRef.current.releasePointerCapture(e.pointerId);
        canvasRef.current.style.userSelect = 'auto';
    }

    // 【新增】：强制刷新右侧参数面板
    setRenderTick(p => p + 1);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08; 

    if (mode === 'pan') {
      setViewport(prev => ({ ...prev, scale: Math.max(0.01, Math.min(20, prev.scale * zoomFactor)) }));
    } else if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
      // 【修复滚轮跳动 Bug】：正确使用 scaleX 和 scaleY 同步更新
      const newScaleX = Math.max(0.001, activeAugView.transform.scaleX * zoomFactor);
      const newScaleY = Math.max(0.001, (activeAugView.transform.scaleY || activeAugView.transform.scaleX) * zoomFactor);
      
      tempTransformRef.current.scaleX = newScaleX;
      tempTransformRef.current.scaleY = newScaleY;
      
      requestAnimationFrame(updateAugDOMTransform);
      updateView(activeAugView.id, { transform: { ...activeAugView.transform, scaleX: newScaleX, scaleY: newScaleY } });
    }
  };// --- 新增：自动化与重置逻辑 ---

  // 功能 1 & 2: 操作 B 下的一键对齐与重置
  const handleAutoSnapCrop = () => {
    if (!mainImgRef.current || !augImgRef.current) return;
    const mainRect = mainImgRef.current.getBoundingClientRect();
    const augRect = augImgRef.current.getBoundingClientRect();
    
    // 计算将 Aug View 高亮框对齐到 Main View 的百分比坐标
    const newCrop = {
      t: Math.max(0, Math.min(100, ((mainRect.top - augRect.top) / augRect.height) * 100)),
      b: Math.max(0, Math.min(100, ((mainRect.bottom - augRect.top) / augRect.height) * 100)),
      l: Math.max(0, Math.min(100, ((mainRect.left - augRect.left) / augRect.width) * 100)),
      r: Math.max(0, Math.min(100, ((mainRect.right - augRect.left) / augRect.width) * 100)),
    };
    setCrops({ ...crops, [activeAugView.id]: newCrop });
  };


// --- 功能 1: 自动拉伸 Aug View 的高亮框以适配 Main View ---
// --- 功能 1: 自动拉伸 Aug View 的高亮框以完美贴合 Main View ---
  const handleFitToMain = () => {
    if (!mainImgRef.current || !augImgRef.current || !activeAugView) return;

    // 1. 获取 Main View 在父容器中的本地尺寸和坐标 (不受 viewport.scale 干扰)
    const targetW = mainImgRef.current.offsetWidth;
    const targetH = mainImgRef.current.offsetHeight;
    const targetX = mainImgRef.current.offsetLeft;
    const targetY = mainImgRef.current.offsetTop;

    // 2. 获取 Aug View 在应用 Transform 前的本地基础尺寸
    // 注意：CSS Transform 是基于 offsetWidth/offsetHeight 进行缩放的，绝对不能用 naturalWidth！
    const baseAugW = augImgRef.current.offsetWidth;
    const baseAugH = augImgRef.current.offsetHeight;

    // 3. 计算当前高亮框 (Crop) 在 Aug View 基础尺寸上的本地像素坐标和大小
    const cropLocalX = baseAugW * (activeCrop.l / 100);
    const cropLocalY = baseAugH * (activeCrop.t / 100);
    const cropLocalW = baseAugW * ((activeCrop.r - activeCrop.l) / 100);
    const cropLocalH = baseAugH * ((activeCrop.b - activeCrop.t) / 100);

    if (cropLocalW === 0 || cropLocalH === 0) return;

    // 4. 计算缩放比例：将 Crop 区域完美放大到 Main View 的大小
    const nextScaleX = targetW / cropLocalW;
    const nextScaleY = targetH / cropLocalH;

    // 5. 计算偏移量 (Offset)
    // 根据 CSS Transform 原理：先以 top left (0,0) 为原点缩放，再平移。
    // 我们希望 Crop 的左上角 (cropLocalX, cropLocalY) 最终落在 Main View 的左上角 (targetX, targetY)
    // 公式: targetX = (cropLocalX * nextScaleX) + nextOffsetX
    const nextOffsetX = targetX - (cropLocalX * nextScaleX);
    const nextOffsetY = targetY - (cropLocalY * nextScaleY);

    // 6. 同步更新状态
    tempTransformRef.current = {
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
      scaleX: nextScaleX,
      scaleY: nextScaleY
    };
    
    updateAugDOMTransform();
    updateView(activeAugView.id, { 
      transform: { 
        offsetX: nextOffsetX, 
        offsetY: nextOffsetY, 
        scaleX: nextScaleX, 
        scaleY: nextScaleY 
      } 
    });
  };

  // --- 功能 2 & 3: 重置逻辑 ---
  const handleResetTransform = () => {
    tempTransformRef.current = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } });
  };

  const handleResetCrop = () => {
    setCrops({ ...crops, [activeAugView.id]: { t: 0, r: 100, b: 100, l: 0 } });
  };
// --- 预设、手动控制与验证逻辑 ---

  // 应用某个对齐参数到当前视图
  const applyAlignmentPreset = (crop: any, transform: any) => {
    if (!activeAugView) return;
    setCrops({ ...crops, [activeAugView.id]: crop });
    tempTransformRef.current = { ...transform };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform });
    setRenderTick(p => p + 1);
  };

  // 【新增】：手动输入与滑块联动逻辑
  const handleManualCropChange = (key: 't'|'r'|'b'|'l', val: number) => {
    if (!activeAugView) return;
    let newCrop = { ...activeCrop };
    if (key === 't') newCrop.t = Math.max(0, Math.min(newCrop.b - 0.1, val));
    if (key === 'b') newCrop.b = Math.min(100, Math.max(newCrop.t + 0.1, val));
    if (key === 'l') newCrop.l = Math.max(0, Math.min(newCrop.r - 0.1, val));
    if (key === 'r') newCrop.r = Math.min(100, Math.max(newCrop.l + 0.1, val));
    setCrops({ ...crops, [activeAugView.id]: newCrop });
  };

  const handleManualTransformChange = (key: 'scaleX'|'scaleY'|'offsetX'|'offsetY', val: number) => {
    if (!activeAugView) return;
    tempTransformRef.current = { ...tempTransformRef.current, [key]: val };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform: { ...tempTransformRef.current } });
    setRenderTick(p => p + 1);
  };

  // 检查并保存当前 View 的对齐状态
  const handleSaveCurrentView = () => {
    if (!mainImgRef.current || !augImgRef.current || !activeAugView) return;
    
    const mainRect = mainImgRef.current.getBoundingClientRect();
    const augRect = augImgRef.current.getBoundingClientRect();
    
    const cropPhysical = {
      top: augRect.top + (activeCrop.t / 100) * augRect.height,
      bottom: augRect.top + (activeCrop.b / 100) * augRect.height,
      left: augRect.left + (activeCrop.l / 100) * augRect.width,
      right: augRect.left + (activeCrop.r / 100) * augRect.width,
    };

    const isAligned = 
      Math.abs(cropPhysical.top - mainRect.top) < 2 &&
      Math.abs(cropPhysical.bottom - mainRect.bottom) < 2 &&
      Math.abs(cropPhysical.left - mainRect.left) < 2 &&
      Math.abs(cropPhysical.right - mainRect.right) < 2;

    const markAsCompleteAndSave = () => {
      // 1. 打绿勾
      if (!completedViews.includes(activeAugView.id)) {
        setCompletedViews([...completedViews, activeAugView.id]);
      }
      
      // 2. 生成带时间戳的名字
      const now = new Date();
      const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
      const presetName = `Auto Saved ${timeString}`;
      
      // 3. 保存到下面的蓝色快照
      addSavedAlignment({
        id: Math.random().toString(), 
        name: presetName, 
        crop: { ...activeCrop }, 
        transform: { ...tempTransformRef.current }
      });

      // 🌟 4. 核心修复：把现在的裁剪和拉伸状态，直接覆盖更新到图层本身的数据里！
      // 这样无论你怎么刷新，黄色的 Meta 卡片都会读取到真实的、被保存过的参数，再也不会消失了！
      updateView(activeAugView.id, { 
        transform: { 
          ...tempTransformRef.current,
          crop: { ...activeCrop } 
        } as any // 使用 as any 绕过可选类型的强校验
      });
    };

    if (isAligned) {
      markAsCompleteAndSave();
    } else {
      const autoAlign = window.confirm(t('viewExtent.alerts.notAligned'));
      if (autoAlign) {
        handleFitToMain(); 
        requestAnimationFrame(() => {
          markAsCompleteAndSave();
          setRenderTick(p => p + 1);
        });
      }
    }
  };

// 【完全按照您的 JSON 结构要求重写】：在标注主界面实时提取规范化的项目元数据
// 严格按照要求的 JSON 结构提取，并解决 TS 类型报错
  const generateProjectMeta = (): ProjectMetaContract => {
    return {
      projectName: projectName,
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
        
        // 【核心修复】：强制解构并补充默认的 crop 属性，彻底消除 TS 联合类型报错
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
          renderMode:v.bands.length === 3 ? 'rgb' : (v.colormap || 'gray'),
          isMain: v.isMain,
          transform: safeTransform
        };
      })
    };
  };
  // 【修改】：使用标准元数据并保存为 project_meta.json
  const proceedToExport = async () => {
    if (completedViews.length < augViews.length) {
      alert(t('viewExtent.alerts.saveAllFirst'));
      return;
    }

    // 调用规范化元数据生成器
    const projectMeta = generateProjectMeta();
    const jsonStr = JSON.stringify(projectMeta, null, 2);

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'project_meta.json',
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
      } else {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project_meta.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    // 🌟 新增：阻塞式的成功交互反馈
      alert(t('viewExtent.alerts.exportSuccess'));

      if (activeAugView) {
        // 顺手优化了一下分钟的显示，保证个位数分钟前面补 0 (如 10:05)
        const minutes = new Date().getMinutes().toString().padStart(2, '0');
        addSavedAlignment({
          id: Math.random().toString(36).substr(2, 9),
          name: `Auto Saved ${new Date().getHours()}:${minutes}`,
          crop: { ...activeCrop }, 
          transform: { ...tempTransformRef.current } 
        });
      }
      setActiveModule('workspace'); 
    } catch (err) {
      console.warn("Save cancelled or failed", err);
      if (window.confirm(t('viewExtent.alerts.saveCancelled'))) {
         setActiveModule('workspace');
      }
    }
  };

  if (views.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400">
        <Layers className="w-12 h-12 text-blue-500" />
        <h3 className="text-xl text-neutral-100 font-bold">{t('viewExtent.skipped.title')}</h3>
        <p>{t('viewExtent.skipped.skippedDesc')}</p>
        <div className="flex items-center gap-4 mt-4">
          <Button variant="outline" className="border-neutral-700 hover:bg-neutral-800" onClick={() => setActiveModule('preload')}>
            <FolderOpen className="w-4 h-4 mr-2" /> {t('viewExtent.skipped.back')}
          </Button>
          
          {/* 🌟 核心：直接绑定 proceedToExport，让它复用完整的导出逻辑 */}
          <Button className="bg-blue-600 hover:bg-blue-700 text-neutral-900 dark:text-neutral-100 font-bold" onClick={proceedToExport}>
            {t('viewExtent.skipped.exportAndStart')} <Check className="w-4 h-4 ml-2"/>
          </Button>
        </div>
      </div>
    );
  }
// 【修改2】：在 return 之前，计算当前互斥模式下的最终参数
  const isOpacityMode = topBarConfig.mode === 'opacity';
  const isSwipeXMode = topBarConfig.mode === 'swipeX';
  const isSwipeYMode = topBarConfig.mode === 'swipeY';

  // 透明度模式下读取滑块值，否则恢复 100% (1)
  const currentOpacity = isOpacityMode ? topBarConfig.value : 1;
  
  // 卷帘模式下，动态限制裁剪显示的右边界和下边界
  let displayR = activeCrop.r;
  let displayB = activeCrop.b;
  if (isSwipeXMode) displayR = Math.max(activeCrop.l, Math.min(activeCrop.r, topBarConfig.value));
  if (isSwipeYMode) displayB = Math.max(activeCrop.t, Math.min(activeCrop.b, topBarConfig.value));

  // 合成最终内部高亮图像的 clipPath
// 合成最终内部高亮图像的 clipPath
  const innerClipPath = `polygon(${activeCrop.l}% ${activeCrop.t}%, ${displayR}% ${activeCrop.t}%, ${displayR}% ${displayB}%, ${activeCrop.l}% ${displayB}%)`;

  // --- 【新增】：卷帘互斥拦截器 ---
  // 当处于卷帘模式时，点击其他任何功能按钮，都会自动退出卷帘并恢复透明度为 100%
  const withSwipeCancel = (action: () => void) => {
    if (topBarConfig.mode !== 'opacity') {
      setTopBarConfig(p => ({ ...p, mode: 'opacity', value: 1 }));
    }
    action();
  };

  // 专门用于处理布尔值开关的拦截器 (Mask 和 显隐开关)
  const toggleConfigWithSwipeCancel = (key: 'showOutsideCrop' | 'showAugView') => {
    setTopBarConfig(p => {
      const next = { ...p, [key]: !p[key] };
      if (next.mode !== 'opacity') {
        next.mode = 'opacity';
        next.value = 1;
      }
      return next;
    });
  };


  return (
    // {/* 🌟 适配全局日夜主题 */}
    <div className="flex flex-col h-full w-full bg-neutral-50 dark:bg-neutral-950 font-sans text-neutral-900 dark:text-neutral-200 select-none transition-colors duration-300">
      {/* 顶部视觉控制台 (清爽布局) */}
{/* 顶部视觉控制台 (固定布局重构版) */}
      <div className="h-14 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-6 shrink-0 z-50 relative overflow-x-auto">
        
        {/* 左侧 & 中间：模式切换与固定操作区 */}
        <div className="flex items-center gap-3">
          {/* 【新增】：全局 Project Meta 查看器 */}

          {/* 主模式切换：红绿阵营 */}
          <div className="flex items-center gap-1 bg-neutral-50 dark:bg-neutral-950 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 shrink-0">
            <Button 
              variant={mode === 'pan' ? 'default' : 'ghost'} 
              size="sm" 
              // 🌟 Pan: 激活时显示红色底色 (bg-red-500)
              className={`h-7 px-3 ${mode === 'pan' ? "bg-red-500 hover:bg-red-600 text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:text-neutral-100"}`} 
              onClick={() => withSwipeCancel(() => setMode('pan'))}
            >
              <Hand className="w-3.5 h-3.5 mr-1.5"/> {t('viewExtent.topBar.pan')}
            </Button>
            <Button 
              variant={mode === 'align' ? 'default' : 'ghost'} 
              size="sm" 
              // 🌟 Align: 激活时显示绿色底色 (bg-green-600)
              className={`h-7 px-3 ${mode === 'align' ? "bg-green-600 hover:bg-green-700 text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:text-neutral-100"}`} 
              onClick={() => withSwipeCancel(() => setMode('align'))}
            >
              <Move className="w-3.5 h-3.5 mr-1.5"/> {t('viewExtent.topBar.align')}
            </Button>
          </div>

          {/* 对齐子模式切换 & 操作面板 */}
          {mode === 'align' && (
            <div className="flex items-center gap-2 ml-2 shrink-0 animate-in fade-in slide-in-from-left-4">
               
              <div className="flex items-center bg-neutral-50 dark:bg-neutral-950 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
                 <Button 
                   variant={alignSubMode === 'crop' ? 'default' : 'ghost'} size="sm" 
                   // 🌟 Crop: 激活时显示橙色底色 (bg-amber-500)
                   className={`h-7 px-3 rounded-md ${alignSubMode === 'crop' ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:text-neutral-100"}`}
                   onClick={() => withSwipeCancel(() => setAlignSubMode('crop'))}
                 >
                   <Square className="w-3.5 h-3.5 mr-1.5"/> {t('viewExtent.topBar.crop')}
                 </Button>
                 <Button 
                   variant={alignSubMode === 'transform' ? 'default' : 'ghost'} size="sm" 
                   // 🌟 Move/Zoom: 激活时显示蓝色底色 (bg-blue-600)
                   className={`h-7 px-3 rounded-md ${alignSubMode === 'transform' ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:text-neutral-100"}`}
                   onClick={() => withSwipeCancel(() => setAlignSubMode('transform'))}
                 >
                   <Maximize className="w-3.5 h-3.5 mr-1.5"/> {t('viewExtent.topBar.moveZoom')}
                 </Button>
               </div>

               <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 p-1 rounded-lg border border-neutral-700">
                 
                {/* Crop 的专属操作：统一橙色系 (Amber) */}
                 <div className="flex items-center gap-0.5 border-r border-neutral-700 pr-1 mr-0.5">
                   <Button 
                     variant="ghost" 
                     size="sm" 
                     // 🌟 核心修复：只有在 crop 模式下才是橙色；其他模式下变灰并降低透明度
                     className={`h-7 px-2 transition-opacity ${
                       alignSubMode === 'crop' 
                         ? 'text-amber-600 dark:text-amber-500 hover:bg-amber-500/10' 
                         : 'text-neutral-500 dark:text-neutral-400 opacity-30 cursor-not-allowed'
                     }`} 
                     disabled={alignSubMode !== 'crop'}
                     onClick={() => toggleConfigWithSwipeCancel('showOutsideCrop')}
                     title={t('viewExtent.topBar.toggleMask')}
                   >
                     {topBarConfig.showOutsideCrop ? (
                       <Eye className="w-3.5 h-3.5 mr-1" />
                     ) : (
                       <EyeOff className="w-3.5 h-3.5 mr-1 opacity-50" /> 
                     )}
                     {t('viewExtent.topBar.mask')}
                   </Button>
                   <Button 
                     variant="ghost" size="icon" 
                     // 🌟 Reset Crop: 悬停时变为橙色
                     className={`h-7 w-7 transition-opacity ${alignSubMode !== 'crop' ? 'opacity-30 cursor-not-allowed' : 'text-neutral-500 dark:text-neutral-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-amber-500/10'}`} 
                     disabled={alignSubMode !== 'crop'}
                     onClick={() => withSwipeCancel(handleResetCrop)} title={t('viewExtent.topBar.resetCrop')}
                   >
                     <RotateCcw className="w-3.5 h-3.5"/>
                   </Button>
                 </div>

                 {/* Move/Zoom 的专属操作：统一蓝色系 (Blue) */}
                 <div className="flex items-center gap-0.5">
                   <Button 
                     variant="ghost" size="sm" 
                     // 🌟 Fit to Main: 蓝色字，悬停蓝色底
                     className={`h-7 px-2 transition-opacity ${alignSubMode !== 'transform' ? 'opacity-30 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'}`} 
                     disabled={alignSubMode !== 'transform'}
                     onClick={() => withSwipeCancel(handleFitToMain)}
                     title={t('viewExtent.topBar.fitMainTitle')}
                   >
                     <Zap className="w-3.5 h-3.5 mr-1"/> {t('viewExtent.topBar.fitMain')}
                   </Button>
                   <Button 
                     variant="ghost" size="icon" 
                     // 🌟 Reset Transform: 蓝色字，悬停蓝色底
                     className={`h-7 w-7 transition-opacity ${alignSubMode !== 'transform' ? 'opacity-30 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'}`} 
                     disabled={alignSubMode !== 'transform'}
                     onClick={() => withSwipeCancel(handleResetTransform)} title={t('viewExtent.topBar.resetTransform')}
                   >
                     <RotateCcw className="w-3.5 h-3.5"/>
                   </Button>
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* 右侧：视觉滑块控制面板 */}
        <div className="flex items-center gap-3 shrink-0 pl-4">
          <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-950 p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
            {/* 滑块部分无需包拦截器 */}
            <Select 
              value={topBarConfig.mode} 
              onValueChange={(val: any) => setTopBarConfig(p => ({
                  ...p, mode: val, value: val === 'opacity' ? 0.6 : 100 
              }))}
            >
              <SelectTrigger className="h-7 w-[95px] text-xs bg-transparent border-none focus:ring-0 text-neutral-300">
                <SelectValue>
                  {topBarConfig.mode === 'opacity' && t('viewExtent.topBar.opacity')}
                  {topBarConfig.mode === 'swipeX' && t('viewExtent.topBar.hSwipe')}
                  {topBarConfig.mode === 'swipeY' && t('viewExtent.topBar.vSwipe')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opacity" className="text-xs">{t('viewExtent.topBar.opacity')}</SelectItem>
                <SelectItem value="swipeX" className="text-xs">{t('viewExtent.topBar.hSwipe')}</SelectItem>
                <SelectItem value="swipeY" className="text-xs">{t('viewExtent.topBar.vSwipe')}</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="w-[120px] px-2 flex items-center shrink-0">
              <Slider 
                key={topBarConfig.mode} 
                min={0}
                max={topBarConfig.mode === 'opacity' ? 1 : 100} 
                step={topBarConfig.mode === 'opacity' ? 0.01 : 1} 
                value={[topBarConfig.value]} 
                onValueChange={(val) => {
                  const v = Array.isArray(val) ? val[0] : (val as number);
                  setTopBarConfig(p => ({...p, value: v}));
                }}
                className="w-full cursor-pointer relative"
              />
            </div>
            
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 w-9 text-right font-mono select-none pr-1 shrink-0">
              {topBarConfig.mode === 'opacity' ? `${Math.round(topBarConfig.value * 100)}%` : `${topBarConfig.value}%`}
            </span>
          </div>

          <Button 
            variant={!topBarConfig.showAugView ? "default" : "outline"} 
            size="icon" 
            className="h-7 w-7 border-neutral-700 shrink-0" 
            onClick={() => toggleConfigWithSwipeCancel('showAugView')}
            title={topBarConfig.showAugView ? t('viewExtent.topBar.hideAug') : t('viewExtent.topBar.showAug')}
          >
            {topBarConfig.showAugView ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5 text-blue-400"/>}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧主体：对齐工作区 */}
        {/* 🌟 背景从 bg-black 改为支持日夜间的 bg-neutral-200 dark:bg-black */}
        <div 
          ref={canvasRef}
          // 🌟 把 bg-black 改成了 bg-neutral-100 dark:bg-neutral-900
          className={`flex-1 relative overflow-hidden bg-neutral-100 dark:bg-neutral-900 transition-colors duration-300 flex items-center justify-center ${mode === 'pan' ? 'cursor-grab active:cursor-grabbing' : (alignSubMode === 'crop' ? 'cursor-default' : 'cursor-move')}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }} 
        >
          <div style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`, transformOrigin: 'center center' }} className="relative">
            
            {/* 🌟 核心修复：日间模式阴影透明度降为 0.15，夜间模式保持 0.7 */}
            <div className={`relative transition-all duration-300 ${mode === 'pan' ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.15)] dark:shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] border-2 border-dashed border-red-500 z-10' : 'z-0'}`}>

              {mode === 'pan' && <span className="absolute -top-6 left-0 text-[10px] text-red-500 font-mono bg-black/50 px-1">{t('viewExtent.canvas.mainBorder')}</span>}
              
              <img ref={mainImgRef} src={getPreviewUrl(mainView!)} alt={t('viewExtent.canvas.mainViewBase')} className="pointer-events-none block max-w-none" />

              {activeAugView && (
                <div className={`absolute top-0 left-0 w-full h-full ${mode === 'align' ? 'z-30' : 'z-20 pointer-events-none'}`}>
                  
                  <div 
                    ref={augTransformContainerRef}
                    className="absolute top-0 left-0 max-w-none transition-transform will-change-transform"
                    style={{
                      transformOrigin: 'top left',
                      transform: `translate3d(${activeAugView.transform.offsetX}px, ${activeAugView.transform.offsetY}px, 0) scale(${activeAugView.transform.scaleX}, ${activeAugView.transform.scaleY || activeAugView.transform.scaleX})`,
                    }}
                  >
                     {/* 内部高亮图像 */}
                     {/* 【修改4】：应用计算好的透明度和裁剪路径 */}
                     {/* 内部高亮图像 */}
{/* 【修改3】：移除脉冲动画，使用 showAugView 控制最终透明度 */}
                     {/* 内部高亮图像 */}
                     <img 
                        ref={augImgRef} 
                        src={getPreviewUrl(activeAugView)} 
                        alt="Aug View Inside" 
                        // 去掉了 animate-pulse，增加了透明度过渡动画
                        className="block max-w-none pointer-events-none mix-blend-screen transition-opacity duration-150" 
                        style={{ 
                            // 核心：如果开关关闭，透明度直接设为 0
                            opacity: topBarConfig.showAugView ? currentOpacity : 0,
                            clipPath: innerClipPath
                        }} 
                    />
                     
                     {/* 操作A：裁剪 UI (Crop UI) */}
                     {mode === 'align' && alignSubMode === 'crop' && (
                       <div className="absolute inset-0">
                         {/* 外部低透明度图像：同样受 showAugView 总开关控制 */}
                         <img 
                            src={getPreviewUrl(activeAugView)} 
                            alt="Aug View Outside" 
                            className="absolute top-0 left-0 max-w-none pointer-events-none mix-blend-screen transition-opacity duration-200" 
                            style={{ 
                                // 核心：增加 topBarConfig.showAugView 判断
                                opacity: (topBarConfig.showAugView && topBarConfig.showOutsideCrop && isOpacityMode) ? (currentOpacity * 0.4) : 0, 
                                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${activeCrop.l}% ${activeCrop.t}%, ${activeCrop.l}% ${activeCrop.b}%, ${activeCrop.r}% ${activeCrop.b}%, ${activeCrop.r}% ${activeCrop.t}%, ${activeCrop.l}% ${activeCrop.t}%)`
                            }} 
                        />
                         
                         <div className="absolute border border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                              style={{ top: `${activeCrop.t}%`, bottom: `${100-activeCrop.b}%`, left: `${activeCrop.l}%`, right: `${100-activeCrop.r}%` }}>
                            
                            {/* 操作A：4条边框拖拽控制手柄 */}
                            <div className="absolute top-0 left-0 w-full h-4 -translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 't')} />
                            <div className="absolute bottom-0 left-0 w-full h-4 translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'b')} />
                            <div className="absolute top-0 left-0 w-4 h-full -translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'l')} />
                            <div className="absolute top-0 right-0 w-4 h-full translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'r')} />

                            <span className="absolute -top-6 left-0 text-[10px] text-amber-400 font-bold bg-black/80 px-1.5 py-0.5 border border-amber-500 whitespace-nowrap">
                              {t('viewExtent.canvas.augRange')}
                            </span>
                         </div>
                       </div>
                     )}

                     {/* 操作B：高亮范围虚线框 (赋予拉伸能力) */}
                    {/* 操作B：高亮范围虚线框 (全方位拉伸) */}
                     {mode === 'align' && alignSubMode === 'transform' && (
                        <div className="absolute border-2 border-primary pointer-events-none dashed-border"
                             style={{ top: `${activeCrop.t}%`, bottom: `${100-activeCrop.b}%`, left: `${activeCrop.l}%`, right: `${100-activeCrop.r}%` }}>
                            
                            {/* 八向拉伸控制手柄 */}
                            {/* 顶边 */}
                            <div className="absolute top-0 left-0 w-full h-4 -translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 't')} />
                            {/* 底边 */}
                            <div className="absolute bottom-0 left-0 w-full h-4 translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'b')} />
                            {/* 左边 */}
                            <div className="absolute top-0 left-0 w-4 h-full -translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'l')} />
                            {/* 右边 */}
                            <div className="absolute top-0 right-0 w-4 h-full translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'r')} />
                            
                            {/* 右下角缩放点 */}
                            <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform" 
                                 onPointerDown={(e) => startTransformDrag(e, 'br')} />

                          <span className="absolute -top-6 left-0 text-[10px] text-blue-400 font-bold bg-black/80 px-1.5 py-0.5 border border-primary whitespace-nowrap">
                            {t('viewExtent.canvas.augContent')}
                          </span>
                        </div>
                     )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧面板 (极致紧凑的专业工作流布局) */}
        <div className="w-[340px] bg-white dark:bg-neutral-900 flex flex-col shrink-0 border-l border-neutral-200 dark:border-neutral-800">
          
          {/* 1. 已存在的对齐参数库 (Presets) - 【修改】：高度从 140px 增加到 190px (分配更多空间) */}


          <div className="p-3 border-b border-border flex flex-col h-[140px] shrink-0">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{t('viewExtent.panel.existingParams')}</h2>
            <div className="overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
              
              {/* 1. 默认重置 */}
              <div className="flex items-center justify-between bg-muted/50 border border-border py-1 px-2 rounded-md shrink-0">
                <span className="text-[11px] text-foreground font-mono">{t('viewExtent.panel.defaultReset')}</span>
                <Button size="sm" variant="secondary" className="h-5 px-2 text-[9px]" 
                  onClick={() => applyAlignmentPreset({ t: 0, r: 100, b: 100, l: 0 }, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 })}>
                  {t('viewExtent.panel.apply')}
                </Button>
              </div>

              {/* 2. 🌟 关键修复：从 views 中提取已经 Check 过的参数 (即 Project Meta 内容) */}
              {augViews.map((v, i) => {
                const tf = v.transform;
                if (!tf) return null;
                const crop = (tf as any).crop || { t: 0, r: 100, b: 100, l: 0 };
                
                // 只有被勾选过 (completed) 或者参数不是默认值的才显示
                const isDefault = tf.offsetX === 0 && tf.offsetY === 0 && tf.scaleX === 1 && crop.t === 0;
                if (isDefault && !completedViews.includes(v.id)) return null;

                return (
                  <div key={`meta-${v.id}`} className="flex flex-col bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 p-1.5 rounded-md space-y-1 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-foreground font-bold flex items-center gap-1.5">
                        <Database className="w-3 h-3 text-amber-500" />
                        {t('viewExtent.panel.metaAugView')} {i + 1}
                      </span>
                      <Button size="sm" variant="outline" className="h-5 px-2 text-[9px] bg-background" 
                        onClick={() => applyAlignmentPreset(crop, { offsetX: tf.offsetX, offsetY: tf.offsetY, scaleX: tf.scaleX, scaleY: tf.scaleY || tf.scaleX })}>
                        {t('viewExtent.panel.apply')}
                      </Button>
                    </div>
                    <div className="text-[9px] text-muted-foreground font-mono flex justify-between">
                      <span>Crop: {crop.t.toFixed(1)},{crop.r.toFixed(1)}...</span>
                      <span>Scale: {tf.scaleX.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}

            {/* 3. 历史快照 (Auto Saved) */}
                {savedAlignments.map((preset) => (
                  <div key={preset.id} className="group flex flex-col bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 p-1.5 rounded-md space-y-1 shrink-0 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">{preset.name}</span>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-5 w-5 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" 
                          onClick={() => removeSavedAlignment(preset.id)}
                          title={t('viewExtent.panel.deleteParams')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        
                        <Button size="sm" variant="default" className="h-5 px-2 text-[9px] bg-blue-600 hover:bg-blue-500 text-white" 
                          onClick={() => applyAlignmentPreset(preset.crop, preset.transform)}>
                          {t('viewExtent.panel.apply')}
                        </Button>
                      </div>
                    </div>
                    <div className="text-[9px] text-neutral-500 dark:text-neutral-400 font-mono leading-tight flex justify-between">
                      <span>Crop: {preset.crop.t.toFixed(1)}, {preset.crop.r.toFixed(1)}, {preset.crop.b.toFixed(1)}, {preset.crop.l.toFixed(1)}</span>
                      <span>Scale: {preset.transform.scaleX.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* 2. Aug View 列表 (滚动选择) - 【修改】：高度从 110px 增加到 150px */}
          <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex flex-col h-[140px] shrink-0">
             <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex justify-between">
               <span>{t('viewExtent.panel.activeAugViews')}</span>
               <span className="text-blue-500">{completedViews.length} / {augViews.length}</span>
             </h2>
             <div className="overflow-y-auto pr-1 space-y-1 custom-scrollbar">
               {augViews.map((v, i) => {
                 const isActive = v.id === activeAugId;
                 const isCompleted = completedViews.includes(v.id);
                 return (
                  <button 
                     key={v.id}
                     onClick={() => setActiveAugId(v.id)}
                     className={`w-full flex items-center justify-between py-1.5 px-2 rounded-md text-[11px] transition-all border
                       ${isActive ? 'bg-primary border-primary shadow-sm text-primary-foreground font-bold' : 'bg-transparent border-transparent hover:bg-muted text-muted-foreground hover:text-foreground'}
                     `}
                   >
                     <span className="font-medium">{t('viewExtent.panel.augView')} {i + 1}</span>
                     {isCompleted && <CheckCircle2 className={`w-3.5 h-3.5 ${isActive ? 'text-primary-foreground' : 'text-green-500'}`} />}
                   </button>
                 );
               })}
             </div>
          </div>
          
{/* 3. 当前视图实时参数 (极致紧凑，尽量一次性显示) */}
          {/* 【修复1】：最外层加上 min-h-0 防止被内部内容强行撑开 */}
          <div className="flex-1 p-3 flex flex-col bg-neutral-50 dark:bg-neutral-950 overflow-hidden min-h-0">
            <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 shrink-0">{t('viewExtent.panel.currentParams')}</h2>
            
            {/* 【修复2】：加上 flex-1 min-h-0，让它成为一个受限的内部滚动区域！ */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar pb-1">
              
              {/* Crop 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">{t('viewExtent.panel.crop')}</div>
                {['t', 'b', 'l', 'r'].map(edge => (
                  <div key={edge} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{edge}</span>
                    <Slider 
                      min={0} max={100} step={0.1} 
                      value={[activeCrop[edge as 't'|'r'|'b'|'l']]} 
                      onValueChange={(v) => handleManualCropChange(edge as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" 
                      value={activeCrop[edge as 't'|'r'|'b'|'l']} 
                      onChange={(e) => handleManualCropChange(edge as any, parseFloat(e.target.value) || 0)} 
                      className="w-12 h-5 text-[9px] px-1 bg-background border-input text-foreground font-mono focus-visible:ring-1"
                      // 宽度是 w-14 的那几个保持 w-14 不变，只改颜色部分
                    />
                  </div>
                ))}
              </div>

              {/* Scale 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">{t('viewExtent.panel.scale')}</div>
                {['scaleX', 'scaleY'].map(axis => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{axis.replace('scale', '')}</span>
                    <Slider 
                      min={0.01} max={10} step={0.01} 
                      value={[tempTransformRef.current[axis as 'scaleX'|'scaleY']]} 
                      onValueChange={(v) => handleManualTransformChange(axis as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" step="0.01" 
                      value={tempTransformRef.current[axis as 'scaleX'|'scaleY']} 
                      onChange={(e) => handleManualTransformChange(axis as any, parseFloat(e.target.value) || 1)} 
                      className="w-14 h-5 text-[9px] px-1 bg-white dark:bg-neutral-900 border-neutral-700 font-mono focus-visible:ring-1" 
                    />
                  </div>
                ))}
              </div>

              {/* Offset 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">{t('viewExtent.panel.offset')}</div>
                {['offsetX', 'offsetY'].map(axis => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{axis.replace('offset', '')}</span>
                    <Slider 
                      min={-3000} max={3000} step={1} 
                      value={[tempTransformRef.current[axis as 'offsetX'|'offsetY']]} 
                      onValueChange={(v) => handleManualTransformChange(axis as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" step="1" 
                      value={tempTransformRef.current[axis as 'offsetX'|'offsetY']} 
                      onChange={(e) => handleManualTransformChange(axis as any, parseFloat(e.target.value) || 0)} 
                      className="w-14 h-5 text-[9px] px-1 bg-white dark:bg-neutral-900 border-neutral-700 font-mono focus-visible:ring-1" 
                    />
                  </div>
                ))}
              </div>

            </div>

            {/* 【修复3】：加上 shrink-0，确保高级配准按钮死死地固定在底部，绝不被上面的滑块挤出屏幕 */}
            <div className="shrink-0 flex items-center gap-2 pt-2 mt-2 border-t border-border">
                <Button 
                  variant="outline" 
                  className="flex-1 h-6 text-[9px] bg-background hover:bg-muted"
                  onClick={() => alert("AI Auto Alignment feature is under development...")}
                >
                  <Zap className="w-3 h-3 mr-1 text-amber-500" /> {t('viewExtent.panel.aiAutoAlign')}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 h-6 text-[9px] bg-background hover:bg-muted"
                  onClick={() => alert("Control Point Registration (Georeferencing) is under development...")}
                >
                  <MousePointer2 className="w-3 h-3 mr-1 text-primary" /> {t('viewExtent.panel.tiePoints')}
                </Button>
              </div>
            </div>

          {/* 4. 底部并排操作按钮 (更名且放置在同一行) */}
          <div className="p-3 border-t border-border bg-muted/30 shrink-0 flex items-center gap-2">
            <Button 
              // 🌟 缺了 text-white，现在补上，并优先使用 primary
              className={`flex-1 h-8 text-[11px] px-2 text-white ${completedViews.includes(activeAugId) ? 'bg-green-600 hover:bg-green-700' : 'bg-primary hover:bg-primary/90'}`} 
              onClick={handleSaveCurrentView}
            >
               {t('viewExtent.panel.viewChecked')}
            </Button>

            <Button 
              // 🌟 去掉写死的白底黑字，改为标准的 outline，自动适配日夜间
              variant="outline"
              className="flex-1 h-8 text-[11px] px-2 font-bold bg-background hover:bg-muted" 
              onClick={proceedToExport}
              disabled={completedViews.length < augViews.length}
            >
               {t('viewExtent.panel.viewsChecked')}
            </Button>
          </div>

        </div>
      </div>
      
      <style>{`
        .dashed-border {
            background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%233B82F6' stroke-width='4' stroke-dasharray='6%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
            border: none;
        }
      `}</style>
    </div>
  );
}