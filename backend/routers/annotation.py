import json
import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models import SaveAnnotationRequest
from utils.image_io import read_metadata
from utils.logging_config import get_logger, shorten

router = APIRouter(prefix="/api/annotations", tags=["Annotations"])
logger = get_logger("annotation")


@router.post("/save")
async def save_annotation(request: SaveAnnotationRequest):
    logger.info(
        "ANNOTATION_SAVE_START dir=%s file=%s image=%s keys=%s shapes=%d",
        shorten(request.save_dir, 1500),
        request.file_name,
        shorten(request.image_path, 1500) if request.image_path else "-",
        list(request.content.keys()),
        len(request.content.get("shapes", []))
        if isinstance(request.content.get("shapes"), list)
        else -1,
    )
    try:
        os.makedirs(request.save_dir, exist_ok=True)
        file_path = os.path.join(request.save_dir, request.file_name)

        content_to_save = dict(request.content)
        existing_content = None
        if os.path.isfile(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    loaded_content = json.load(f)
                if isinstance(loaded_content, dict):
                    existing_content = loaded_content
            except Exception:
                logger.exception(
                    "ANNOTATION_EXISTING_READ_ERROR path=%s",
                    shorten(file_path, 1500),
                )

        if existing_content is not None:
            # 已存在的原生 JSON 是图像元数据的唯一来源。保存标注时只更新
            # shapes，保留 imageWidth/imageHeight、imageNameMain 以及其他
            # 未知字段，避免文件夹级 metadata 覆盖每张图的真实信息。
            content_to_save = existing_content
            content_to_save["shapes"] = request.content.get("shapes", [])
            logger.info(
                "ANNOTATION_SAVE_MERGE file=%s mode=shapes_only dimensions=%sx%s",
                request.file_name,
                existing_content.get("imageWidth", "-"),
                existing_content.get("imageHeight", "-"),
            )
        else:
            # 新建 JSON 时没有可复用的原生元数据，才读取当前主图像作为
            # 尺寸兜底；这也覆盖首次手工绘制后第一次保存的场景。
            if request.image_path:
                if not os.path.isfile(request.image_path):
                    logger.warning(
                        "ANNOTATION_DIMENSIONS_IMAGE_MISSING file=%s image=%s",
                        request.file_name,
                        shorten(request.image_path, 1500),
                    )
                else:
                    try:
                        image_meta = read_metadata(
                            request.image_path,
                            raw_profile=request.image_raw_profile,
                        )
                        width = int(image_meta.get("width") or 0)
                        height = int(image_meta.get("height") or 0)
                        if width > 0 and height > 0:
                            content_to_save["imageWidth"] = width
                            content_to_save["imageHeight"] = height
                            content_to_save["imageNameMain"] = os.path.basename(request.image_path)
                            logger.info(
                                "ANNOTATION_DIMENSIONS_SYNC file=%s dimensions=%sx%s source=image_new_json",
                                request.file_name,
                                width,
                                height,
                            )
                        else:
                            logger.warning(
                                "ANNOTATION_DIMENSIONS_INVALID file=%s image=%s metadata=%s",
                                request.file_name,
                                shorten(request.image_path, 1500),
                                image_meta,
                            )
                    except Exception:
                        # 图像元数据读取失败时保留原 payload，避免一次图像
                        # 读取问题阻断标注保存；同时留下完整日志便于定位。
                        logger.exception(
                            "ANNOTATION_DIMENSIONS_ERROR file=%s image=%s",
                            request.file_name,
                            shorten(request.image_path, 1500),
                        )

        # 极速覆盖写入本地 JSON
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(content_to_save, f, indent=2, ensure_ascii=False)

        logger.info("ANNOTATION_SAVE_END path=%s", shorten(file_path, 1500))
        return {"status": "success", "file": file_path}
    except Exception as e:
        logger.exception("ANNOTATION_SAVE_ERROR path=%s error=%s", file_path, e)
        return JSONResponse(status_code=500, content={"error": str(e)})
