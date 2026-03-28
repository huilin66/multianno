import os
import platform
from pathlib import Path
from typing import List

import cv2
import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from skimage import io

app = FastAPI()

# 开启跨域，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    paths: List[str]


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
    intersection_count = len(intersection_set)

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


# 假设你有一个 router，或者直接用 @app.get
@app.get("/api/fs/explore")
def explore_file_system(
    path: str = Query(""),
    history: List[str] = Query(default=[]),  # 🌟 新增：接收前端传来的历史记录
):
    # 1. 如果路径为空，返回系统盘符 + 前端传来的历史记录
    if not path:
        items = []
        if platform.system() == "Windows":
            import string

            # A. 扫描本地盘符
            drives = [
                f"{d}:/" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")
            ]
            for d in drives:
                items.append({"name": f"本地磁盘 ({d[0]}:)", "path": d, "type": "dir"})

            # B. 🌟 注入前端传来的历史记录
            seen = set()
            for h_path in history:
                # 确保路径有值、未重复，且在当前后端机器上是真实存在的
                if h_path and h_path not in seen and os.path.exists(h_path):
                    seen.add(h_path)
                    items.append(
                        {
                            "name": f"🕒 历史记录 ({h_path})",
                            "path": h_path.replace("\\", "/"),
                            "type": "dir",
                        }
                    )
        else:
            path = "/"

        return {"current_path": "", "parent_path": "", "items": items}
    # 2. 规范化路径
    try:
        path = os.path.abspath(path)
        parent_path = os.path.dirname(path)

        items = []
        # 使用 scandir 高效遍历目录
        with os.scandir(path) as it:
            for entry in it:
                # 过滤掉隐藏文件和系统文件 (以 . 开头的文件)
                if entry.name.startswith("."):
                    continue

                is_dir = entry.is_dir()
                items.append(
                    {
                        "name": entry.name,
                        "path": entry.path.replace("\\", "/"),  # 统一使用正斜杠
                        "type": "dir" if is_dir else "file",
                    }
                )

    except PermissionError:
        return JSONResponse(
            status_code=403,
            content={"error": "Permission Denied (没有权限访问该文件夹)"},
        )
    except FileNotFoundError:
        return JSONResponse(
            status_code=404, content={"error": "Path not found (路径不存在)"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # 3. 排序：文件夹排在前面，然后再按字母顺序排
    items.sort(key=lambda x: (x["type"] != "dir", x["name"].lower()))

    return {
        "current_path": path.replace("\\", "/"),
        "parent_path": parent_path.replace("\\", "/"),
        "items": items,
    }


@app.post("/api/project/analyze")
async def analyze_project(request: AnalyzeRequest):
    analysis_results = []
    print(f"Received paths: {request.paths}")

    stem_list = []
    folder_list = request.paths
    for folder_path in folder_list:
        if not os.path.exists(folder_path):
            print(f"Folder {folder_path} not exists")
            continue

        # 提取当前文件夹下所有合法图像的 Stem（不带后缀的文件名）
        valid_stems = [
            Path(f).stem
            for f in os.listdir(folder_path)
            if f.lower().endswith((".tif", ".tiff", ".png", ".jpg"))
        ]

        if not valid_stems:
            continue

        # 注意：这里可能需要补全 valid_files 用于读取第一张图的宽高等元数据
        # 假设我们只读第一张图
        first_file = [
            f
            for f in os.listdir(folder_path)
            if f.lower().endswith((".tif", ".tiff", ".png", ".jpg"))
        ][0]
        image_first_path = os.path.join(folder_path, first_file)

        stem_list.append(valid_stems)

        # 读取图像元数据
        img = io.imread(image_first_path)
        meta = {
            "folderPath": folder_path,
            "width": img.shape[1],
            "height": img.shape[0],
            "bands": img.shape[2] if len(img.shape) > 2 else 1,
            "dtype": str(img.dtype),
            "fileCount": len(valid_stems),
        }
        analysis_results.append(meta)

    # 计算所有文件夹的交集统计
    intersection_stats = calculate_list_stats(*stem_list)
    common_stems = intersection_stats.get("intersection_elements", [])
    list_stats = intersection_stats.get("list_stats", {})

    # 将统计结果合并到各个文件夹的元数据中
    for i in range(len(analysis_results)):
        # 成功的组数 = 交集的元素个数
        analysis_results[i]["group_success"] = len(common_stems)
        # 失败/跳过的组数 = 该列表中不在交集内的元素个数
        current_list_stat = list_stats.get(f"list_{i}", {})
        analysis_results[i]["group_fail"] = current_list_stat.get("unique_count", 0)

    return {
        "status": "success",
        "data": analysis_results,
        # 必须把实际的交集 stems 传给前端，前端才能生成下拉菜单！
        "commonStems": sorted(common_stems),
    }


@app.get("/api/project/preview")
async def get_preview(folderPath: str, bands: str):
    """
    根据前端传来的文件夹绝对路径和波段索引，读取第一张图并返回渲染用的 JPEG
    """
    if not os.path.exists(folderPath):
        return Response(status_code=404)

    valid_files = [
        f
        for f in os.listdir(folderPath)
        if f.lower().endswith((".tif", ".tiff", ".png", ".jpg"))
    ]
    if not valid_files:
        return Response(status_code=404)

    image_path = os.path.join(folderPath, valid_files[0])
    img = io.imread(image_path)

    # 解析请求的波段 (例如 "1,0,0" 或者是 "1,2,3")
    # 前端传来的索引是 1-based，如果是 0 则代表 None
    band_indices = [int(b) - 1 for b in bands.split(",") if int(b) > 0]

    try:
        if len(band_indices) == 1:
            idx = band_indices[0]
            if len(img.shape) == 2:
                out_img = img
            else:
                out_img = img[:, :, idx] if idx < img.shape[2] else img[:, :, 0]
            # 单波段复制为 3 通道灰度图用于可视化
            out_img = np.stack([out_img] * 3, axis=-1)

        elif len(band_indices) == 3:
            if len(img.shape) == 2:
                out_img = np.stack([img] * 3, axis=-1)
            else:
                chs = []
                for idx in band_indices:
                    # 如果波段超界，用黑图代替
                    chs.append(
                        img[:, :, idx]
                        if idx < img.shape[2]
                        else np.zeros_like(img[:, :, 0])
                    )
                out_img = np.stack(chs, axis=-1)
        else:
            out_img = img  # fallback

        # 极重要：遥感图像通常是 16bit，需要做 2%~98% 的直方图截断拉伸 (Min-Max Normalization)，否则网页显示全黑
        out_img = out_img.astype(np.float32)
        p2, p98 = np.percentile(out_img, (2, 98))
        # 避免分母为0
        out_img = np.clip((out_img - p2) / (p98 - p2 + 1e-5) * 255.0, 0, 255).astype(
            np.uint8
        )

        # cv2 编码需为 BGR 顺序
        if len(out_img.shape) == 3 and out_img.shape[2] == 3:
            out_img = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

        success, encoded_image = cv2.imencode(".jpg", out_img)
        if not success:
            return Response(status_code=500)

        return Response(content=encoded_image.tobytes(), media_type="image/jpeg")

    except Exception as e:
        print(f"Preview Gen Error: {e}")
        return Response(status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
