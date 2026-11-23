"""PID answer audit: annotate one answer box per question, blind.

The PID dataset is not a MultiAnno project: its unit is a question
(``question_id`` -> one box), not a track over views. This router therefore
keeps its own storage under ``<PID_OUTPUT_DIR>/pid_audit`` and never touches
the project / annotation tables.

Deliberately blind: the responses carry the questions, the test images, the
videos and the SAM 3 candidate boxes, but never the pipeline's current answer
or its ownership. An annotator who can see the prediction just copies it, and
the evaluation stops measuring the pipeline.

Endpoints
    GET  /api/pid_audit/dataset      videos, images, questions
    GET  /api/pid_audit/candidates   candidate boxes for (video, image)
    GET  /api/pid_audit/media        image / video stream (Range supported)
    GET  /api/pid_audit/annotations  saved answers for one video
    POST /api/pid_audit/save         upsert one video's answers
    GET  /api/pid_audit/export       combined submission-shaped answers
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter(prefix="/api/pid_audit", tags=["PidAudit"])

DEFAULT_DATA_ROOT = r"Z:/huilin/backup/data_backup/pid/Input_data"
DEFAULT_OUTPUT_DIR = r"E:/repository/pid/outputs"
CANDIDATE_FILE = "image_candidates_merged.json"

_STATE_DIR_NAME = "pid_audit"
_IOU_DUPLICATE = 0.85
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
_VIDEO_MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
}


# ----------------------------------------------------------------- utilities
def _data_root() -> Path:
    return Path(os.environ.get("PID_DATA_ROOT", DEFAULT_DATA_ROOT)).expanduser()


def _output_dir() -> Path:
    return Path(os.environ.get("PID_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)).expanduser()


def _state_dir() -> Path:
    directory = _output_dir() / _STATE_DIR_NAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def _iou(first: list, second: list) -> float:
    ax1, ay1, ax2, ay2 = (float(value) for value in first[:4])
    bx1, by1, bx2, by2 = (float(value) for value in second[:4])
    width = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    height = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = width * height
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def _dedupe(boxes: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for box in sorted(boxes, key=lambda item: item.get("score", 0.0), reverse=True):
        if any(_iou(box["box"], other["box"]) >= _IOU_DUPLICATE for other in kept):
            continue
        kept.append(box)
    return kept


def _candidate_index() -> dict[tuple[str, str], dict[str, list[dict]]]:
    """``(video, bg_path) -> label -> [box, ...]`` from the merged candidate run."""
    path = _output_dir() / "predictions" / CANDIDATE_FILE
    data = _read_json(path, {"dataset": []})
    index: dict[tuple[str, str], dict[str, list[dict]]] = {}
    for video in data.get("dataset", []):
        video_id = video.get("video_id")
        for image in video.get("images", []):
            per_label: dict[str, list[dict]] = {}
            for candidate in image.get("candidates", []):
                per_label.setdefault(candidate["label"], []).append(candidate)
            index[(video_id, image["bg_path"])] = {
                label: _dedupe(items) for label, items in per_label.items()
            }
    return index


# -------------------------------------------------------------------- routes
@router.get("/dataset")
def dataset() -> dict:
    """Videos, their test images and the questions asked about each image."""
    root = _data_root()
    if not root.is_dir():
        raise HTTPException(status_code=404, detail=f"PID_DATA_ROOT not found: {root}")

    parsed = _read_json(_output_dir() / "predictions" / "parsed.json", {"dataset": []})
    labels: dict[tuple[str, str], str] = {}
    for video in parsed.get("dataset", []):
        for answer in video.get("answers", []):
            labels[(video.get("video_id"), answer.get("question_id"))] = (
                answer.get("object") or answer.get("phrase") or ""
            )

    videos = []
    for directory in sorted(root.iterdir()):
        questions_path = directory / "ask_questions.json"
        if not directory.is_dir() or not questions_path.is_file():
            continue
        video_file = next(
            (item for item in sorted(directory.iterdir())
             if item.is_file() and item.suffix.lower() in _VIDEO_SUFFIXES),
            None,
        )
        if video_file is None:
            continue
        questions = _read_json(questions_path, {}).get("questions", [])
        images: dict[str, list[dict]] = {}
        for question in questions:
            question_id = question.get("question_id")
            images.setdefault(question["bg_path"], []).append({
                "question_id": question_id,
                "speaker": question.get("speaker", ""),
                "text": question.get("question", ""),
                "label": labels.get((directory.name, question_id))
                or question.get("object", ""),
            })
        profiles_dir = directory / "profiles"
        profiles = []
        if profiles_dir.is_dir():
            for item in sorted(profiles_dir.iterdir()):
                if item.is_file() and item.suffix.lower() in _IMAGE_SUFFIXES:
                    profiles.append({
                        "name": item.stem,
                        "url": f"/api/pid_audit/media?path={directory.name}/profiles/{item.name}",
                    })

        # The URL carries the file mtime: without it a browser keeps a cached
        # copy of the original bytes even after the server switched to the
        # transcoded proxy (same URL, max-age=86400).
        videos.append({
            "video_id": directory.name,
            "video_url": (
                f"/api/pid_audit/media?path={directory.name}/{video_file.name}"
                f"&v={int(video_file.stat().st_mtime)}"
            ),
            "video_name": video_file.name,
            "profiles": profiles,
            "images": [
                {
                    "bg_path": bg_path,
                    "image_url": f"/api/pid_audit/media?path={directory.name}/{bg_path}",
                    "questions": items,
                }
                for bg_path, items in sorted(images.items())
            ],
        })

    return JSONResponse(
        content={
            "data_root": str(root).replace("\\", "/"),
            "output_dir": str(_output_dir()).replace("\\", "/"),
            "videos": videos,
        },
        headers={"Cache-Control": "no-store"},
    )


@router.get("/candidates")
def candidates(
    video: str = Query(...),
    image: str = Query(...),
) -> dict:
    """Candidate boxes for one (video, image), grouped by the question label."""
    index = _candidate_index()
    per_label = index.get((video, image))
    if per_label is None:
        return {"video": video, "image": image, "labels": {}}
    labels = {
        label: [
            {"index": position, "box": [int(round(value)) for value in item["box"]]}
            for position, item in enumerate(items)
        ]
        for label, items in per_label.items()
    }
    return {"video": video, "image": image, "labels": labels}


def _safe_media_path(relative: str) -> Path:
    root = _data_root().resolve()
    target = (root / relative).resolve()
    if root != target and root not in target.parents:
        raise HTTPException(status_code=400, detail="path escapes PID_DATA_ROOT")
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"not found: {relative}")
    return target


_PROXY_LOCK = threading.Lock()
_PROXY_NEEDED: dict[tuple[str, float], bool] = {}


def _needs_proxy(path: Path) -> bool:
    """HEVC inside a QuickTime container cannot be decoded by Chromium.

    The iPhone recordings here are ``ftypqt`` + ``hvc1``; Edge/Chrome show
    "cannot load" for them. Checked once per (file, mtime).
    """
    try:
        key = (str(path), path.stat().st_mtime)
    except OSError:
        return False
    cached = _PROXY_NEEDED.get(key)
    if cached is not None:
        return cached
    try:
        with path.open("rb") as handle:
            header = handle.read(16)
        needs = header[4:12].startswith(b"ftypqt")
    except OSError:
        needs = False
    _PROXY_NEEDED[key] = needs
    return needs


def _proxy_dir() -> Path:
    directory = _state_dir() / "proxies"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _proxy_path(path: Path) -> Path:
    stat = path.stat()
    name = f"{path.parent.name}_{path.stem}_{stat.st_size}_{int(stat.st_mtime)}.mp4"
    return _proxy_dir() / name


def _ffmpeg_binary() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # pragma: no cover - optional dependency
        return None


def _ensure_proxy(path: Path) -> Path | None:
    """Transcode a browser-hostile video to 720p H.264 once, then reuse it."""
    try:
        target = _proxy_path(path)
    except OSError:
        return None
    if target.is_file() and target.stat().st_size > 0:
        return target
    binary = _ffmpeg_binary()
    if not binary:
        return None
    with _PROXY_LOCK:
        if target.is_file() and target.stat().st_size > 0:
            return target
        temp = target.with_name(target.stem + ".part.mp4")
        command = [
            binary, "-y", "-loglevel", "error",
            "-i", str(path),
            "-vf", "scale=-2:720",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
            "-c:a", "aac", "-b:a", "96k",
            "-movflags", "+faststart",
            str(temp),
        ]
        try:
            result = subprocess.run(command, capture_output=True, timeout=1800)
        except (OSError, subprocess.TimeoutExpired):
            temp.unlink(missing_ok=True)
            return None
        if result.returncode != 0 or not temp.is_file():
            temp.unlink(missing_ok=True)
            return None
        temp.replace(target)
    return target


def _video_response(path: Path) -> FileResponse:
    """Starlette's FileResponse handles Range/If-Range/ETag itself.

    The previous hand-rolled 1 MiB generator held one connection open for the
    whole 300 MB file, so the browser's seek requests queued behind it and the
    player showed its buffering spinner. FileResponse streams the requested
    range and answers If-Range with a fresh 206 instead.
    """
    if _needs_proxy(path):
        proxy = _ensure_proxy(path)
        if proxy is not None:
            return FileResponse(
                proxy,
                media_type="video/mp4",
                headers={"Cache-Control": "public, max-age=86400"},
            )
    media_type = _VIDEO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/media")
def media(path: str = Query(...)):
    target = _safe_media_path(path)
    if target.suffix.lower() in _IMAGE_SUFFIXES:
        return FileResponse(target)
    return _video_response(target)


def _annotation_path(video_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", video_id)
    return _state_dir() / f"{safe}.json"


@router.get("/annotations")
def annotations(video: str = Query(...)) -> dict:
    payload = _read_json(_annotation_path(video), {})
    return {"video_id": video, "answers": payload.get("answers", [])}


@router.post("/save")
def save(body: dict = Body(...)) -> dict:
    video_id = str(body.get("video_id") or "")
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id is required")
    answers = body.get("answers")
    if not isinstance(answers, list):
        raise HTTPException(status_code=400, detail="answers must be a list")

    cleaned = []
    for answer in answers:
        question_id = answer.get("question_id")
        if not question_id:
            continue
        state = answer.get("state") or "unset"
        bbox = answer.get("bbox")
        if state == "box" and isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            bbox = [int(round(float(value))) for value in bbox[:4]]
        else:
            bbox = None
        cleaned.append({
            "question_id": question_id,
            "state": state,
            "bbox": bbox,
            "confidence": answer.get("confidence"),
            "evidence_ts": answer.get("evidence_ts"),
            "source": answer.get("source"),
            "note": answer.get("note"),
        })

    payload = {
        "video_id": video_id,
        "annotator": body.get("annotator"),
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "answers": cleaned,
    }
    target = _annotation_path(video_id)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True, "path": str(target).replace("\\", "/"), "count": len(cleaned)}


@router.get("/export")
def export() -> JSONResponse:
    """Submission-shaped answers (one box per question) from all saved files."""
    dataset = []
    for file in sorted(_state_dir().glob("*.json")):
        payload = _read_json(file, {})
        video_id = payload.get("video_id")
        if not video_id:
            continue
        dataset.append({
            "video_id": video_id,
            "answers": [
                {
                    "question_id": answer.get("question_id"),
                    "bboxes": [answer["bbox"]] if answer.get("bbox") else [],
                }
                for answer in payload.get("answers", [])
            ],
        })
    combined = {"dataset": dataset}
    target = _state_dir() / "owned_gt.json"
    target.write_text(json.dumps(combined, ensure_ascii=False, indent=1), encoding="utf-8")
    return JSONResponse(content=combined)
