import asyncio
import json
import os
from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from models import (
    AnalyzeRequest,
    CheckJsonRequest,
    DetectAnnotationSourcesRequest,
    InferSuffixRequest,
    ProjectMetaPayload,
    StatsRequest,
)
from utils.image_io import (
    RawDependencyError,
    SUPPORTED_IMAGE_EXTS,
    clear_image_cache,
    encode_jpeg_rgb,
    find_image_path,
    is_raw_image,
    is_supported_image,
    read_image_cached,
    read_metadata,
    render_preview_rgb,
    sample_pixel,
)
from utils.logging_config import get_logger, shorten

router = APIRouter(prefix="/api", tags=["Project"])
logger = get_logger("project")

ANNOTATION_DIR_NAMES = {
    "anno",
    "annos",
    "annotation",
    "annotations",
    "gt",
    "ground_truth",
    "label",
    "labels",
    "mask",
    "masks",
}
ANNOTATION_CLASS_FILE_NAMES = {"class.txt", "classes.txt", "classes.names", "labels.txt"}
ANNOTATION_ATTRIBUTE_FILE_NAMES = {
    "attribute.yaml",
    "attributes.yaml",
    "attribute.yml",
    "attributes.yml",
}
ANNOTATION_SCAN_EXTENSIONS = {".json", ".txt", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


def _path_key(path: str) -> str:
    return os.path.normcase(os.path.abspath(path))


def _path_is_under(path: str, parent: str) -> bool:
    try:
        return os.path.commonpath([_path_key(path), _path_key(parent)]) == _path_key(parent)
    except ValueError:
        return False


def _is_annotation_excluded(path: str, workspace_path: str) -> bool:
    return bool(workspace_path and _path_is_under(path, workspace_path))


def _read_json_preview(path: str) -> dict | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else None
    except (OSError, ValueError, UnicodeDecodeError):
        return None


def _looks_like_yolo_file(path: str) -> tuple[bool, int]:
    valid_lines = 0
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                parts = raw_line.strip().split()
                if not parts:
                    continue
                if len(parts) < 5:
                    return False, 0
                int(parts[0])
                for value in parts[1:]:
                    float(value)
                valid_lines += 1
        return True, valid_lines
    except (OSError, ValueError, UnicodeDecodeError):
        return False, 0


def _find_nearby_file(path: str, names: set[str]) -> str:
    current = os.path.dirname(path) if os.path.isfile(path) else path
    for _ in range(3):
        try:
            for entry in os.scandir(current):
                if entry.is_file() and entry.name.casefold() in names:
                    return entry.path
        except (OSError, PermissionError):
            return ""
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return ""


def _annotation_candidate(
    source_path: str,
    format_name: str,
    source_files: list[str],
    stems: list[str],
    classes_file: str = "",
    attributes_file: str = "",
    shape_count: int = 0,
    source_file_count: int | None = None,
) -> dict:
    source_stems = {
        Path(file_path).stem.casefold()
        for file_path in source_files
        if Path(file_path).stem
    }
    known_stems = {str(stem).casefold() for stem in stems if str(stem).strip()}
    matched_count = len(source_stems & known_stems) if known_stems else len(source_stems)
    directory_name = os.path.basename(source_path.rstrip("/\\"))
    if os.path.isfile(source_path):
        directory_name = os.path.basename(os.path.dirname(source_path))
    directory_bonus = 25 if directory_name.casefold() in ANNOTATION_DIR_NAMES else 0
    file_count = source_file_count if source_file_count is not None else len(source_files)
    match_ratio = round(matched_count / max(1, len(known_stems)), 4) if known_stems else 0
    classes_file = classes_file or _find_nearby_file(source_path, ANNOTATION_CLASS_FILE_NAMES)
    attributes_file = attributes_file or _find_nearby_file(source_path, ANNOTATION_ATTRIBUTE_FILE_NAMES)

    return {
        "source_path": os.path.abspath(source_path).replace("\\", "/"),
        "format": format_name,
        "task_type": "image_segmentation" if format_name == "mask" else "object_detection",
        "extension": ".txt" if format_name == "yolo" else ".png" if format_name == "mask" else ".json",
        "classes_file": os.path.abspath(classes_file).replace("\\", "/") if classes_file else "",
        "attributes_file": os.path.abspath(attributes_file).replace("\\", "/") if attributes_file else "",
        "source_file_count": file_count,
        "matched_count": matched_count,
        "shape_count": shape_count,
        "match_ratio": match_ratio,
        "sample_files": [os.path.basename(path) for path in source_files[:3]],
        "score": matched_count * 100 + directory_bonus + min(file_count, 50),
    }


def _scan_annotation_directory(path: str, stems: list[str]) -> list[dict]:
    try:
        entries = [entry for entry in os.scandir(path) if entry.is_file()]
    except (OSError, PermissionError):
        return []

    files_by_ext: dict[str, list[str]] = {}
    for entry in entries:
        suffix = Path(entry.name).suffix.casefold()
        if suffix in ANNOTATION_SCAN_EXTENSIONS:
            files_by_ext.setdefault(suffix, []).append(entry.path)

    lower_names = {entry.name.casefold(): entry.path for entry in entries}
    classes_file = next(
        (lower_names[name] for name in ANNOTATION_CLASS_FILE_NAMES if name in lower_names),
        "",
    )
    attributes_file = next(
        (
            lower_names[name]
            for name in ANNOTATION_ATTRIBUTE_FILE_NAMES
            if name in lower_names
        ),
        "",
    )
    candidates = []

    yolo_files = [
        file_path
        for file_path in files_by_ext.get(".txt", [])
        if os.path.basename(file_path).casefold() not in ANNOTATION_CLASS_FILE_NAMES
        and os.path.basename(file_path).casefold() != "attributes.txt"
    ]
    yolo_shape_count = 0
    yolo_valid_files = []
    for file_path in yolo_files:
        valid, count = _looks_like_yolo_file(file_path)
        if valid:
            yolo_valid_files.append(file_path)
            yolo_shape_count += count
    if yolo_valid_files:
        candidates.append(
            _annotation_candidate(
                path,
                "yolo",
                yolo_valid_files,
                stems,
                classes_file,
                attributes_file,
                yolo_shape_count,
            )
        )

    multianno_files = []
    multianno_shape_count = 0
    for file_path in files_by_ext.get(".json", []):
        if os.path.basename(file_path).casefold().endswith("_meta.json"):
            continue
        data = _read_json_preview(file_path)
        if isinstance(data, dict) and isinstance(data.get("shapes"), list):
            multianno_files.append(file_path)
            multianno_shape_count += len(data["shapes"])
    if multianno_files:
        candidates.append(
            _annotation_candidate(
                path,
                "multianno",
                multianno_files,
                stems,
                classes_file,
                attributes_file,
                multianno_shape_count,
            )
        )

    mask_files = files_by_ext.get(".png", []) + files_by_ext.get(".jpg", [])
    mask_files += files_by_ext.get(".jpeg", []) + files_by_ext.get(".tif", [])
    mask_files += files_by_ext.get(".tiff", []) + files_by_ext.get(".bmp", [])
    if mask_files and os.path.basename(path.rstrip("/\\")).casefold() in {"mask", "masks"}:
        candidates.append(
            _annotation_candidate(
                path,
                "mask",
                mask_files,
                stems,
                classes_file,
                attributes_file,
                0,
            )
        )

    return candidates


def _scan_coco_file(path: str, stems: list[str]) -> dict | None:
    data = _read_json_preview(path)
    if not isinstance(data, dict):
        return None
    images = data.get("images")
    annotations = data.get("annotations")
    if not isinstance(images, list) or not isinstance(annotations, list):
        return None
    image_names = [
        os.path.join(os.path.dirname(path), str(image.get("file_name", "")))
        for image in images
        if isinstance(image, dict) and image.get("file_name")
    ]
    return _annotation_candidate(
        path,
        "coco",
        image_names,
        stems,
        shape_count=len(annotations),
        source_file_count=len(images),
    )


def _discover_annotation_sources(request: DetectAnnotationSourcesRequest) -> list[dict]:
    workspace_path = request.workspace_path or ""
    roots: set[str] = set()
    candidate_dirs: set[str] = set()
    candidate_files: set[str] = set()

    for raw_folder in request.image_folders:
        folder = os.path.abspath(raw_folder)
        if not os.path.isdir(folder):
            continue
        current = folder
        for _ in range(3):
            roots.add(current)
            parent = os.path.dirname(current)
            if parent == current:
                break
            current = parent

    for root in roots:
        try:
            entries = list(os.scandir(root))
        except (OSError, PermissionError):
            continue
        for entry in entries:
            if entry.is_dir() and entry.name.casefold() in ANNOTATION_DIR_NAMES:
                candidate_dirs.add(entry.path)
            elif entry.is_file() and entry.name.casefold().endswith(".json"):
                candidate_files.add(entry.path)

        root_name = os.path.basename(root.rstrip("/\\")).casefold()
        has_flat_annotation_files = any(
            entry.is_file() and Path(entry.name).suffix.casefold() in {".txt", ".json"}
            for entry in entries
        )
        if root_name in ANNOTATION_DIR_NAMES or has_flat_annotation_files:
            candidate_dirs.add(root)

    candidates: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for directory in sorted(candidate_dirs):
        if _is_annotation_excluded(directory, workspace_path):
            continue
        for candidate in _scan_annotation_directory(directory, request.stems):
            key = (_path_key(candidate["source_path"]), candidate["format"])
            if key not in seen:
                seen.add(key)
                candidates.append(candidate)

    for file_path in sorted(candidate_files):
        if _is_annotation_excluded(file_path, workspace_path):
            continue
        candidate = _scan_coco_file(file_path, request.stems)
        if candidate is None:
            continue
        key = (_path_key(candidate["source_path"]), candidate["format"])
        if key not in seen:
            seen.add(key)
            candidates.append(candidate)

    candidates.sort(
        key=lambda candidate: (
            -candidate["score"],
            -candidate["matched_count"],
            candidate["source_path"].casefold(),
        )
    )
    return candidates[:8]


def _parse_json_query(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def calculate_list_stats(*lists):
    """
    计算多个列表的交集个数以及每个列表不在交集中的元素个数

    参数:
    *lists: 任意数量的列表

    返回:
    dict: 包含交集信息和各列表独立元素信息的字典
    """
    if not lists:
        return {"intersection_count": 0, "list_stats": {}}

    # 将列表转换为集合
    sets = [set(lst) for lst in lists]

    # 计算交集
    intersection_set = set.intersection(*sets) if len(sets) > 1 else sets[0]

    # 计算每个列表不在交集中的元素个数
    list_stats = {}
    for i, (lst, s) in enumerate(zip(lists, sets)):
        # 不在交集中的元素 = 列表总元素数 - 在交集中的元素数
        unique_count = len(s - intersection_set)
        list_stats[f"list_{i}"] = {
            "total_count": len(lst),
            "unique_count": unique_count,
            "in_intersection_count": len(s & intersection_set),
        }

    return {
        "intersection_elements": list(intersection_set),
        "list_stats": list_stats,
    }


@router.post("/stats/project")
async def get_project_stats(req: StatsRequest):
    logger.info(
        "PROJECT_STATS_REQUEST save_dirs=%d target_class=%s force_refresh=%s",
        len(req.save_dirs),
        req.target_class,
        req.force_refresh,
    )

    async def event_generator():
        started = perf_counter()
        logger.info("PROJECT_STATS_START")
        all_json_files = []
        # 1. 扫描所有目录下的 json 文件 (排除 meta.json)
        for d in req.save_dirs:
            if os.path.exists(d):
                for root, _, files in os.walk(d):
                    for f in files:
                        if f.endswith(".json") and not f.endswith("_meta.json"):
                            all_json_files.append(os.path.join(root, f))

        total_files = len(all_json_files)
        logger.info(
            "PROJECT_STATS_SCAN_END files=%d save_dirs=%s",
            total_files,
            shorten(req.save_dirs, 1500),
        )
        if total_files == 0:
            yield (
                json.dumps(
                    {
                        "type": "result",
                        "data": {"shapesCount": {}, "total": 0, "fileList": []},
                    }
                )
                + "\n"
            )
            return

        shapes_count = {}
        total_objects = 0
        file_list = []

        # 2. 遍历读取文件并统计
        for i, file_path in enumerate(all_json_files):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if "shapes" in data and isinstance(data["shapes"], list):
                    stem = data.get(
                        "stem", os.path.splitext(os.path.basename(file_path))[0]
                    )
                    file_shapes_for_target = {}

                    for shape in data["shapes"]:
                        s_type = shape.get("shape_type", "polygon")
                        label = shape.get("label", "")

                        # 统计全局所有图形的总数
                        shapes_count[s_type] = shapes_count.get(s_type, 0) + 1
                        total_objects += 1

                        # 统计目标类别的分布
                        if label == req.target_class:
                            file_shapes_for_target[s_type] = (
                                file_shapes_for_target.get(s_type, 0) + 1
                            )

                    for s_type, count in file_shapes_for_target.items():
                        file_list.append(
                            {"stem": stem, "shape": s_type, "count": count}
                        )
            except Exception:
                logger.exception(
                    "PROJECT_STATS_FILE_ERROR index=%d/%d path=%s",
                    i + 1,
                    total_files,
                    shorten(file_path, 1500),
                )

            # 3. 每处理 10 个文件，或者处理到最后一个时，推送一次进度
            if (i + 1) % 10 == 0 or (i + 1) == total_files:
                yield (
                    json.dumps(
                        {"type": "progress", "current": i + 1, "total": total_files}
                    )
                    + "\n"
                )
                logger.info(
                    "PROJECT_STATS_PROGRESS current=%d total=%d objects=%d",
                    i + 1,
                    total_files,
                    total_objects,
                )
                await asyncio.sleep(0.01)  # 让出事件循环，确保数据实时发送

        # 4. 循环结束，推送最终结果
        result_data = {
            "shapesCount": shapes_count,
            "total": total_objects,
            "fileList": file_list,
        }
        logger.info(
            "PROJECT_STATS_END files=%d objects=%d duration_ms=%.1f",
            total_files,
            total_objects,
            (perf_counter() - started) * 1000,
        )
        yield json.dumps({"type": "result", "data": result_data}) + "\n"

    # 使用 application/x-ndjson 格式返回流
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post("/project/analyze")
async def analyze_project(request: AnalyzeRequest):
    started = perf_counter()
    logger.info("PROJECT_ANALYZE_START folders=%d", len(request.folders))
    analysis_results = []
    stem_list = []
    folder_files_map = {}

    for item in request.folders:
        folder_path = item.path
        raw_suffix = item.suffix.strip() if item.suffix else ""
        logger.info(
            "PROJECT_ANALYZE_FOLDER_START path=%s suffix=%s",
            shorten(folder_path, 1500),
            item.suffix or "-",
        )

        # 🌟 核心修复：智能清理用户输入的后缀！
        # 如果用户在界面上输入了带有扩展名的后缀 (比如 "_V.JPG" 或 "_T.tif")
        # 我们必须把扩展名剥离掉，只保留纯后缀 (变成 "_V" 或 "_T")
        clean_suffix = raw_suffix
        for ext in SUPPORTED_IMAGE_EXTS:
            # 忽略大小写进行匹配
            if clean_suffix.lower().endswith(ext):
                clean_suffix = clean_suffix[: -len(ext)]
                break

        if not os.path.exists(folder_path):
            logger.warning(
                "PROJECT_ANALYZE_FOLDER_MISSING path=%s",
                shorten(folder_path, 1500),
            )
            continue

        valid_stems = []
        stem_to_file = {}
        first_file_path = None

        for f in os.listdir(folder_path):
            if is_supported_image(f):
                raw_stem = Path(f).stem

                # 🌟 剥离干净的后缀，得到真正的 stem
                if clean_suffix and raw_stem.endswith(clean_suffix):
                    clean_stem = raw_stem[: -len(clean_suffix)]
                else:
                    clean_stem = raw_stem

                valid_stems.append(clean_stem)
                stem_to_file[clean_stem] = f  # 记录真实文件名

                if first_file_path is None:
                    first_file_path = os.path.join(folder_path, f)

        if not valid_stems:
            logger.warning(
                "PROJECT_ANALYZE_FOLDER_EMPTY path=%s",
                shorten(folder_path, 1500),
            )
            continue

        stem_list.append(valid_stems)
        folder_files_map[folder_path] = stem_to_file

        raw_profile = getattr(item, "rawProfile", None)
        try:
            image_meta = read_metadata(first_file_path, raw_profile=raw_profile)
        except Exception as e:
            logger.exception(
                "PROJECT_ANALYZE_METADATA_ERROR path=%s error=%s",
                shorten(first_file_path, 1500),
                e,
            )
            image_meta = {
                "width": 0,
                "height": 0,
                "bands": 1,
                "dtype": "RAW unavailable" if is_raw_image(first_file_path) else "unknown",
                "isRaw": False,
            }
        meta = {
            "folderPath": folder_path,
            "width": image_meta["width"],
            "height": image_meta["height"],
            "bands": image_meta["bands"],
            "dtype": image_meta["dtype"],
            "isRaw": image_meta.get("isRaw", False),
            "raw": image_meta.get("raw", {}),
            "fileCount": len(valid_stems),
        }
        analysis_results.append(meta)
        logger.info(
            "PROJECT_ANALYZE_FOLDER_END path=%s images=%d dimensions=%sx%s",
            shorten(folder_path, 1500),
            len(valid_stems),
            meta["width"],
            meta["height"],
        )

    # 计算交集
    intersection_stats = calculate_list_stats(*stem_list)
    common_stems = sorted(intersection_stats.get("intersection_elements", []))
    list_stats = intersection_stats.get("list_stats", {})

    for i in range(len(analysis_results)):
        analysis_results[i]["group_success"] = len(common_stems)
        current_list_stat = list_stats.get(f"list_{i}", {})
        analysis_results[i]["group_fail"] = current_list_stat.get("unique_count", 0)

    # 🌟 生成 sceneGroups 映射字典
    scene_groups = {}
    for stem in common_stems:
        scene_groups[stem] = {}
        for item in request.folders:
            if item.path in folder_files_map and stem in folder_files_map[item.path]:
                scene_groups[stem][item.path] = folder_files_map[item.path][stem]

    result = {
        "status": "success",
        "data": analysis_results,
        "commonStems": common_stems,
        "sceneGroups": scene_groups,
    }
    logger.info(
        "PROJECT_ANALYZE_END folders=%d common_stems=%d duration_ms=%.1f",
        len(analysis_results),
        len(common_stems),
        (perf_counter() - started) * 1000,
    )
    return result


@router.post("/project/detect-annotations")
async def detect_annotation_sources(request: DetectAnnotationSourcesRequest):
    started = perf_counter()
    logger.info(
        "PROJECT_ANNOTATION_DETECT_START folders=%d stems=%d workspace=%s",
        len(request.image_folders),
        len(request.stems),
        shorten(request.workspace_path or "", 1500),
    )
    candidates = _discover_annotation_sources(request)
    logger.info(
        "PROJECT_ANNOTATION_DETECT_END candidates=%d top=%s duration_ms=%.1f",
        len(candidates),
        shorten(candidates[0]["source_path"] if candidates else "", 1500),
        (perf_counter() - started) * 1000,
    )
    return {"status": "success", "candidates": candidates}


@router.get("/project/preview")
async def get_preview(
    folderPath: str,
    fileName: str = "",
    bands: str = "",
    colormap: str = "",
    settings: str = "",
    rawProfile: str = "",
):
    """
    根据前端传来的文件夹绝对路径、文件名(智能忽略扩展名差异)和波段索引，读取并返回渲染用的 JPEG
    """
    started = perf_counter()
    logger.info(
        "PREVIEW_START folder=%s file=%s bands=%s",
        shorten(folderPath, 1500),
        fileName,
        bands or "-",
    )
    if not os.path.exists(folderPath):
        logger.warning("PREVIEW_FOLDER_MISSING folder=%s", shorten(folderPath, 1500))
        return Response(status_code=404)

    image_path = find_image_path(folderPath, fileName)

    if not image_path or not os.path.exists(image_path):
        logger.warning(
            "PREVIEW_IMAGE_MISSING folder=%s file=%s",
            shorten(folderPath, 1500),
            fileName,
        )
        return Response(status_code=404)

    try:
        preview = render_preview_rgb(
            image_path,
            bands=bands,
            settings=_parse_json_query(settings),
            raw_profile=_parse_json_query(rawProfile),
        )
        encoded_image = encode_jpeg_rgb(preview)
        logger.info(
            "PREVIEW_END image=%s bytes=%d duration_ms=%.1f",
            shorten(image_path, 1500),
            len(encoded_image),
            (perf_counter() - started) * 1000,
        )
        return Response(content=encoded_image, media_type="image/jpeg")
    except RawDependencyError as e:
        logger.warning("PREVIEW_RAW_DEPENDENCY_ERROR image=%s error=%s", image_path, e)
        return Response(content=str(e).encode("utf-8"), status_code=503)
    except Exception as e:
        logger.exception("PREVIEW_ERROR image=%s error=%s", image_path, e)
        return Response(status_code=500)


@router.post("/project/prefetch")
async def prefetch_images(request: dict):
    """
    前端在切换场景后调用，通知后端提前解码相邻图片
    payload: { "paths": ["/data/img1.tif", "/data/img2.tif"] }
    """
    paths = request.get("paths", [])
    started = perf_counter()
    logger.info("PREFETCH_START paths=%d", len(paths))
    for path in paths:
        if os.path.exists(path):
            try:
                read_image_cached(path)
            except Exception:
                logger.exception("PREFETCH_ERROR path=%s", shorten(path, 1500))
        else:
            logger.warning("PREFETCH_MISSING path=%s", shorten(path, 1500))
    logger.info(
        "PREFETCH_END requested=%d duration_ms=%.1f",
        len(paths),
        (perf_counter() - started) * 1000,
    )
    return {"status": "ok", "cached": len(paths)}


@router.get("/project/sample_pixel")
async def get_pixel_sample(
    folderPath: str,
    fileName: str = "",
    x: int = 0,
    y: int = 0,
    mode: str = "render",
    displayWidth: int = 0,
    displayHeight: int = 0,
    settings: str = "",
    rawProfile: str = "",
):
    logger.info(
        "SAMPLE_PIXEL_START folder=%s file=%s x=%d y=%d mode=%s",
        shorten(folderPath, 1500),
        fileName,
        x,
        y,
        mode,
    )
    if not os.path.exists(folderPath):
        logger.warning("SAMPLE_PIXEL_FOLDER_MISSING folder=%s", shorten(folderPath, 1500))
        return Response(status_code=404)
    image_path = find_image_path(folderPath, fileName)
    if not image_path or not os.path.exists(image_path):
        logger.warning(
            "SAMPLE_PIXEL_IMAGE_MISSING folder=%s file=%s",
            shorten(folderPath, 1500),
            fileName,
        )
        return Response(status_code=404)
    try:
        result = sample_pixel(
            image_path,
            x=x,
            y=y,
            mode=mode,
            display_width=displayWidth or None,
            display_height=displayHeight or None,
            settings=_parse_json_query(settings),
            raw_profile=_parse_json_query(rawProfile),
        )
        logger.info("SAMPLE_PIXEL_END image=%s", shorten(image_path, 1500))
        return result
    except RawDependencyError as e:
        logger.warning("SAMPLE_PIXEL_RAW_DEPENDENCY_ERROR image=%s error=%s", image_path, e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("SAMPLE_PIXEL_ERROR image=%s error=%s", image_path, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/project/clear_cache")
async def clear_cache():
    logger.info("IMAGE_CACHE_CLEAR_START")
    clear_image_cache()
    logger.info("IMAGE_CACHE_CLEAR_END")
    return {"status": "ok"}


@router.post("/project/save_meta")
async def save_project_meta(payload: ProjectMetaPayload):
    """静默保存 project meta 到指定完整路径"""
    logger.info(
        "PROJECT_META_SAVE_START path=%s keys=%s",
        shorten(payload.file_path, 1500),
        list(payload.content.keys()),
    )
    # 提取目录并确保存在
    save_dir = os.path.dirname(payload.file_path)
    if save_dir and not os.path.exists(save_dir):
        os.makedirs(save_dir, exist_ok=True)

    try:
        with open(payload.file_path, "w", encoding="utf-8") as f:
            json.dump(payload.content, f, ensure_ascii=False, indent=2)
        logger.info("PROJECT_META_SAVE_END path=%s", shorten(payload.file_path, 1500))
        return {"status": "success"}
    except Exception as e:
        logger.exception("PROJECT_META_SAVE_ERROR path=%s error=%s", payload.file_path, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/project/load_meta")
async def load_project_meta(file_path: str):
    """直接读取指定的 project meta 文件"""
    logger.info("PROJECT_META_LOAD_START path=%s", shorten(file_path, 1500))
    if not os.path.exists(file_path):
        logger.warning("PROJECT_META_LOAD_MISSING path=%s", shorten(file_path, 1500))
        raise HTTPException(status_code=404, detail="Meta file not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("PROJECT_META_LOAD_END path=%s", shorten(file_path, 1500))
        return data
    except Exception as e:
        logger.exception("PROJECT_META_LOAD_ERROR path=%s error=%s", file_path, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workspace/check-json")
async def check_workspace_json(req: CheckJsonRequest):
    logger.info("WORKSPACE_CHECK_JSON_START path=%s", shorten(req.path, 1500))
    try:
        if not os.path.exists(req.path):
            logger.info("WORKSPACE_CHECK_JSON_END path=%s has_json=False", shorten(req.path, 1500))
            return {"hasJson": False}

        # 递归检查目录下是否有标注 JSON，忽略项目元数据文件
        for root, dirs, files in os.walk(req.path):
            for file in files:
                lower_file = file.lower()
                if lower_file.endswith(".json") and not lower_file.endswith("_meta.json"):
                    logger.info(
                        "WORKSPACE_CHECK_JSON_END path=%s has_json=True found=%s",
                        shorten(req.path, 1500),
                        file,
                    )
                    return {"hasJson": True}

        logger.info("WORKSPACE_CHECK_JSON_END path=%s has_json=False", shorten(req.path, 1500))
        return {"hasJson": False}
    except Exception as e:
        logger.exception("WORKSPACE_CHECK_JSON_ERROR path=%s error=%s", req.path, e)
        return {"hasJson": False}


@router.post("/project/infer_suffix")
async def infer_suffix(req: InferSuffixRequest):
    started = perf_counter()
    logger.info("PROJECT_INFER_SUFFIX_START folders=%d", len(req.folders))
    all_first_files = []
    valid_folders = []

    # 第一遍：收集有效文件夹
    for idx, folder in enumerate(req.folders):
        logger.info(
            "PROJECT_INFER_SUFFIX_FOLDER_START index=%d path=%s",
            idx,
            shorten(folder.path, 1500),
        )
        if not os.path.exists(folder.path):
            logger.warning(
                "PROJECT_INFER_SUFFIX_FOLDER_MISSING index=%d path=%s",
                idx,
                shorten(folder.path, 1500),
            )
            continue
        image_files = sorted(
            [
                f
                for f in os.listdir(folder.path)
                if is_supported_image(f)
            ]
        )
        if image_files:
            all_first_files.append(image_files[0])
            valid_folders.append((idx, folder, image_files))

    # 第二遍：公共前缀
    common_prefix = ""
    if len(all_first_files) >= 2:
        stems = [Path(f).stem for f in all_first_files]
        common_prefix = os.path.commonprefix(stems)

    # 第三遍：生成结果
    results = []
    for idx in range(len(req.folders)):
        match = [vf for vf in valid_folders if vf[0] == idx]
        if not match:
            results.append(
                {
                    "folder_index": idx,
                    "suffix": "",
                    "extension": "",
                    "sample_file": "",
                    "total_files": 0,
                }
            )
            continue

        _, folder, image_files = match[0]
        first_stem = Path(image_files[0]).stem  # 'DJI_20260211154928_0008_T'
        ext = Path(image_files[0]).suffix  # '.JPG'

        # 去掉公共前缀
        if common_prefix and first_stem.startswith(common_prefix):
            suffix = first_stem[len(common_prefix) :]  # 'T'
        elif len(all_first_files) == 1:
            suffix = ""
        else:
            suffix = first_stem

        results.append(
            {
                "folder_index": idx,
                "suffix": suffix,  # 'T' / 'V'
                "extension": ext,  # 'jpg'
                "sample_file": image_files[0],
                "total_files": len(image_files),
            }
        )
    logger.info(
        "PROJECT_INFER_SUFFIX_END results=%d duration_ms=%.1f",
        len(results),
        (perf_counter() - started) * 1000,
    )
    return {"results": results}
