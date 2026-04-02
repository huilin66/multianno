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
