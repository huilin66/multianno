from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class FolderPayload(BaseModel):
    path: str
    suffix: Optional[str] = ""


class AnalyzeRequest(BaseModel):
    folders: List[FolderPayload]


class StatsRequest(BaseModel):
    save_dirs: List[str]
    target_class: str


class SaveAnnotationRequest(BaseModel):
    save_dir: str
    file_name: str
    content: Dict[str, Any]


class BatchMergeClassRequest(BaseModel):
    save_dirs: List[str]
    old_names: List[str]
    new_name: str


class BatchDeleteClassRequest(BaseModel):
    save_dirs: List[str]
    class_name: str
    hard_delete: bool


class BatchDeleteAttributeRequest(BaseModel):
    save_dirs: List[str]
    attribute_name: str


class SAMInitRequest(BaseModel):
    image_path: Optional[str] = None
    image_data: Optional[str] = None  # 接收 base64 字符串
    image_size: Optional[int] = None  # 🌟 修复：补上前端传来的 image_size 字段！
    crop_x: Optional[int] = 0
    crop_y: Optional[int] = 0
    crop_w: Optional[int] = 0
    crop_h: Optional[int] = 0


class SAMPoint(BaseModel):
    x: float
    y: float
    label: int  # 1: 正样本(绿点), 0: 负样本(红点)


class SAMInteractiveRequest(BaseModel):
    image_path: str
    points: Optional[List[SAMPoint]] = None
    box: Optional[List[float]] = None
    conf: Optional[float] = 0.25
    image_size: Optional[int] = 644  # 🌟 修复：让 predict 接口也能接收尺寸


class SAMAutoRequest(BaseModel):
    image_path: str
    texts: List[str]
    conf: Optional[float] = 0.25
    image_size: Optional[int] = 644  # 🌟 修复：加上图片尺寸


class AIConfigRequest(BaseModel):
    model_path: str
    model_type: str
    confidence: float


class StatRequest(BaseModel):
    save_dirs: List[str]
    force_refresh: Optional[bool] = False  # 🌟 新增强制刷新参数


class ApplyAttributeRequest(BaseModel):
    save_dirs: List[str]
    attribute_name: str
    new_default: str
    old_default: Optional[str] = None


class ExchangeRequest(BaseModel):
    source_dirs: List[str]
    target_dir: str
    format: str
    mode: str
    generate_report: bool = True  # 🌟 新增可选项，默认 True


class MkdirRequest(BaseModel):
    path: str
    name: str
