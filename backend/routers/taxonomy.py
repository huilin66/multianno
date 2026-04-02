import os

from fastapi import APIRouter

# 从咱们新建的模型文件里引入需要的 Model
from models import (
    BatchDeleteAttributeRequest,
    BatchDeleteClassRequest,
    BatchMergeClassRequest,
)

# 统一加上前缀和标签，方便管理
router = APIRouter(prefix="/api/taxonomy", tags=["Taxonomy"])


@router.post("/merge_class")  # 因为有 prefix，这里写 /merge_class 即可
async def batch_merge_class(request: BatchMergeClassRequest):
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                changed = False
                # 遍历修改匹配的 label
                for shape in anno_data.get("shapes", []):
                    if shape.get("label") in request.old_names:
                        shape["label"] = request.new_name
                        changed = True

                # 只有发生实质修改，才重新写入，最大化节省硬盘 I/O
                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                print(f"Error processing {file_path}: {e}")

    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_class")
async def batch_delete_class(request: BatchDeleteClassRequest):
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                original_len = len(anno_data.get("shapes", []))

                if request.hard_delete:
                    # 硬删除：过滤掉该类别的框
                    anno_data["shapes"] = [
                        s
                        for s in anno_data.get("shapes", [])
                        if s.get("label") != request.class_name
                    ]
                    changed = len(anno_data["shapes"]) != original_len
                else:
                    # 软删除：把类别名改成 'Uncategorized'
                    changed = False
                    for shape in anno_data.get("shapes", []):
                        if shape.get("label") == request.class_name:
                            shape["label"] = "Uncategorized"
                            changed = True

                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                pass

    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_attribute")
async def batch_delete_attribute(request: BatchDeleteAttributeRequest):
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                changed = False
                for shape in anno_data.get("shapes", []):
                    # 如果该框存在 attributes 字典，并且包含了我们要删的属性
                    if (
                        "attributes" in shape
                        and request.attribute_name in shape["attributes"]
                    ):
                        del shape["attributes"][request.attribute_name]
                        changed = True

                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                pass

    return {"status": "success", "modified_files": modified_count}
