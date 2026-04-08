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
  hoverPos, onMouseLeave, editorSettings, mouseQuad,
  layerOrder, visibleLayers, layerConfigs, allViews, isSingleViewMode, showFullExtent // 🌟 接收引擎数据
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

  // 获取其他叠加图层的真实 URL
  const getOverlayUrl = (oView: any) => {
    if (!folders || !currentStem) return '';
    const folder = folders.find((f: any) => f.id === oView.folderId);
    if (!folder) return '';
    const exactFileName = sceneGroups?.[currentStem]?.[folder.path];
    return getPreviewImageUrl(folder.path, exactFileName || `${currentStem}${folder.suffix || '.tif'}`, oView.bands, oView.colormap);
  };
return (
    <>
      {editorSettings.showPixelValue && (
        <PixelInfoBadge hoverPos={hoverPos} imageObj={imageObj} view={view} mouseQuad={mouseQuad} />
      )}
      
      {/* 🌟 核心引擎：根据 layerOrder 倒序循环，确保顶层拥有最大的 z-index */}
      {layerOrder.map((layerId: string) => {
         // 计算 zIndex，排在数组前面的层叠在最上面
         const zIndex = layerOrder.length - layerOrder.indexOf(layerId);
         
         // 提取该图层的特效配置
         const config = layerConfigs?.[layerId] || { mode: 'opacity', value: 1 };
         const opacity = config.mode === 'opacity' ? config.value : 1;

         // 1. 如果轮到了当前作为底板的 Canvas 图层
         if (layerId === view.id) {
           // ==========================================
           // 🌟 修复 1：精准计算底层 Canvas 的裁剪路径 (消灭 Main View 滑块两端死区)
           // ==========================================
           let canvasClipPath = 'none';
           if (config.mode !== 'opacity') {
             // 获取底层视图当前的 Crop 状态
             const isBaseFullExtent = !!(showFullExtent && showFullExtent[view.id]);
             const baseCrop = view.transform?.crop || { t: 0, r: 100, b: 100, l: 0 };
             const bBoundL = isBaseFullExtent ? 0 : baseCrop.l;
             const bBoundR = isBaseFullExtent ? 100 : baseCrop.r;
             const bBoundT = isBaseFullExtent ? 0 : baseCrop.t;
             const bBoundB = isBaseFullExtent ? 100 : baseCrop.b;

             // 计算图像在当前屏幕上的实际物理像素大小
             const imgScreenW = mainWidth * viewport.zoom;
             const imgScreenH = mainHeight * viewport.zoom;

             // 计算图像在当前屏幕上的真实起止物理坐标
             const baseStartX = viewport.panX + (bBoundL / 100) * imgScreenW;
             const baseEndX = viewport.panX + (bBoundR / 100) * imgScreenW;
             const baseStartY = viewport.panY + (bBoundT / 100) * imgScreenH;
             const baseEndY = viewport.panY + (bBoundB / 100) * imgScreenH;

             // 核心映射：将 0-100 的滑块值完美映射到屏幕上的像素边界
             const mappedCanvasX = baseStartX + (config.value / 100) * (baseEndX - baseStartX);
             const mappedCanvasY = baseStartY + (config.value / 100) * (baseEndY - baseStartY);

             // 使用极大的负值（-9999px）作为无限边界，确保无论用户怎么缩放和平移，卷帘都不会露出破绽
             canvasClipPath = config.mode === 'swipeX' ? `polygon(-9999px -9999px, ${mappedCanvasX}px -9999px, ${mappedCanvasX}px 9999px, -9999px 9999px)` :
                              config.mode === 'swipeY' ? `polygon(-9999px -9999px, 9999px -9999px, 9999px ${mappedCanvasY}px, -9999px ${mappedCanvasY}px)` : 'none';
           }

           return (
             <canvas
                key={`canvas-${layerId}`}
                ref={canvasRef}
                style={{ zIndex, opacity, clipPath: canvasClipPath, transition: 'clip-path 0.1s ease-out' }}
                className={`absolute inset-0 w-full h-full ${
                  isPanning ? 'cursor-grabbing' : 
                  tool === 'pan' ? 'cursor-default' :
                  tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
                }`}
                onMouseDown={onMouseDown} onMouseUp={onMouseUp} onDoubleClick={onDoubleClick}
                onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onContextMenu={(e) => e.preventDefault()}
              />
           );
         } 
         
         // 2. 如果轮到了其他被勾选作为 Overlay 的图层 (仅在单图模式下激活)
         if (isSingleViewMode && visibleLayers[layerId]) {
            const oView = allViews.find((v: any) => v.id === layerId);
            if (!oView) return null;
            
            const isLayerFullExtent = !!(showFullExtent && showFullExtent[layerId]);
            const crop = oView.transform?.crop || { t: 0, r: 100, b: 100, l: 0 };
            
            const boundL = isLayerFullExtent ? 0 : crop.l;
            const boundR = isLayerFullExtent ? 100 : crop.r;
            const boundT = isLayerFullExtent ? 0 : crop.t;
            const boundB = isLayerFullExtent ? 100 : crop.b;

            // ==========================================
            // 🌟 修复 2：精准计算叠加图像的裁剪路径 (消灭 Aug View 滑块两端死区)
            // ==========================================
            // 核心映射：将 0-100 的滑块值，线性插值到当前 Crop 的百分比区间内
            const mappedX = boundL + (config.value / 100) * (boundR - boundL);
            const mappedY = boundT + (config.value / 100) * (boundB - boundT);

            let overlayClipPath = 'none';
            if (config.mode === 'swipeX') {
                overlayClipPath = `polygon(${boundL}% ${boundT}%, ${mappedX}% ${boundT}%, ${mappedX}% ${boundB}%, ${boundL}% ${boundB}%)`;
            } else if (config.mode === 'swipeY') {
                overlayClipPath = `polygon(${boundL}% ${boundT}%, ${boundR}% ${boundT}%, ${boundR}% ${mappedY}%, ${boundL}% ${mappedY}%)`;
            } else {
                if (!isLayerFullExtent) {
                    overlayClipPath = `polygon(${boundL}% ${boundT}%, ${boundR}% ${boundT}%, ${boundR}% ${boundB}%, ${boundL}% ${boundB}%)`;
                }
            }
            
            return (
              <div key={`overlay-${layerId}`} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex }}>
                 <div style={{ transformOrigin: '0 0', transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})` }}>
                    <div style={{ transformOrigin: '0 0', transform: `translate3d(${oView.transform?.offsetX || 0}px, ${oView.transform?.offsetY || 0}px, 0) scale(${oView.transform?.scaleX || 1}, ${oView.transform?.scaleY || oView.transform?.scaleX || 1})` }}>
                       <img
                         src={getOverlayUrl(oView)}
                         alt={`Overlay ${layerId}`}
                         className="block max-w-none mix-blend-screen" 
                         style={{ opacity, clipPath: overlayClipPath, transition: 'clip-path 0.1s ease-out' }}
                       />
                    </div>
                 </div>
              </div>
            );
         }
         
         return null;
      })}
    </>
  );
}