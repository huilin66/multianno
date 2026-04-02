import { UI_THEMES } from '../config/colors';

export interface RenderParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: any;
  viewport: { x?: number, y?: number, panX: number, panY: number, zoom: number };
  isFullExtent: boolean;
  mainWidth: number;
  mainHeight: number;
  imageObj: HTMLImageElement | null;
  theme: 'dark' | 'light';
  annotations: any[];
  activeAnnotationId: string | null;
  taxonomyClasses: any[];
  currentPoints: { x: number, y: number }[];
  tool: string;
  formLabel: string;
  pendingAnnotation: any;
  hoverPos: { x: number, y: number, viewId: string } | null;
  editorSettings: any;
}

// 1. 绘制背景与图层
function drawCanvasBackground(params: RenderParams, colors: any) {
  const { ctx, view, viewport, isFullExtent, mainWidth, mainHeight, imageObj, theme } = params;

  // 1. 应用视口平移与缩放 (进入 Main View 世界坐标系)
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  // 2. 执行裁剪 (如果未开启全景，且是辅视图)
  if (!isFullExtent && !view.isMain) {
    ctx.beginPath(); ctx.rect(0, 0, mainWidth, mainHeight); ctx.clip(); 
  }

  // 3. 绘制真实图片 (进入 Aug View 局部坐标系)
  ctx.save();
  if (!view.isMain) {
    ctx.translate(view.transform.offsetX, view.transform.offsetY);
    ctx.scale(view.transform.scaleX, view.transform.scaleY || view.transform.scaleX);
  }

  if (imageObj) {
    ctx.drawImage(imageObj, 0, 0);
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2 / viewport.zoom; 
    ctx.strokeRect(0, 0, imageObj.width, imageObj.height);
  } else {
    ctx.fillStyle = view.isMain ? colors.canvasMainBg : colors.canvasAugBg;
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.fillStyle = colors.annoDoneText;
    ctx.font = `${14 / viewport.zoom}px Arial`;
    ctx.fillText("Loading Image...", 20 / viewport.zoom, 30 / viewport.zoom);
  }
  ctx.restore(); // 恢复到主视图世界坐标系

  // 4. 绘制全景模式下的“裁剪参考框”
  if (isFullExtent && !view.isMain && imageObj) {
    ctx.strokeStyle = theme === 'dark' ? 'rgba(250, 204, 21, 0.8)' : 'rgba(234, 88, 12, 0.8)';
    ctx.lineWidth = 2 / viewport.zoom;
    ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
    ctx.strokeRect(0, 0, mainWidth, mainHeight);
    
    ctx.fillStyle = theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.rect(-99999, -99999, 199998, 199998); 
    ctx.rect(0, 0, mainWidth, mainHeight);     
    ctx.fill('evenodd');
    ctx.setLineDash([]); 
  }
}

// 2. 绘制已保存的标注对象
function drawSavedObjects(params: RenderParams, colors: any) {
  const { ctx, annotations, activeAnnotationId, taxonomyClasses, tool, viewport } = params;

  annotations.forEach((ann: any) => {
    const clsDef = taxonomyClasses?.find((c: any) => c.name === ann.label);
    const baseColor = clsDef?.color || colors.annoDoneStroke;
    const isActive = ann.id === activeAnnotationId;
    
    ctx.strokeStyle = isActive ? '#FFFFFF' : baseColor;
    ctx.lineWidth = (isActive ? 4 : 2) / viewport.zoom;
    ctx.fillStyle = isActive ? `${baseColor}60` : `${baseColor}30`; 

    if (ann.type === 'bbox' && ann.points.length === 2) {
      const [p1, p2] = ann.points;
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      ctx.strokeRect(x, y, w, h); ctx.fillRect(x, y, w, h);
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, x, y - 6 / viewport.zoom);
    } else if (ann.type === 'polygon' && ann.points.length > 0) {
      ctx.beginPath(); ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 6 / viewport.zoom);
    } else if (ann.type === 'line' && ann.points.length > 0) {
      ctx.beginPath(); ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.stroke();
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; 
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 6 / viewport.zoom);
    } else if ((ann.type === 'ellipse' || ann.type === 'circle') && ann.points.length === 2) {
      const [p1, p2] = ann.points;
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      ctx.beginPath();
      if (ann.type === 'circle') {
        ctx.arc(x + w/2, y + h/2, Math.max(w, h) / 2, 0, Math.PI * 2);
      } else {
        ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; 
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, x, y - 6 / viewport.zoom);
    } else if (ann.type === 'point' && ann.points.length > 0) {
      const p = ann.points[0];
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 / viewport.zoom, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; ctx.fill(); ctx.stroke();
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, p.x + 8 / viewport.zoom, p.y - 8 / viewport.zoom);
    }

    // 绘制 Select 模式下的控制点
    if (isActive && tool === 'select') {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5 / viewport.zoom;
      const drawHandle = (hx: number, hy: number) => {
        ctx.beginPath(); ctx.arc(hx, hy, 4 / viewport.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      };

      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
        drawHandle(minX, minY); drawHandle(maxX, minY); drawHandle(minX, maxY); drawHandle(maxX, maxY);
      } else if (ann.type === 'polygon' || ann.type === 'line' || ann.type === 'lasso' || ann.type === 'freemask') {
        ann.points.forEach((p: any) => drawHandle(p.x, p.y));
      } else if (ann.type === 'ellipse' || ann.type === 'circle') {
        const [p1, p2] = ann.points;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        drawHandle(x + w/2, y); drawHandle(x + w/2, y + h); drawHandle(x, y + h/2); drawHandle(x + w, y + h/2);
      }
    }
  });
}

// 3. 绘制正在进行的草图
function drawDrawingDraft(params: RenderParams) {
  const { ctx, currentPoints, tool, formLabel, taxonomyClasses, viewport } = params;
  if (currentPoints.length === 0) return;

  const activeClassDef = taxonomyClasses?.find((c: any) => c.name === formLabel);
  const activeColor = activeClassDef?.color || '#3B82F6';

  ctx.strokeStyle = activeColor;
  ctx.fillStyle = `${activeColor}40`; 
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]); 
  
  if (tool === 'bbox' && currentPoints.length === 2) {
    const [p1, p2] = currentPoints;
    const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    ctx.strokeRect(x, y, w, h); ctx.fillRect(x, y, w, h);
  } else if (tool === 'ellipse' && currentPoints.length === 2) {
    const [p1, p2] = currentPoints, x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (tool === 'circle' && currentPoints.length === 2) {
    const [p1, p2] = currentPoints, x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    ctx.beginPath(); ctx.arc(x + w/2, y + h/2, Math.max(w, h) / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (tool === 'polygon' || tool === 'line' || tool === 'lasso' || tool === 'freemask') {
    ctx.beginPath(); ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
    for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
    if (tool === 'polygon' || tool === 'freemask') { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
    
    if (tool !== 'lasso' && tool !== 'freemask') {
      ctx.fillStyle = activeColor; ctx.setLineDash([]); 
      currentPoints.forEach((p: any) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / viewport.zoom, 0, Math.PI * 2); ctx.fill();
      });
    }
  } else if (tool === 'point' && currentPoints.length > 0) {
    ctx.beginPath(); ctx.arc(currentPoints[0].x, currentPoints[0].y, 3 / viewport.zoom, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]); 
}

// 4. 绘制待确认弹窗状态
function drawPendingConfirm(params: RenderParams) {
  const { ctx, pendingAnnotation, formLabel, taxonomyClasses, viewport } = params;
  if (!pendingAnnotation) return;

  const activeColor = taxonomyClasses?.find((c: any) => c.name === formLabel)?.color || '#3B82F6';
  ctx.strokeStyle = activeColor;
  ctx.fillStyle = `${activeColor}40`; 
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]); 

  if (['bbox', 'ellipse', 'circle'].includes(pendingAnnotation.type)) {
    const [p1, p2] = pendingAnnotation.points;
    const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    if (pendingAnnotation.type === 'bbox') {
      ctx.strokeRect(x, y, w, h); ctx.fillRect(x, y, w, h);
    } else if (pendingAnnotation.type === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (pendingAnnotation.type === 'circle') {
      ctx.beginPath(); ctx.arc(x + w/2, y + h/2, Math.max(w, h) / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (pendingAnnotation.type === 'polygon') {
    ctx.beginPath(); ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
    for (let i = 1; i < pendingAnnotation.points.length; i++) ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (pendingAnnotation.type === 'line') {
    ctx.beginPath(); ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
    for (let i = 1; i < pendingAnnotation.points.length; i++) ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
    ctx.stroke();
  } else if (pendingAnnotation.type === 'point') {
    ctx.beginPath(); ctx.arc(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y, 3 / viewport.zoom, 0, Math.PI * 2); ctx.stroke(); 
  }
  ctx.setLineDash([]); 
}

// ==========================================
// 🌟 暴露给外部的主渲染入口
// ==========================================
export function renderCanvasScene(params: RenderParams) {
  const { canvas, ctx, theme, hoverPos, viewport, view, editorSettings } = params;
  const colors = UI_THEMES[theme] || UI_THEMES.dark;

  // 1. 初始化画布尺寸并清空
  const parent = canvas.parentElement;
  if (parent) {
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. 开启全局状态保护
  ctx.save();
  
  // 3. 执行纯粹的流水线渲染
  drawCanvasBackground(params, colors);
  drawSavedObjects(params, colors);
  drawDrawingDraft(params);
  drawPendingConfirm(params);
  // 🌟 核心：在这里显式调用准星绘制
  // 只有当鼠标不在当前 View（即正在移动）或者我们需要全视图同步时显示
  if (hoverPos && editorSettings.showCrosshair && hoverPos.viewId !== view.id) {
    drawSyncCursor(ctx, hoverPos, viewport);
  }
  // 4. 恢复全局状态
  ctx.restore();
}

// 🌟 新增：绘制同步观察标记
function drawSyncCursor(ctx: CanvasRenderingContext2D, hoverPos: {x: number, y: number} | null, viewport: any) {
  if (!hoverPos) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 235, 59, 0.8)'; // 明亮的黄色，易于观察
  ctx.lineWidth = 1 / viewport.zoom;
  
  const size = 10 / viewport.zoom; // 长度缩短一点

  ctx.beginPath();
  // 水平线
  ctx.moveTo(hoverPos.x - size, hoverPos.y);
  ctx.lineTo(hoverPos.x + size, hoverPos.y);
  // 垂直线
  ctx.moveTo(hoverPos.x, hoverPos.y - size);
  ctx.lineTo(hoverPos.x, hoverPos.y + size);
  ctx.stroke();
  
  ctx.restore();
}