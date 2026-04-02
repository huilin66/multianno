import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models import SaveAnnotationRequest

router = APIRouter(prefix="/api/annotations", tags=["Annotations"])


@router.post("/save")
async def save_annotation(request: SaveAnnotationRequest):
    try:
        os.makedirs(request.save_dir, exist_ok=True)
        file_path = os.path.join(request.save_dir, request.file_name)

        # 极速覆盖写入本地 JSON
        with open(file_path, "w", encoding="utf-8") as f:
            import json

            json.dump(request.content, f, indent=2, ensure_ascii=False)

        return {"status": "success", "file": file_path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
