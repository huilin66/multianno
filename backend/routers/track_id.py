"""Track ID assistance endpoints."""

from __future__ import annotations

import asyncio
import math
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
from fastapi import APIRouter, HTTPException

from models import TrackIdCandidate, TrackIdFrame, TrackIdReIDConfigRequest, TrackIdReIDRequest
from utils.logging_config import get_logger, shorten
from utils.reid import (
    ReIDUnavailableError,
    candidate_bbox,
    candidate_center,
    cosine_similarity,
    encoder,
)


router = APIRouter(prefix="/api/track-id/reid", tags=["Track ID ReID"])
logger = get_logger("track_id")

REID_STAGE_COUNT = 4
ReIDProgressCallback = Callable[[int, str, int, int, str], None]
_reid_jobs: dict[str, dict[str, Any]] = {}
_reid_tasks: dict[str, asyncio.Task[Any]] = {}
_reid_jobs_lock = threading.Lock()


def _prune_reid_jobs() -> None:
    cutoff = time.time() - 1800
    with _reid_jobs_lock:
        expired = [
            job_id for job_id, job in _reid_jobs.items()
            if job.get("status") in {"completed", "failed"}
            and float(job.get("updated_at", 0)) < cutoff
        ]
        for job_id in expired:
            _reid_jobs.pop(job_id, None)


def _create_reid_job() -> dict[str, Any]:
    _prune_reid_jobs()
    job_id = uuid.uuid4().hex
    now = time.time()
    job = {
        "job_id": job_id,
        "status": "queued",
        "stage_index": 1,
        "stage_count": REID_STAGE_COUNT,
        "stage_name": "Collecting candidate boxes",
        "current": 0,
        "total": 1,
        "percent": 0,
        "message": "Queued",
        "result": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    with _reid_jobs_lock:
        _reid_jobs[job_id] = job
    return dict(job)


def _get_reid_job(job_id: str) -> Optional[dict[str, Any]]:
    with _reid_jobs_lock:
        job = _reid_jobs.get(job_id)
        return dict(job) if job is not None else None


def _update_reid_job(job_id: str, **updates: Any) -> None:
    with _reid_jobs_lock:
        job = _reid_jobs.get(job_id)
        if job is None:
            return
        job.update(updates)
        job["updated_at"] = time.time()


def _publish_reid_progress(
    job_id: str,
    stage_index: int,
    stage_name: str,
    current: int,
    total: int,
    message: str = "",
) -> None:
    safe_total = max(0, int(total))
    safe_current = min(safe_total, max(0, int(current))) if safe_total else 0
    percent = int((safe_current / safe_total) * 100) if safe_total else 0
    _update_reid_job(
        job_id,
        status="running",
        stage_index=stage_index,
        stage_count=REID_STAGE_COUNT,
        stage_name=stage_name,
        current=safe_current,
        total=safe_total,
        percent=percent,
        message=message,
    )


def _find_frame(frames: list[TrackIdFrame], stem: str) -> Optional[TrackIdFrame]:
    return next((frame for frame in frames if frame.stem == stem), None)


def _find_candidate(frame: TrackIdFrame, annotation_id: str) -> Optional[TrackIdCandidate]:
    return next((candidate for candidate in frame.candidates if candidate.annotation_id == annotation_id), None)


def _interpolated_center(
    start: TrackIdCandidate,
    end: TrackIdCandidate,
    progress: float,
) -> Optional[tuple[float, float]]:
    start_center = candidate_center(start.model_dump())
    end_center = candidate_center(end.model_dump())
    if start_center is None or end_center is None:
        return None
    return (
        start_center[0] + (end_center[0] - start_center[0]) * progress,
        start_center[1] + (end_center[1] - start_center[1]) * progress,
    )


def _interpolated_bbox(
    start: TrackIdCandidate,
    end: TrackIdCandidate,
    progress: float,
) -> Optional[list[float]]:
    start_bbox = candidate_bbox(start.model_dump())
    end_bbox = candidate_bbox(end.model_dump())
    if start_bbox is None or end_bbox is None:
        return None
    return [
        start_bbox[index] + (end_bbox[index] - start_bbox[index]) * progress
        for index in range(4)
    ]


def _bbox_iou(left: Optional[list[float]], right: Optional[list[float]]) -> float:
    if left is None or right is None:
        return 0.0
    left_width = left[2] - left[0]
    left_height = left[3] - left[1]
    right_width = right[2] - right[0]
    right_height = right[3] - right[1]
    if left_width <= 0 or left_height <= 0 or right_width <= 0 or right_height <= 0:
        return 0.0

    intersection_left = max(left[0], right[0])
    intersection_top = max(left[1], right[1])
    intersection_right = min(left[2], right[2])
    intersection_bottom = min(left[3], right[3])
    intersection_width = max(0.0, intersection_right - intersection_left)
    intersection_height = max(0.0, intersection_bottom - intersection_top)
    intersection_area = intersection_width * intersection_height
    if intersection_area <= 0:
        return 0.0

    union_area = left_width * left_height + right_width * right_height - intersection_area
    return intersection_area / union_area if union_area > 0 else 0.0


def _location_score(candidate: TrackIdCandidate, expected_center: Optional[tuple[float, float]]) -> float:
    actual_center = candidate_center(candidate.model_dump())
    if actual_center is None or expected_center is None:
        return 0.0
    distance = math.hypot(actual_center[0] - expected_center[0], actual_center[1] - expected_center[1])
    bbox = candidate_bbox(candidate.model_dump())
    scale = math.hypot(max(1.0, bbox[2] - bbox[0]), max(1.0, bbox[3] - bbox[1])) if bbox else 1.0
    return math.exp(-distance / max(scale * 4.0, 1.0))


@router.get("/status")
async def get_reid_status():
    status = encoder.status()
    logger.info(
        "REID_STATUS runtime=%s configured=%s exists=%s loaded=%s model=%s",
        status["runtime_available"],
        status["configured"],
        status["model_exists"],
        status["loaded"],
        status["model_name"] or "-",
    )
    return status


@router.post("/config")
async def configure_reid(req: TrackIdReIDConfigRequest):
    try:
        status = encoder.configure_model_path(req.model_path)
    except (OSError, ValueError) as exc:
        logger.warning("REID_CONFIG_ERROR path=%s error=%s", shorten(req.model_path, 1500), shorten(str(exc), 1500))
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "REID_CONFIG path=%s exists=%s",
        shorten(status.get("model_path") or "<env>", 1500),
        status["model_exists"],
    )
    return status


def _validate_track_id_request(req: TrackIdReIDRequest) -> tuple[TrackIdFrame, TrackIdFrame]:
    if not req.track_id.strip():
        raise HTTPException(status_code=400, detail="Track ID is required.")
    if len(req.frames) < 2:
        raise HTTPException(status_code=400, detail="At least two frames are required for ReID.")

    start_frame = _find_frame(req.frames, req.start.stem)
    end_frame = _find_frame(req.frames, req.end.stem)
    if start_frame is None or end_frame is None:
        raise HTTPException(status_code=400, detail="The start/end candidate frames are missing.")
    if _find_candidate(start_frame, req.start.annotation_id) is None:
        raise HTTPException(status_code=400, detail="The start candidate is not present in its frame.")
    if _find_candidate(end_frame, req.end.annotation_id) is None:
        raise HTTPException(status_code=400, detail="The end candidate is not present in its frame.")
    return start_frame, end_frame


def _associate_track_id_sync(
    req: TrackIdReIDRequest,
    progress_callback: Optional[ReIDProgressCallback] = None,
) -> dict[str, Any]:
    def report(stage_index: int, stage_name: str, current: int, total: int, message: str = "") -> None:
        if progress_callback is not None:
            progress_callback(stage_index, stage_name, current, total, message)

    collection_total = max(len(req.frames), 1)
    report(1, "Collecting candidate boxes", 0, collection_total, "Validating start and end candidates")
    start_frame, end_frame = _validate_track_id_request(req)

    logger.info(
        "REID_ASSOCIATE_START track_id=%s frames=%s start=%s end=%s min_similarity=%s location_weight=%s same_label_only=%s batch_size=%s",
        shorten(req.track_id, 200),
        len(req.frames),
        shorten(req.start.annotation_id, 200),
        shorten(req.end.annotation_id, 200),
        req.min_similarity,
        req.location_weight,
        req.same_label_only,
        req.batch_size,
    )
    start_index = next(index for index, frame in enumerate(req.frames) if frame.stem == req.start.stem)
    end_index = next(index for index, frame in enumerate(req.frames) if frame.stem == req.end.stem)
    index_distance = end_index - start_index
    anchor_label = req.start.label.strip()
    assignments: list[dict[str, Any]] = [
        {
            "stem": req.start.stem,
            "annotation_id": req.start.annotation_id,
            "track_id": req.track_id,
            "score": 1.0,
            "method": "anchor",
        },
        {
            "stem": req.end.stem,
            "annotation_id": req.end.annotation_id,
            "track_id": req.track_id,
            "score": 1.0,
            "method": "anchor",
        },
    ]
    missing_stems: list[str] = []
    candidate_plans: list[dict[str, Any]] = []
    candidate_work: list[tuple[dict[str, Any], TrackIdCandidate]] = []
    total_reid_candidates = 0
    collected_frames = 0

    for frame_index, frame in enumerate(req.frames):
        if frame.stem in {req.start.stem, req.end.stem}:
            collected_frames += 1
            report(1, "Collecting candidate boxes", collected_frames, collection_total, frame.stem)
            continue
        # Track ID association is intentionally restricted to the anchor
        # class. Existing Track IDs are reserved and must not be reused as
        # intermediate candidates in a new association pass.
        candidates = [
            candidate
            for candidate in frame.candidates
            if anchor_label
            and candidate.label.strip() == anchor_label
            and not (candidate.track_id or "").strip()
        ]
        if not candidates:
            missing_stems.append(frame.stem)
            collected_frames += 1
            report(1, "Collecting candidate boxes", collected_frames, collection_total, f"{frame.stem}: no boxes")
            continue

        progress = (frame_index - start_index) / index_distance if index_distance else 0.5
        expected_bbox = _interpolated_bbox(req.start, req.end, progress)
        expected_center = _interpolated_center(req.start, req.end, progress)
        candidate_ious = {
            candidate.annotation_id: _bbox_iou(candidate_bbox(candidate.model_dump()), expected_bbox)
            for candidate in candidates
        }
        overlapping_candidates = [
            candidate for candidate in candidates
            if candidate_ious.get(candidate.annotation_id, 0.0) > 0.0
        ]
        # Use the interpolated box as a hard pre-filter when it overlaps any
        # detection. If detector jitter leaves no overlap, retain the old
        # all-candidate fallback so a track is not lost solely because the
        # predicted box missed by a few pixels.
        reid_candidates = overlapping_candidates or candidates
        logger.info(
            "REID_FRAME_FILTER stem=%s candidates=%s overlap=%s evaluated=%s",
            shorten(frame.stem, 200),
            len(candidates),
            len(overlapping_candidates),
            len(reid_candidates),
        )
        candidate_plans.append({
            "frame": frame,
            "candidates": reid_candidates,
            "candidate_ious": candidate_ious,
            "expected_bbox": expected_bbox,
            "expected_center": expected_center,
            "best": None,
            "best_iou": 0.0,
        })
        candidate_work.extend((candidate_plans[-1], candidate) for candidate in reid_candidates)
        total_reid_candidates += len(reid_candidates)
        collected_frames += 1
        report(
            1,
            "Collecting candidate boxes",
            collected_frames,
            collection_total,
            f"{frame.stem}: {len(reid_candidates)} boxes",
        )

    report(1, "Collecting candidate boxes", collection_total, collection_total, f"{len(candidate_work)} boxes collected")

    try:
        report(2, "Loading ReID model", 0, 1, "Loading ONNX model")
        encoder.load()
        report(2, "Loading ReID model", 1, 1, "Model ready")
        report(3, "Extracting anchor features", 0, 2, "Start candidate")
        anchor_items = [
            (start_frame.image_path, req.start.points),
            (end_frame.image_path, req.end.points),
        ]
        anchor_batch_size = max(1, encoder.effective_batch_size(len(anchor_items)))
        anchor_embeddings: list[Optional[np.ndarray]] = []
        for batch_start in range(0, len(anchor_items), anchor_batch_size):
            anchor_embeddings.extend(encoder.embed_batch(anchor_items[batch_start:batch_start + anchor_batch_size]))
        start_embedding, end_embedding = anchor_embeddings
        if start_embedding is None or end_embedding is None:
            raise ReIDUnavailableError("Unable to create ReID embeddings for the locked anchors.")
        report(3, "Extracting anchor features", 1, 2, "End candidate")
        report(3, "Extracting anchor features", 2, 2, "Reference feature ready")
        reference = np.asarray(start_embedding + end_embedding, dtype=np.float32)
        reference = reference / max(float(np.linalg.norm(reference)), 1e-8)
    except (OSError, ValueError, ReIDUnavailableError) as exc:
        logger.warning("REID_ASSOCIATE_SETUP_ERROR error=%s", shorten(str(exc), 1500))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("REID_ASSOCIATE_SETUP_UNEXPECTED_ERROR error=%s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected ReID model error: {shorten(str(exc), 600)}",
        ) from exc

    progress_total = max(total_reid_candidates, 1)
    report(4, "Running ReID", 0, progress_total, f"{len(candidate_work)} boxes ready")
    processed_candidates = 0
    requested_batch_size = max(1, int(req.batch_size))
    effective_batch_size = encoder.effective_batch_size(requested_batch_size)
    logger.info(
        "REID_BATCH_CONFIG requested=%s effective=%s model_batch=%s candidates=%s",
        requested_batch_size,
        effective_batch_size,
        encoder.input_batch_size or "dynamic",
        len(candidate_work),
    )

    def embed_with_single_fallback(
        work_batch: list[tuple[dict[str, Any], TrackIdCandidate]],
    ) -> list[Optional[np.ndarray]]:
        items = [
            (plan["frame"].image_path, candidate.points)
            for plan, candidate in work_batch
        ]
        try:
            return encoder.embed_batch(items)
        except Exception as exc:
            logger.warning(
                "REID_BATCH_FALLBACK batch=%s error=%s",
                len(work_batch),
                shorten(str(exc), 1000),
            )
            embeddings: list[Optional[np.ndarray]] = []
            for plan, candidate in work_batch:
                try:
                    embeddings.append(encoder.embed(plan["frame"].image_path, candidate.points))
                except Exception as single_exc:
                    logger.warning(
                        "REID_CANDIDATE_SKIP stem=%s annotation=%s error=%s",
                        plan["frame"].stem,
                        candidate.annotation_id,
                        shorten(str(single_exc), 800),
                    )
                    embeddings.append(None)
            return embeddings

    for batch_start in range(0, len(candidate_work), effective_batch_size):
        work_batch = candidate_work[batch_start:batch_start + effective_batch_size]
        embeddings = embed_with_single_fallback(work_batch)
        for (plan, candidate), embedding in zip(work_batch, embeddings):
            frame = plan["frame"]
            if embedding is None:
                processed_candidates += 1
                report(4, "Running ReID", processed_candidates, progress_total, frame.stem)
                continue

            similarity = cosine_similarity(reference, embedding)
            candidate_iou = plan["candidate_ious"].get(candidate.annotation_id, 0.0)
            location = (
                candidate_iou
                if plan["expected_bbox"] is not None and candidate_iou > 0.0
                else _location_score(candidate, plan["expected_center"])
            )
            combined = similarity * (1.0 - req.location_weight) + location * req.location_weight
            score = (combined, similarity, candidate)
            best = plan["best"]
            if best is None or score[:2] > best[:2]:
                plan["best"] = score
                plan["best_iou"] = candidate_iou
            processed_candidates += 1
            report(4, "Running ReID", processed_candidates, progress_total, frame.stem)

    for plan in candidate_plans:
        frame = plan["frame"]
        best = plan["best"]
        best_iou = plan["best_iou"]
        if best is None or best[1] < req.min_similarity:
            missing_stems.append(frame.stem)
            continue
        combined, similarity, candidate = best
        assignments.append(
            {
                "stem": frame.stem,
                "annotation_id": candidate.annotation_id,
                "track_id": req.track_id,
                "score": round(float(similarity), 5),
                "combined_score": round(float(combined), 5),
                "iou": round(float(best_iou), 5),
                "method": "reid_iou" if best_iou > 0.0 else "reid_fallback",
            }
        )

    assignments.sort(key=lambda assignment: next(
        index for index, frame in enumerate(req.frames) if frame.stem == assignment["stem"]
    ))
    result = {
        "track_id": req.track_id,
        "assignments": assignments,
        "missing_stems": missing_stems,
        "matched_frames": len(assignments),
        "total_frames": len(req.frames),
        "model_name": Path(encoder.model_path).name if encoder.model_path else "",
    }
    logger.info(
        "REID_ASSOCIATE_END track_id=%s matched=%s total=%s missing=%s",
        shorten(req.track_id, 200),
        result["matched_frames"],
        result["total_frames"],
        len(missing_stems),
    )
    return result


async def _run_reid_job(job_id: str, req: TrackIdReIDRequest) -> None:
    _update_reid_job(job_id, status="running", message="Starting ReID")

    def progress_callback(stage_index: int, stage_name: str, current: int, total: int, message: str) -> None:
        _publish_reid_progress(job_id, stage_index, stage_name, current, total, message)

    try:
        result = await asyncio.to_thread(_associate_track_id_sync, req, progress_callback)
        _update_reid_job(
            job_id,
            status="completed",
            stage_index=REID_STAGE_COUNT,
            stage_count=REID_STAGE_COUNT,
            stage_name="Completed",
            current=1,
            total=1,
            percent=100,
            message="ReID completed",
            result=result,
            error=None,
        )
    except HTTPException as exc:
        message = str(exc.detail)
        logger.warning("REID_JOB_ERROR job_id=%s status=%s error=%s", job_id, exc.status_code, shorten(message, 1500))
        _update_reid_job(job_id, status="failed", message=message, error=message)
    except Exception as exc:
        logger.exception("REID_JOB_UNEXPECTED_ERROR job_id=%s error=%s", job_id, exc)
        message = str(exc) or "Unexpected ReID error."
        _update_reid_job(job_id, status="failed", message=message, error=message)
    finally:
        _reid_tasks.pop(job_id, None)


@router.post("/associate", status_code=202)
async def associate_track_id(req: TrackIdReIDRequest) -> dict[str, Any]:
    """Start ReID association in a background task and return its job state."""
    # Validate the request before creating a job so malformed input still gets
    # an immediate 4xx response instead of an asynchronous failure.
    _validate_track_id_request(req)
    job = _create_reid_job()
    job_id = job["job_id"]
    _reid_tasks[job_id] = asyncio.create_task(_run_reid_job(job_id, req))
    logger.info(
        "REID_JOB_START job_id=%s track_id=%s frames=%s",
        job_id,
        shorten(req.track_id, 200),
        len(req.frames),
    )
    return job


@router.get("/jobs/{job_id}")
async def get_reid_job(job_id: str) -> dict[str, Any]:
    """Return the current state and, when complete, result of a ReID job."""
    job = _get_reid_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="ReID job not found.")
    return job
