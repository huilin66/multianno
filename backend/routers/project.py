import asyncio
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from models import (
    AnalyzeRequest,
    CheckJsonRequest,
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

router = APIRouter(prefix="/api", tags=["Project"])


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
    async def event_generator():
        all_json_files = []
        # 1. 扫描所有目录下的 json 文件 (排除 meta.json)
        for d in req.save_dirs:
            if os.path.exists(d):
                for root, _, files in os.walk(d):
                    for f in files:
                        if f.endswith(".json") and not f.endswith("_meta.json"):
                            all_json_files.append(os.path.join(root, f))

        total_files = len(all_json_files)
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
                pass  # 忽略损坏的 JSON 文件

            # 3. 每处理 10 个文件，或者处理到最后一个时，推送一次进度
            if (i + 1) % 10 == 0 or (i + 1) == total_files:
                yield (
                    json.dumps(
                        {"type": "progress", "current": i + 1, "total": total_files}
                    )
                    + "\n"
                )
                await asyncio.sleep(0.01)  # 让出事件循环，确保数据实时发送

        # 4. 循环结束，推送最终结果
        result_data = {
            "shapesCount": shapes_count,
            "total": total_objects,
            "fileList": file_list,
        }
        yield json.dumps({"type": "result", "data": result_data}) + "\n"

    # 使用 application/x-ndjson 格式返回流
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post("/project/analyze")
async def analyze_project(request: AnalyzeRequest):
    analysis_results = []
    stem_list = []
    folder_files_map = {}

    for item in request.folders:
        folder_path = item.path
        raw_suffix = item.suffix.strip() if item.suffix else ""

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
            continue

        stem_list.append(valid_stems)
        folder_files_map[folder_path] = stem_to_file

        raw_profile = getattr(item, "rawProfile", None)
        try:
            image_meta = read_metadata(first_file_path, raw_profile=raw_profile)
        except Exception as e:
            print(f"Failed to read image metadata: {first_file_path}: {e}")
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
    return result


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
    if not os.path.exists(folderPath):
        return Response(status_code=404)

    image_path = find_image_path(folderPath, fileName)

    if not image_path or not os.path.exists(image_path):
        print(f"Error: Image not found for folder: {folderPath}, fileName: {fileName}")
        return Response(status_code=404)

    try:
        preview = render_preview_rgb(
            image_path,
            bands=bands,
            settings=_parse_json_query(settings),
            raw_profile=_parse_json_query(rawProfile),
        )
        encoded_image = encode_jpeg_rgb(preview)
        return Response(content=encoded_image, media_type="image/jpeg")
    except RawDependencyError as e:
        print(f"RAW dependency unavailable: {e}")
        return Response(content=str(e).encode("utf-8"), status_code=503)
    except Exception as e:
        print(f"Preview Gen Error: {e}")
        import traceback

        traceback.print_exc()
        return Response(status_code=500)


@router.post("/project/prefetch")
async def prefetch_images(request: dict):
    """
    前端在切换场景后调用，通知后端提前解码相邻图片
    payload: { "paths": ["/data/img1.tif", "/data/img2.tif"] }
    """
    paths = request.get("paths", [])
    for path in paths:
        if os.path.exists(path):
            try:
                read_image_cached(path)
            except Exception:
                pass
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
    if not os.path.exists(folderPath):
        return Response(status_code=404)
    image_path = find_image_path(folderPath, fileName)
    if not image_path or not os.path.exists(image_path):
        return Response(status_code=404)
    try:
        return sample_pixel(
            image_path,
            x=x,
            y=y,
            mode=mode,
            display_width=displayWidth or None,
            display_height=displayHeight or None,
            settings=_parse_json_query(settings),
            raw_profile=_parse_json_query(rawProfile),
        )
    except RawDependencyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/project/clear_cache")
async def clear_cache():
    clear_image_cache()
    return {"status": "ok"}


@router.post("/project/save_meta")
async def save_project_meta(payload: ProjectMetaPayload):
    """静默保存 project meta 到指定完整路径"""
    # 提取目录并确保存在
    save_dir = os.path.dirname(payload.file_path)
    if save_dir and not os.path.exists(save_dir):
        os.makedirs(save_dir, exist_ok=True)

    try:
        with open(payload.file_path, "w", encoding="utf-8") as f:
            json.dump(payload.content, f, ensure_ascii=False, indent=2)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/project/load_meta")
async def load_project_meta(file_path: str):
    """直接读取指定的 project meta 文件"""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Meta file not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workspace/check-json")
async def check_workspace_json(req: CheckJsonRequest):
    try:
        if not os.path.exists(req.path):
            return {"hasJson": False}

        # 递归检查目录下是否有 .json 文件
        for root, dirs, files in os.walk(req.path):
            for file in files:
                if file.endswith(".json"):
                    return {"hasJson": True}

        return {"hasJson": False}
    except Exception as e:
        return {"hasJson": False}


@router.post("/project/infer_suffix")
async def infer_suffix(req: InferSuffixRequest):
    all_first_files = []
    valid_folders = []

    # 第一遍：收集有效文件夹
    for idx, folder in enumerate(req.folders):
        if not os.path.exists(folder.path):
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
    print(results)
    return {"results": results}
