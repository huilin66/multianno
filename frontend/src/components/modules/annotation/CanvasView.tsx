import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { renderCanvasScene } from '../../../lib/canvasRenderer';
import { getPreviewImageUrl } from '../../../api/client';

// 1. 把 PixelInfoBadge 移过来
function PixelInfoBadge({ hoverPos, imageObj, view, mouseQuad }: any) {
  // 🌟 1. 新增：创建一个持久的隐形画布，用来高性能取色
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!hoverPos || !imageObj) return null;

  let localX = hoverPos.x;
  let localY = hoverPos.y;
  
  if (!view.isMain) {
    localX = (hoverPos.x - view.transform.offsetX) / view.transform.scaleX;
    localY = (hoverPos.y - view.transform.offsetY) / (view.transform.scaleY || view.transform.scaleX);
  }

  // 边界检查
  if (localX < 0 || localX >= imageObj.width || localY < 0 || localY >= imageObj.height) return null;

  // 🌟 2. 初始化隐形画布 (只执行一次)
  if (!offscreenCanvasRef.current) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    offscreenCanvasRef.current = canvas;
  }

  // 🌟 3. 核心：实时切片并提取像素值
  let pixelData = 'RGB: (-, -, -)';
  try {
    const ctx = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      // 从真实图片上切下 1x1 的像素画到隐形画布上
      ctx.drawImage(imageObj, Math.floor(localX), Math.floor(localY), 1, 1, 0, 0, 1, 1);
      // 读取这 1 个像素的 RGBA 数据
      const data = ctx.getImageData(0, 0, 1, 1).data;
      
      if (view.bands?.length === 3) {
        pixelData = `RGB: (${data[0]}, ${data[1]}, ${data[2]})`;
      } else {
        // 单波段灰度图，R/G/B 值相同，取第一个即可
        pixelData = `VAL: ${data[0]}`; 
      }
    }
  } catch (err) {
    pixelData = 'CORS Error'; // 防止图片跨域导致的安全报错
  }

  // 智能避让算法
  const isTr = mouseQuad?.tr;
  const isTl = mouseQuad?.tl;
  const positionClass = isTr 
      ? 'top-10 left-2' 
      : isTl 
          ? 'top-10 right-2' 
          : 'top-2 right-2';

  return (
    <div className={`absolute z-20 px-2 py-1 bg-black/80 backdrop-blur rounded text-[10px] font-mono text-white border border-white/20 transition-all duration-300 ${positionClass}`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-neutral-400">X:{Math.floor(localX)} Y:{Math.floor(localY)}</span>
        <span className="text-blue-400">
          {pixelData} {/* 🌟 渲染真实的像素值 */}
        </span>
        <div className="flex gap-2 mt-1 border-t border-white/10 pt-1 opacity-60">
          <span>{view.isMain ? 'Exact' : 'Transformed'}</span>
          <span>Rendered</span> {/* 提示：这是渲染层像素，并非后端浮点矩阵原始值 */}
        </div>
      </div>
    </div>
  );
}

// 2. 把 CanvasView 移过来，并 export 暴露出去
export function CanvasView({ 
  view, annotations, activeAnnotationId, taxonomyClasses, currentPoints, 
  tool, theme, folders, currentStem, isPanning,
  mainWidth, mainHeight, isFullExtent,
  onMouseDown, onMouseMove, onMouseUp,
  formLabel, pendingAnnotation, onDoubleClick, 
  hoverPos, onMouseLeave, editorSettings, mouseQuad // 🌟 确保接收了 mouseQuad
}: any) {
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport, sceneGroups } = useStore();
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!currentStem || !folders) return;
    const folder = folders.find((f: any) => f.id === view.folderId);
    if (!folder) return;

    // 🌟 2. 核心大换血：直接去字典里拿真实文件名，绝不猜测！
    // 如果万一没拿到（兜底），才退化为拼接
    const exactFileName = sceneGroups?.[currentStem]?.[folder.path];
    const fileName = exactFileName || `${currentStem}${folder.suffix || '.tif'}`;
    
    // 拼接后端请求 URL
    const url = getPreviewImageUrl(folder.path, fileName, view.bands, view.colormap);

    const img = new Image();
    img.crossOrigin = 'anonymous'; // 必须加，防止 Canvas 跨域污染报错
    img.src = url;
    
    img.onload = () => {
      setImageObj(img);
    };
    
    img.onerror = () => {
      console.warn(`Failed to load image for view ${view.id}: ${url}`);
      setImageObj(null);
    };
  }, [view.folderId, view.bands, view.colormap, currentStem, folders, view.id]);

// 🌟 现在的 Canvas 渲染主逻辑：极致精简！
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 直接调用渲染引擎
    renderCanvasScene({
      canvas, ctx, view, viewport, isFullExtent, mainWidth, mainHeight, 
      imageObj, theme, annotations, activeAnnotationId, taxonomyClasses, 
      currentPoints, tool, formLabel, pendingAnnotation, hoverPos, editorSettings
    });
    
  }, [
    viewport, view, annotations, activeAnnotationId, currentPoints, 
    tool, taxonomyClasses, imageObj, isFullExtent, mainWidth, mainHeight, 
    theme, formLabel, pendingAnnotation, hoverPos, editorSettings
  ]);

  return (
    <>
      {editorSettings.showPixelValue && (
        <PixelInfoBadge hoverPos={hoverPos} imageObj={imageObj} view={view} mouseQuad={mouseQuad} />
      )}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          isPanning ? 'cursor-grabbing' : 
          tool === 'pan' ? 'cursor-default' :
          tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
        }`}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
    </>
  );
}