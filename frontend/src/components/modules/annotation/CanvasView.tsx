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
    <div className={`absolute z-40 px-2 py-1 bg-black/80 backdrop-blur rounded text-[10px] font-mono text-white border border-white/20 transition-all duration-300 ${positionClass}`}>
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

// 🌟 现在的 Canvas 渲染主逻辑：解耦分离！
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 🌟 核心拦截魔法：如果是单图模式，我们拦截掉底图的绘制！
    // 这样 Canvas 就会变成一层透明的玻璃，上面只画纯粹的标注线条。
    let originalDrawImage = ctx.drawImage;
    if (isSingleViewMode) {
      ctx.drawImage = function(img, ...args) {
        if (img === imageObj) return; // 遇到自己的底图，拒绝绘制
        originalDrawImage.apply(this, [img, ...args]);
      };
    }

    // 调用外部渲染引擎（引擎照常运行，坐标系完好，只是画底图时被我们“静音”了）
    renderCanvasScene({
      canvas, ctx, view, viewport, isFullExtent, mainWidth, mainHeight, 
      imageObj, theme, annotations, activeAnnotationId, taxonomyClasses, 
      currentPoints, tool, formLabel, pendingAnnotation, hoverPos, editorSettings
    });

    // 恢复原生的画图能力，防止污染其他组件
    if (isSingleViewMode) {
      ctx.drawImage = originalDrawImage;
    }
    
  }, [
    viewport, view, annotations, activeAnnotationId, currentPoints, 
    tool, taxonomyClasses, imageObj, isFullExtent, mainWidth, mainHeight, 
    theme, formLabel, pendingAnnotation, hoverPos, editorSettings,
    isSingleViewMode // 🌟 切记加上这个依赖项
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
      
      {/* ==========================================
          🌟 修复 1：在任意视图的单图模式下，永远渲染 Main View 的红色虚线参考框
          ========================================== */}
      {isSingleViewMode && (
        <div 
          className="absolute border-2 border-dashed border-red-500 pointer-events-none z-20 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          style={{
            left: `${viewport.panX}px`,
            top: `${viewport.panY}px`,
            width: `${mainWidth * viewport.zoom}px`,
            height: `${mainHeight * viewport.zoom}px`,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] text-red-500 font-mono bg-black/70 px-1.5 py-0.5 rounded-t">
            Main View Extent
          </span>
        </div>
      )}

      {/* ==========================================
          🌟 修复 2：绝对顶层的玻璃画板（专供标注，不含底图）
          ========================================== */}
      <canvas
        ref={canvasRef}
        style={{ zIndex: isSingleViewMode ? 30 : 1 }} // 永远在最顶层，俯瞰所有图层
        className={`absolute inset-0 w-full h-full ${
          isPanning ? 'cursor-grabbing' : 
          tool === 'pan' ? 'cursor-default' :
          tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
        }`}
        onMouseDown={onMouseDown} onMouseUp={onMouseUp} onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onContextMenu={(e) => e.preventDefault()}
      />

{/* ==========================================
          🌟 重建的底层图像引擎：Base Image + Overlays (严格服从图层顺序)
          ========================================== */}
      {isSingleViewMode && layerOrder.map((layerId: string) => {
         const zIndex = layerOrder.length - layerOrder.indexOf(layerId);
         const config = layerConfigs?.[layerId] || { mode: 'opacity', value: 1 };
         const opacity = config.mode === 'opacity' ? config.value : 1;

         // 1. 底板图像 (Base Layer)
         if (layerId === view.id) {
           // 🌟 核心修复 1：放弃复杂的屏幕 px 计算，统一使用百分比 (%) 处理裁剪和卷帘！
           const isBaseFullExtent = !!(showFullExtent && showFullExtent[view.id]);
           const baseCrop = view.transform?.crop || { t: 0, r: 100, b: 100, l: 0 };
           const boundL = isBaseFullExtent ? 0 : baseCrop.l;
           const boundR = isBaseFullExtent ? 100 : baseCrop.r;
           const boundT = isBaseFullExtent ? 0 : baseCrop.t;
           const boundB = isBaseFullExtent ? 100 : baseCrop.b;

           const mappedX = boundL + (config.value / 100) * (boundR - boundL);
           const mappedY = boundT + (config.value / 100) * (boundB - boundT);

           let imgClipPath = 'none';
           if (config.mode === 'swipeX') {
               imgClipPath = `polygon(${boundL}% ${boundT}%, ${mappedX}% ${boundT}%, ${mappedX}% ${boundB}%, ${boundL}% ${boundB}%)`;
           } else if (config.mode === 'swipeY') {
               imgClipPath = `polygon(${boundL}% ${boundT}%, ${boundR}% ${boundT}%, ${boundR}% ${mappedY}%, ${boundL}% ${mappedY}%)`;
           } else {
               if (!isBaseFullExtent) {
                   imgClipPath = `polygon(${boundL}% ${boundT}%, ${boundR}% ${boundT}%, ${boundR}% ${boundB}%, ${boundL}% ${boundB}%)`;
               }
           }

           // 🌟 核心修复 2：获取当前视图的真实逻辑尺寸，强行撑开 <img>，防止它缩水！
           const currentFolder = folders?.find((f: any) => f.id === view.folderId);
           const logicalW = currentFolder?.metadata?.width || mainWidth;
           const logicalH = currentFolder?.metadata?.height || mainHeight;

           return (
             <div key={`base-img-${layerId}`} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex }}>
               <div style={{ transformOrigin: '0 0', transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})` }}>
                  <div style={{ transformOrigin: '0 0', transform: `translate3d(${view.transform?.offsetX || 0}px, ${view.transform?.offsetY || 0}px, 0) scale(${view.transform?.scaleX || 1}, ${view.transform?.scaleY || view.transform?.scaleX || 1})` }}>
                     <img
                       src={imageObj?.src}
                       alt="Base Layer"
                       className="block max-w-none"
                       style={{
                         width: `${logicalW}px`,      // 👈 强行锁定物理宽度
                         height: `${logicalH}px`,     // 👈 强行锁定物理高度
                         opacity,
                         clipPath: imgClipPath,
                         transition: 'clip-path 0.1s ease-out'
                       }}
                     />
                  </div>
               </div>
             </div>
           );
         } 
         
         // 2. 叠加层图像 (Overlay Layers)
         if (visibleLayers[layerId]) {
            const oView = allViews.find((v: any) => v.id === layerId);
            if (!oView) return null;
            
            const isLayerFullExtent = !!(showFullExtent && showFullExtent[layerId]);
            const crop = oView.transform?.crop || { t: 0, r: 100, b: 100, l: 0 };
            
            const boundL = isLayerFullExtent ? 0 : crop.l;
            const boundR = isLayerFullExtent ? 100 : crop.r;
            const boundT = isLayerFullExtent ? 0 : crop.t;
            const boundB = isLayerFullExtent ? 100 : crop.b;

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
            
            // 🌟 同理，获取 Overlay 的真实逻辑尺寸，防止叠加层也缩水
            const oFolder = folders?.find((f: any) => f.id === oView.folderId);
            const oLogicalW = oFolder?.metadata?.width || mainWidth;
            const oLogicalH = oFolder?.metadata?.height || mainHeight;

            return (
              <div key={`overlay-${layerId}`} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex }}>
                 <div style={{ transformOrigin: '0 0', transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})` }}>
                    <div style={{ transformOrigin: '0 0', transform: `translate3d(${oView.transform?.offsetX || 0}px, ${oView.transform?.offsetY || 0}px, 0) scale(${oView.transform?.scaleX || 1}, ${oView.transform?.scaleY || oView.transform?.scaleX || 1})` }}>
                       <img
                         src={getOverlayUrl(oView)}
                         alt={`Overlay ${layerId}`}
                         className="block max-w-none mix-blend-screen" 
                         style={{
                           width: `${oLogicalW}px`,    // 👈 强行锁定物理宽度
                           height: `${oLogicalH}px`,   // 👈 强行锁定物理高度
                           opacity, 
                           clipPath: overlayClipPath, 
                           transition: 'clip-path 0.1s ease-out' 
                         }}
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