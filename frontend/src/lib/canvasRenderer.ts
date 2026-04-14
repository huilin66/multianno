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
  aiPrompts?: { x: number, y: number, label: number }[];
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
// === 🌟 新增：空间几何计算工具 ===
// 根据前 3 个点计算旋转矩形的 4 个角点
function getRbboxPoints(p1: any, p2: any, p3: any) {
  if (!p3) return [p1, p2, p2, p1]; 
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [p1, p1, p1, p1];
  
  // 法线向量
  const nx = -dy / len;
  const ny = dx / len;
  
  // 计算 p3 到基准线 p1-p2 的投影距离
  const d = (p3.x - p1.x) * nx + (p3.y - p1.y) * ny;
  return [
      p1, p2,
      { x: p2.x + d * nx, y: p2.y + d * ny },
      { x: p1.x + d * nx, y: p1.y + d * ny }
  ];
}

// 绘制 3D 立方体
function drawCuboidEngine(ctx: CanvasRenderingContext2D, p1: any, p2: any, p3: any) {
  const f1 = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) };
  const f3 = { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) };
  const f2 = { x: f3.x, y: f1.y };
  const f4 = { x: f1.x, y: f3.y };

  if (!p3) {
      ctx.strokeRect(f1.x, f1.y, f3.x - f1.x, f3.y - f1.y);
      return;
  }

  // 计算偏移深度
  const vx = p3.x - f1.x;
  const vy = p3.y - f1.y;

  const b1 = { x: f1.x + vx, y: f1.y + vy };
  const b2 = { x: f2.x + vx, y: f2.y + vy };
  const b3 = { x: f3.x + vx, y: f3.y + vy };
  const b4 = { x: f4.x + vx, y: f4.y + vy };

  // 渲染后面板、前面板、连接线
  ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y); ctx.lineTo(f3.x, f3.y); ctx.lineTo(f4.x, f4.y); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f1.x, f1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f2.x, f2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f3.x, f3.y); ctx.lineTo(b3.x, b3.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f4.x, f4.y); ctx.lineTo(b4.x, b4.y); ctx.stroke();
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
      ctx.save();

      // 🌟 第一重裁剪：将整个世界的画布死死限制在原图形 A 内部！
      // 这样一来，橡皮擦 B 伸到外面的任何“尾巴 (b')”都绝对画不出来。
      ctx.beginPath(); 
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.closePath(); 
      ctx.clip(); 

      // 🌟 构建复合路径 (A + B)
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.closePath();

      if (ann.holes && ann.holes.length > 0) {
        ann.holes.forEach((hole: any) => {
          if (hole.length > 0) {
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
            ctx.closePath();
          }
        });
      }

      // 🌟 由于第一重裁剪的保护，此时的 evenodd 填充，就是完美的 A 减 B (a')
      ctx.fillStyle = isActive ? `${baseColor}60` : `${baseColor}30`;
      ctx.fill('evenodd'); 

      // 🌟 第二重裁剪：将接下来的描边也死死限制在 a' 的面积上！
      // 这意味着相交的那根线 (c) 直接被物理屏蔽了，画不出来。
      ctx.clip('evenodd'); 

      // 🌟 描边魔法：因为描边有一半的宽度会被剪裁掉，所以我们这里线宽 x 2
      ctx.lineWidth = ((isActive ? 4 : 2) / viewport.zoom) * 2;
      ctx.strokeStyle = isActive ? '#FFFFFF' : baseColor;

      // 画 A 的边 (超出 a' 面积的线段会被切掉)
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.closePath();
      ctx.stroke();

      // 画 洞 B 的边 (同理，只有留在 a' 内的那道切口会被保留)
      if (ann.holes && ann.holes.length > 0) {
        ctx.beginPath(); // 必须重新起笔
        ann.holes.forEach((hole: any) => {
          if (hole.length > 0) {
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
            ctx.closePath();
          }
        });
        ctx.stroke();
      }

      ctx.restore(); // 释放全部裁剪魔法

      // 绘制 Label 文字
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; 
      ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 6 / viewport.zoom);
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
    } else if (ann.type === 'oriented_bbox' && ann.points.length >= 2) {
      const pts = getRbboxPoints(ann.points[0], ann.points[1], ann.points[2]);
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, pts[0].x, pts[0].y - 6 / viewport.zoom);
    
    // 🌟 新增：渲染已保存的 3D立方体
    } else if (ann.type === 'cuboid' && ann.points.length >= 2) {
      drawCuboidEngine(ctx, ann.points[0], ann.points[1], ann.points[2]);
      const f1x = Math.min(ann.points[0].x, ann.points[1].x);
      const f1y = Math.min(ann.points[0].y, ann.points[1].y);
      ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, f1x, f1y - 6 / viewport.zoom);
    }

    // 绘制 Select 模式下的控制点
    if (isActive && tool === 'select') {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5 / viewport.zoom;
      const drawHandle = (hx: number, hy: number) => {
        ctx.beginPath(); ctx.arc(hx, hy, 4 / viewport.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      };

      // 1. 矩形、椭圆、圆形 (画出 4 个计算得到的包围盒角点)
      if (['bbox', 'ellipse', 'circle'].includes(ann.type) && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
        drawHandle(minX, minY); drawHandle(maxX, minY); 
        drawHandle(minX, maxY); drawHandle(maxX, maxY);
      } 
      // 2. 多边形、线段、自由线、套索、旋转框、3D框 (全部顶点都要画)
      else if (['polygon', 'line', 'lasso', 'freemask', 'oriented_bbox', 'cuboid'].includes(ann.type)) {
        ann.points.forEach((p: any) => drawHandle(p.x, p.y));

        // 如果挖了洞，把洞的顶点也画出来
        if (ann.holes && ann.holes.length > 0) {
          ann.holes.forEach((hole: any) => {
            hole.forEach((p: any) => drawHandle(p.x, p.y));
          });
        }
      } 
      // 3. 单点
      else if (ann.type === 'point' && ann.points.length > 0) {
        drawHandle(ann.points[0].x, ann.points[0].y);
      }
    }
  });
}

// 3. 绘制正在进行的草图
function drawDrawingDraft(params: RenderParams) {
  const { ctx, currentPoints, tool, formLabel, taxonomyClasses, viewport, hoverPos } = params;
  if (currentPoints.length === 0) return;

  const activeClassDef = taxonomyClasses?.find((c: any) => c.name === formLabel);
  const activeColor = activeClassDef?.color || '#3B82F6';

  ctx.strokeStyle = activeColor;
  ctx.fillStyle = `${activeColor}40`; 
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]); 

  // 只有在绘制多边形、线、切割工具时，且鼠标在当前画布内时显示
  if (hoverPos && ['polygon', 'line', 'cut', 'cutout'].includes(tool)) {
    const lastPoint = currentPoints[currentPoints.length - 1];
    ctx.save();
    // 设置预览虚线样式
    ctx.setLineDash([5 / viewport.zoom, 5 / viewport.zoom]);
    ctx.strokeStyle = tool === 'cutout' ? '#EF4444' : (tool === 'cut' ? '#F59E0B' : activeColor);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(hoverPos.x, hoverPos.y);
    ctx.stroke();
    ctx.restore();
  }

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
  } else if (tool === 'polygon' || tool === 'line' || tool === 'lasso' || tool === 'freemask' || tool === 'cut' || tool === 'cutout') {
      ctx.beginPath(); ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      
      if (tool === 'polygon' || tool === 'freemask' || tool === 'cutout') { 
        ctx.closePath(); 
      }
      
      // 🌟 动态草图样式：Cutout 为红色，Cut 为黄色，其他为默认分类色
      if (tool === 'cutout') {
        ctx.strokeStyle = '#EF4444'; // Red
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.fill();
      } else if (tool === 'cut') {
        ctx.strokeStyle = '#F59E0B'; // Amber/Yellow
      } else if (tool === 'polygon' || tool === 'freemask') {
        ctx.fill();
      }
      
      ctx.stroke();
      
      if (tool !== 'lasso' && tool !== 'freemask' && tool !== 'cut') {
        ctx.fillStyle = tool === 'cutout' ? '#EF4444' : activeColor; 
        ctx.setLineDash([]); 
        currentPoints.forEach((p: any) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 4 / viewport.zoom, 0, Math.PI * 2); ctx.fill();
        });
      }
  } else if (tool === 'point' && currentPoints.length > 0) {
    ctx.beginPath(); ctx.arc(currentPoints[0].x, currentPoints[0].y, 3 / viewport.zoom, 0, Math.PI * 2); ctx.stroke();
  } else if (tool === 'rbbox' && currentPoints.length >= 2) {
      const pts = getRbboxPoints(currentPoints[0], currentPoints[1], currentPoints[2]);
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      
      // 用亮色高亮显示基准线
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.setLineDash([]); ctx.beginPath(); 
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); ctx.restore();

  // 🌟 新增：绘制3D立方体草图
  } else if (tool === 'cuboid' && currentPoints.length >= 2) {
      drawCuboidEngine(ctx, currentPoints[0], currentPoints[1], currentPoints[2]);
  }

  if (params.tool === 'ai_anno' && params.aiPrompts && params.aiPrompts.length > 0) {
    params.aiPrompts.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 / viewport.zoom, 0, Math.PI * 2);
      ctx.fillStyle = pt.label === 1 ? '#10B981' : '#EF4444'; // 正样本绿，负样本红
      ctx.fill();
      ctx.lineWidth = 1.5 / viewport.zoom;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    });
  }
  ctx.setLineDash([]); 
}

// 4. 绘制待确认弹窗状态
// 位于 src/lib/canvasRenderer.ts
function drawPendingConfirm(params: RenderParams) {
  const { ctx, pendingAnnotation, formLabel, taxonomyClasses, viewport } = params;
  if (!pendingAnnotation) return;

  // 🌟 核心增强：识别 AI 预览状态
  // 当 pendingAnnotation.id 为 'ai_preview' 时，使用专用高对比度蓝色
  const isAI = pendingAnnotation.id === 'ai_preview';
  const activeColor = isAI 
    ? '#3B82F6' 
    : (taxonomyClasses?.find((c: any) => c.name === formLabel)?.color || '#3B82F6');

  ctx.save();
  ctx.strokeStyle = activeColor;
  // AI 预览使用稍深一点的填充色，普通标注预览使用更淡的颜色
  ctx.fillStyle = isAI ? 'rgba(59, 130, 246, 0.45)' : `${activeColor}40`; 
  ctx.lineWidth = (isAI ? 3 : 2) / viewport.zoom;
  
  // AI 预览边缘使用实线，普通绘制预览使用虚线
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

  // 1. 渲染基础形状 (BBox, Ellipse, Circle)
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
  } 
  // 2. 渲染多边形 (AI 分割结果通常为此类型)
  else if (pendingAnnotation.type === 'polygon' && pendingAnnotation.points.length > 0) {
    ctx.beginPath(); 
    ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
    for (let i = 1; i < pendingAnnotation.points.length; i++) {
      ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
    }
    ctx.closePath(); 
    ctx.fill(); 
    ctx.stroke();
  } 
  // 3. 渲染线段
  else if (pendingAnnotation.type === 'line' && pendingAnnotation.points.length > 0) {
    ctx.beginPath(); 
    ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
    for (let i = 1; i < pendingAnnotation.points.length; i++) {
      ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
    }
    ctx.stroke();
  } 
  // 4. 渲染单点
  else if (pendingAnnotation.type === 'point' && pendingAnnotation.points.length > 0) {
    ctx.beginPath(); ctx.arc(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y, 3 / viewport.zoom, 0, Math.PI * 2); ctx.stroke(); 
  } 
  // 5. 渲染旋转框 (RBox)
  else if (pendingAnnotation.type === 'oriented_bbox' && pendingAnnotation.points.length >= 2) {
    const pts = getRbboxPoints(pendingAnnotation.points[0], pendingAnnotation.points[1], pendingAnnotation.points[2]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } 
  // 6. 渲染 3D 立方体
  else if (pendingAnnotation.type === 'cuboid' && pendingAnnotation.points.length >= 2) {
    drawCuboidEngine(ctx, pendingAnnotation.points[0], pendingAnnotation.points[1], pendingAnnotation.points[2]);
  }

  ctx.restore();
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