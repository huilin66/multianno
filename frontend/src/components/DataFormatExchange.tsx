import React, { useState, useRef, useEffect } from 'react';
import { useStore, Annotation } from '../store/useStore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

import { 
  Menu, Layers, Settings, Download, FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, CheckCircle2,
  Eye, EyeOff, Maximize, Move, Save, MousePointer2, Square, Hexagon, Database, Image as ImageIcon,RotateCcw,Zap,
  AlertTriangle, FileJson, FileText, Hand, Settings2, SplitSquareHorizontal // 新增这几个
} from 'lucide-react';


export function DataFormatExchange() {
  const { annotations, views, folders } = useStore();

  const handleExportJSON = () => {
    const data = {
      projectMeta: {
        folders,
        views
      },
      annotations
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multianno_export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportYOLO = () => {
    // Mock YOLO export
    // YOLO format: <class> <x_center> <y_center> <width> <height>
    // Normalized by image width/height (assuming 400x400 for mock)
    const imgW = 400;
    const imgH = 400;
    
    let yoloText = '';
    annotations.forEach(ann => {
      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const xMin = Math.min(p1.x, p2.x);
        const yMin = Math.min(p1.y, p2.y);
        const xMax = Math.max(p1.x, p2.x);
        const yMax = Math.max(p1.y, p2.y);
        
        const w = xMax - xMin;
        const h = yMax - yMin;
        const xCenter = xMin + w / 2;
        const yCenter = yMin + h / 2;
        
        // Normalize
        const nx = xCenter / imgW;
        const ny = yCenter / imgH;
        const nw = w / imgW;
        const nh = h / imgH;
        
        yoloText += `0 ${nx.toFixed(6)} ${ny.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}\n`;
      }
    });

    const blob = new Blob([yoloText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'labels.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-6 overflow-y-auto max-w-4xl mx-auto">
      <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important: Main-Centric Export</AlertTitle>
        <AlertDescription>
          Export results are strictly based on the Main View coordinate system. 
          For multimodal training, you must use the mapping parameters in the JSON export to align other modalities.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              MultiAnno JSON
            </CardTitle>
            <CardDescription>
              Complete project state including metadata, view alignments, and raw annotation coordinates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportJSON} className="w-full">
              <Download className="w-4 h-4 mr-2" /> Export JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              YOLO Format
            </CardTitle>
            <CardDescription>
              Normalized bounding box coordinates for YOLO training. (Only exports BBox annotations).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportYOLO} variant="secondary" className="w-full">
              <Download className="w-4 h-4 mr-2" /> Export YOLO TXT
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              COCO Format
            </CardTitle>
            <CardDescription>
              Standard COCO JSON format for object detection and instance segmentation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline" className="w-full">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
