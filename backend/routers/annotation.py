import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models import SaveAnnotationRequest
from utils.logging_config import get_logger, shorten

router = APIRouter(prefix="/api/annotations", tags=["Annotations"])
logger = get_logger("annotation")


@router.post("/save")
async def save_annotation(request: SaveAnnotationRequest):
    logger.info(
        "ANNOTATION_SAVE_START dir=%s file=%s keys=%s shapes=%d",
        shorten(request.save_dir, 1500),
        request.file_name,
        list(request.content.keys()),
        len(request.content.get("shapes", []))
        if isinstance(request.content.get("shapes"), list)
        else -1,
    )
    try:
        os.makedirs(request.save_dir, exist_ok=True)
        file_path = os.path.join(request.save_dir, request.file_name)

        # 极速覆盖写入本地 JSON
        with open(file_path, "w", encoding="utf-8") as f:
            import json

            json.dump(request.content, f, indent=2, ensure_ascii=False)

        logger.info("ANNOTATION_SAVE_END path=%s", shorten(file_path, 1500))
        return {"status": "success", "file": file_path}
    except Exception as e:
        logger.exception("ANNOTATION_SAVE_ERROR path=%s error=%s", file_path, e)
        return JSONResponse(status_code=500, content={"error": str(e)})
