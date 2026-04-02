import os
import platform
from typing import List

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/fs", tags=["FileSystem"])


@router.get("/explore")
def explore_file_system(
    path: str = Query(""),
    history: List[str] = Query(default=[]),  # 🌟 新增：接收前端传来的历史记录
):
    # 1. 如果路径为空，返回系统盘符 + 前端传来的历史记录
    if not path:
        items = []
        if platform.system() == "Windows":
            import ctypes
            import string

            # A. 扫描本地盘符 (极其快速且安全，瞬间返回，绝不卡死)
            drives = []
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for i, letter in enumerate(string.ascii_uppercase):
                if bitmask & (1 << i):
                    drives.append(f"{letter}:/")

            for d in drives:
                # 🌟 改动：name 只传盘符，增加 tag="drive"
                items.append(
                    {"name": f"{d[0]}:", "path": d, "type": "dir", "tag": "drive"}
                )

            # B. 🌟 注入前端传来的历史记录
            seen = set()
            for h_path in history:
                if h_path and h_path not in seen and os.path.exists(h_path):
                    seen.add(h_path)
                    items.append(
                        {
                            # 🌟 改动：name 只传路径，增加 tag="history"
                            "name": h_path,
                            "path": h_path.replace("\\", "/"),
                            "type": "dir",
                            "tag": "history",
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
