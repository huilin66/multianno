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
    image_data: Optional[str] = None
    image_size: Optional[int] = None
    crop_x: Optional[int] = 0
    crop_y: Optional[int] = 0
    crop_w: Optional[int] = 0
    crop_h: Optional[int] = 0


class SAMPoint(BaseModel):
    x: float
    y: float
    label: int


class SAMInteractiveRequest(BaseModel):
    image_path: str
    points: Optional[List[SAMPoint]] = None
    box: Optional[List[float]] = None
    conf: Optional[float] = 0.25
    image_size: Optional[int] = 644


class SAMAutoRequest(BaseModel):
    image_path: str
    texts: List[str]
    conf: Optional[float] = 0.25
    image_size: Optional[int] = 644


class AIConfigRequest(BaseModel):
    model_path: str
    model_type: str
    confidence: float


class StatRequest(BaseModel):
    save_dirs: List[str]
    force_refresh: Optional[bool] = False


class ApplyAttributeRequest(BaseModel):
    save_dirs: List[str]
    attribute_name: str
    new_default: str
    old_default: Optional[str] = None


class MkdirRequest(BaseModel):
    path: str
    name: str


class ViewExportConfig(BaseModel):
    suffix: str = ""
    extension: str = ".tif"
    subdir: str = "images"
    keep_original: bool = False
    folder_path: str = ""
    bands: list[int] = [1, 2, 3]
    transform: dict = {}


class ExportRequest(BaseModel):
    source_dirs: list[str]
    target_dir: str
    task_type: str
    format: str
    selected_classes: list[str] = []
    allowed_shapes: list[str] = []
    custom_suffix: str = ""
    extension: str = ".txt"
    generate_report: bool = True
    stems: list[str] = []
    export_mode: str = "annotation"

    anno_subdir: str = "labels"
    view_configs: list[ViewExportConfig] = []
    split: dict = {}
    random_seed: int = 42
    split_files: dict = {}


class ImportRequest(BaseModel):
    source_path: str
    target_dir: str
    format: str
    merge_strategy: str = "append"
    classes_file: Optional[str] = None
    custom_suffix: str = ""
    import_zero_class: bool = False
    coco_mode: str = "polygon"


class ProjectMetaPayload(BaseModel):
    file_path: str
    content: dict


class VisPreviewRequest(BaseModel):
    stem: str
    source_type: str
    view_configs: Optional[List[Dict[str, Any]]] = None
    local_configs: Optional[List[Dict[str, Any]]] = None
    render_settings: Dict[str, Any]
    anno_config: Optional[Dict[str, Any]] = None
    pred_configs: Optional[List[Dict[str, Any]]] = None
    export_config: Optional[Dict[str, Any]] = None


class VisExportRequest(BaseModel):
    all_stems: List[str]
    source_type: str
    view_configs: Optional[List[Dict[str, Any]]] = None
    local_configs: Optional[List[Dict[str, Any]]] = None
    render_settings: Dict[str, Any]
    export_config: Dict[str, Any]
    anno_config: Optional[Dict[str, Any]] = None
    pred_configs: Optional[List[Dict[str, Any]]] = None


class RepairRequest(BaseModel):
    save_dirs: List[str]
    repair_types: List[str] = ["stem"]
    stems: List[str]


class MergeRule(BaseModel):
    old_name: str
    new_name: str
    attribute_name: str
    attribute_value: str


class MergeWithAttributeRequest(BaseModel):
    save_dirs: List[str]
    merges: List[MergeRule]


class CheckJsonRequest(BaseModel):
    path: str


class InferSuffixRequest(BaseModel):
    folders: List[FolderPayload]


class InferSuffixResult(BaseModel):
    folder_index: int
    suffix: str
    extension: str
    sample_file: str
    total_files: int
