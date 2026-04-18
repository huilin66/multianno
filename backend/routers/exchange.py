import os

from fastapi import APIRouter, HTTPException
from models import ExchangeRequest
from utils.format_converters import export_to_coco, export_to_multianno, export_to_yolo

router = APIRouter(prefix="/api/exchange", tags=["Data Exchange"])


@router.post("/process")
async def process_data_exchange(req: ExchangeRequest):
    # 确保目标文件夹存在
    if not os.path.exists(req.target_dir):
        try:
            os.makedirs(req.target_dir)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无法创建目标目录: {str(e)}")

    if req.mode == "export":
        if req.format == "multianno":
            return await export_to_multianno(req)
        elif req.format == "yolo":
            return await export_to_yolo(req)
        elif req.format == "coco":
            return await export_to_coco(req)
        else:
            raise HTTPException(status_code=400, detail="不支持的导出格式")
    else:
        # TODO: import_data 逻辑
        return {"status": "success", "message": "Import structure ready."}


@router.get("/read_text")
async def read_text_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
