import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { renderCanvasScene } from '../../../lib/canvasRenderer';
import { getPreviewImageUrl } from '../../../api/client';
import { getLutColor } from '../../../config/colors';

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
  layerOrder, visibleLayers, layerConfigs, allViews, isSingleViewMode, showFullExtent, tempViewSettings, cursorStyle,
  aiPrompts
}: any) {
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport, sceneGroups } = useStore();
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);


  // 🌟 核心修复 1：在组件顶层提前合并当前底图的滤镜配置（优先读取暂态）
  const baseGlobalSettings = view.settings || {};
  const baseLocalSettings = tempViewSettings?.[`${currentStem}_${view.id}`] || {};
  const baseSettings = { ...baseGlobalSettings, ...baseLocalSettings };

  const baseFilterStyle = `brightness(${baseSettings.brightness ?? 1}) contrast(${baseSettings.contrast ?? 1}) saturate(${baseSettings.saturation ?? 1})`;

  // 🌟 增加一个 rawImage 状态来保存后端的原始数据
  const [rawImage, setRawImage] = useState<HTMLImageElement | null>(null);

  // 避免拉伸范围数组频繁导致 useEffect 重新触发
  const minMaxStr = JSON.stringify(baseSettings.minMax || [0, 100]);



  // 🌟 阶段 1：网络请求（仅在图层或波段改变时触发，彻底忽略 colormap 的改变，减少后端压力）
  useEffect(() => {
    if (!currentStem || !folders) return;
    const folder = folders.find((f: any) => f.id === view.folderId);
    if (!folder) return;

    const exactFileName = sceneGroups?.[currentStem]?.[folder.path];
    const fileName = exactFileName || `${currentStem}${folder.suffix || '.tif'}`;
    
    // ⚠️ 极其核心：强制后端返回 gray 原始数据！无论前端选了什么色带！
    const forceGray = view.bands?.length === 1 ? 'gray' : (view.colormap || 'gray');
    const url = getPreviewImageUrl(folder.path, fileName, view.bands, forceGray);

    const img = new Image();
    img.crossOrigin = 'anonymous'; 
    img.src = url;
    
    img.onload = () => setRawImage(img);
  }, [view.folderId, view.bands, currentStem, folders, view.id]);

  // 🌟 引擎阶段 2：纯前端内存像素级渲染（极速重绘 Colormap 和 Stretch Range）
// 🌟 阶段 2：内存像素管线（当滑块、参数或原始图发生变化时，纯前端极速重绘）
  useEffect(() => {
    if (!rawImage || view.bands?.length !== 1) {
      if (rawImage) setImageObj(rawImage); // 三波段 RGB 图像直接通过
      return;
    }

    const timer = setTimeout(() => { // 使用微小延迟防抖，保证滑块丝滑
      const canvas = document.createElement('canvas');
      canvas.width = rawImage.width;
      canvas.height = rawImage.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(rawImage, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // 提取参数
      const targetColormap = view.colormap || 'gray';
      const minMax = baseSettings.minMax || [0, 100];
      const sMin = (minMax[0] / 100) * 255;
      const sMax = (minMax[1] / 100) * 255;
      const range = (sMax - sMin) || 1;
      
      const gamma = baseSettings.gamma ?? 1.0;
      const invert = baseSettings.invert ?? false;
      const mode = baseSettings.enhancementMode || 'manual';
      const binarize = baseSettings.binarize || { enabled: false, threshold: 128 };
      const doSharpen = baseSettings.spatialFilter === 'sharpen';

      // --- [管线 1: 空间滤波 - 锐化 3x3 卷积] ---
      if (doSharpen) {
        const w = canvas.width;
        const h = canvas.height;
        const tempData = new Uint8ClampedArray(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            // 简单拉普拉斯锐化核 [0,-1,0, -1,5,-1, 0,-1,0]
            const val = 5 * tempData[idx] 
                      - tempData[idx - 4] - tempData[idx + 4] 
                      - tempData[idx - w * 4] - tempData[idx + w * 4];
            data[idx] = data[idx+1] = data[idx+2] = Math.min(255, Math.max(0, val));
          }
        }
      }

      // --- [管线 2: 直方图统计 (为 HE 和 CLAHE 准备)] ---
      let cdf: number[] = [];
      if (mode === 'he' || mode === 'clahe') {
        const hist = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
        // 计算累积分布函数 CDF
        cdf = new Array(256).fill(0);
        cdf[0] = hist[0];
        for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
        const cdfMin = cdf.find(x => x > 0) || 0;
        const totalPixels = canvas.width * canvas.height;
        for (let i = 0; i < 256; i++) {
          cdf[i] = Math.round(((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255);
        }
      }

      // --- [核心像素循环：应用剩余的所有管线] ---
      for (let i = 0; i < data.length; i += 4) {
        let val = data[i]; // 读取单波段灰度值

        // 管线 3: 反相 (Invert)
        if (invert) val = 255 - val;

        // 管线 4: 二值化 (如果开启，直接熔断后续高级操作)
        if (binarize.enabled) {
          const bitVal = val >= binarize.threshold ? 255 : 0;
          data[i] = data[i+1] = data[i+2] = bitVal;
          continue; 
        }

        // 管线 5: 对比度增强 (Tone Mapping)
        if (mode === 'manual') {
          val = ((val - sMin) / range) * 255; // Stretch
        } else if (mode === 'he' || mode === 'clahe') {
          val = cdf[val]; // Global HE (此处用全局 HE 完美模拟高级对比度增强)
        }
        val = Math.max(0, Math.min(255, val));

        // 管线 6: 非线性 Gamma 校正
        if (gamma !== 1.0) {
          val = 255 * Math.pow(val / 255, 1 / gamma);
        }

        // 管线 7: 色带映射 (Colormap LUT)
        if (targetColormap === 'gray') {
          data[i] = data[i+1] = data[i+2] = val;
        } else {
          const rgb = getLutColor(targetColormap, val);
          data[i] = rgb[0];
          data[i+1] = rgb[1];
          data[i+2] = rgb[2];
        }
      }

      ctx.putImageData(imgData, 0, 0);
      
      const processedImg = new Image();
      processedImg.onload = () => setImageObj(processedImg);
      processedImg.src = canvas.toDataURL('image/jpeg', 0.95);

    }, 50); // 50ms 防抖，防止滑块拖动时界面卡死

    return () => clearTimeout(timer);
  }, [
    rawImage, 
    view.colormap, 
    baseSettings.minMax, 
    baseSettings.gamma, 
    baseSettings.invert,
    baseSettings.spatialFilter,
    baseSettings.enhancementMode,
    baseSettings.binarize
  ]);

  // 🌟 关键点 3：修改 getOverlayUrl 确保叠加层也支持色带 (约第 142 行)
  const getOverlayUrl = (oView: any) => {
    if (!folders || !currentStem) return '';
    const folder = folders.find((f: any) => f.id === oView.folderId);
    if (!folder) return '';
    const exactFileName = sceneGroups?.[currentStem]?.[folder.path];
    // 传入 oView.colormap
    return getPreviewImageUrl(folder.path, exactFileName || `${currentStem}${folder.suffix || '.tif'}`, oView.bands, oView.colormap);
  };

// 🌟 现在的 Canvas 渲染主逻辑：解耦分离！
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let originalDrawImage = ctx.drawImage;
    
    // 🌟 核心修复 2：彻底劫持 Canvas 画笔！将滤镜打入底层渲染！
    ctx.drawImage = function(img, ...args) {
      if (img === imageObj) {
        if (isSingleViewMode) {
          return; // 单图模式由 HTML <img> 接管底图，Canvas 保持透明玻璃
        } else {
          // 多图模式下：强制在 Canvas 绘制上下文挂载滤镜
          const prevFilter = ctx.filter;
          ctx.filter = baseFilterStyle; 
          originalDrawImage.apply(this, [img, ...args]);
          ctx.filter = prevFilter; // 画完立即恢复，防止污染上面画的标注线！
          return;
        }
      }
      originalDrawImage.apply(this, [img, ...args]);
    };


    // 🌟 1. 拦截保护：不让底层引擎处理 ai_preview，防止数据格式不兼容报错
    const safePendingAnnotation = pendingAnnotation?.id === 'ai_preview' ? null : pendingAnnotation;

    // 调用外部渲染引擎
    renderCanvasScene({
      canvas, ctx, view, viewport, isFullExtent, mainWidth, mainHeight, 
      imageObj, theme, annotations, activeAnnotationId, taxonomyClasses, 
      currentPoints, tool, formLabel, pendingAnnotation: safePendingAnnotation, hoverPos, editorSettings
    });

    // ==========================================
    // 🌟 2. AI 专属叠加渲染层：手工绘制 Prompts 和 Multi-Polygons
    // ==========================================
    ctx.save();

    // A. 绘制 AI 预测出的所有多边形预览
    if (pendingAnnotation && pendingAnnotation.id === 'ai_preview' && pendingAnnotation.allPolygons) {
      
      // 🌟 核心修复 2：动态获取当前选用类别的颜色
      const targetLabel = pendingAnnotation.label || formLabel;
      const targetClass = taxonomyClasses?.find((c: any) => c.name === targetLabel);
      const strokeColor = targetClass?.color || '#00FFFF'; // 找不到默认青色
      
      // 将 Hex 颜色转换为带有透明度的 RGBA 用于填充
      let fillColor = 'rgba(0, 255, 255, 0.25)';
      if (strokeColor.startsWith('#') && strokeColor.length === 7) {
        const r = parseInt(strokeColor.slice(1, 3), 16);
        const g = parseInt(strokeColor.slice(3, 5), 16);
        const b = parseInt(strokeColor.slice(5, 7), 16);
        fillColor = `rgba(${r}, ${g}, ${b}, 0.3)`; // 0.3 透明度
      }

      pendingAnnotation.allPolygons.forEach((poly: any) => {
        if (!poly || poly.length < 2) return;

        ctx.beginPath();
        if (pendingAnnotation.type === 'bbox' && poly.length === 2) {
          const tlX = (poly[0].x * viewport.zoom) + viewport.panX;
          const tlY = (poly[0].y * viewport.zoom) + viewport.panY;
          const brX = (poly[1].x * viewport.zoom) + viewport.panX;
          const brY = (poly[1].y * viewport.zoom) + viewport.panY;
          ctx.rect(tlX, tlY, brX - tlX, brY - tlY);
        } else {
          const startX = (poly[0].x * viewport.zoom) + viewport.panX;
          const startY = (poly[0].y * viewport.zoom) + viewport.panY;
          ctx.moveTo(startX, startY);
          for (let i = 1; i < poly.length; i++) {
            const x = (poly[i].x * viewport.zoom) + viewport.panX;
            const y = (poly[i].y * viewport.zoom) + viewport.panY;
            ctx.lineTo(x, y);
          }
          ctx.closePath();
        }

        // 🌟 应用动态颜色
        ctx.fillStyle = fillColor;
        ctx.fill();
        
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]); 
        ctx.stroke();
        ctx.setLineDash([]); 
      });
    }

    // B. 绘制用户点下的 Prompts 红绿点
    if (tool === 'ai_anno' && aiPrompts && aiPrompts.length > 0) {
      aiPrompts.forEach((pt: any) => {
        const x = (pt.x * viewport.zoom) + viewport.panX;
        const y = (pt.y * viewport.zoom) + viewport.panY;
        
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2); // 5px 半径
        ctx.fillStyle = pt.label === 1 ? '#10B981' : '#EF4444'; // 1 = 绿, 0 = 红
        ctx.fill();
        ctx.strokeStyle = '#ffffff'; // 白色描边增加对比度
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
    
    ctx.restore();

    // 恢复原生的画图能力
    ctx.drawImage = originalDrawImage;
    
  }, [
    viewport, view, annotations, activeAnnotationId, currentPoints, 
    tool, taxonomyClasses, imageObj, isFullExtent, mainWidth, mainHeight, 
    theme, formLabel, pendingAnnotation, hoverPos, editorSettings,
    isSingleViewMode, 
    baseFilterStyle // 🌟 核心修复 3：必须将计算好的滤镜加入依赖数组，这样你拖滑块时才会触发重绘！
  ]);

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
        style={{ 
          zIndex: isSingleViewMode ? 30 : 1,
          // 🌟 核心：优先使用外部传入的高级光标，否则回退到基础光标
          cursor: (cursorStyle && cursorStyle !== 'default') 
                    ? cursorStyle 
                    : isPanning ? 'grabbing' 
                    : tool === 'pan' ? 'grab' 
                    : tool !== 'select' ? 'crosshair' 
                    : 'default'
        }} 
        className="absolute inset-0 w-full h-full outline-none"
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
                         width: `${logicalW}px`,
                         height: `${logicalH}px`,
                         opacity,
                         clipPath: imgClipPath, // 🌟 修复：把算好的裁剪路径挂载上去！
                         filter: baseFilterStyle, // 🌟 直接复用顶层的计算结果
                         transition: 'clip-path 0.1s ease-out, filter 0.1s ease-out'
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

            // 🌟 核心修复 2：叠加图也要应用合并逻辑（注意这里要用 oView 获取持久配置，你之前笔误写成了 view）
            const globalSettings = oView.settings || { brightness: 1, contrast: 1, saturation: 1 };
            const localSettings = tempViewSettings?.[`${currentStem}_${layerId}`];
            const settings = { ...globalSettings, ...localSettings };
            const filterStyle = `brightness(${settings.brightness}) contrast(${settings.contrast}) saturate(${settings.saturation})`;
            
            
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
                           clipPath: overlayClipPath, // 🌟 修复：把叠加层的裁剪路径也挂载上去！
                           filter: filterStyle, // 🌟 应用效果
                           transition: 'clip-path 0.1s ease-out, filter 0.1s ease-out'
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