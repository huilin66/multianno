"""Track ID assistance endpoints."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

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


@router.post("/associate")
async def associate_track_id(req: TrackIdReIDRequest):
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

    logger.info(
        "REID_ASSOCIATE_START track_id=%s frames=%s start=%s end=%s",
        shorten(req.track_id, 200),
        len(req.frames),
        shorten(req.start.annotation_id, 200),
        shorten(req.end.annotation_id, 200),
    )
    try:
        encoder.load()
        start_embedding = encoder.embed(start_frame.image_path, req.start.points)
        end_embedding = encoder.embed(end_frame.image_path, req.end.points)
        reference = np.asarray(start_embedding + end_embedding, dtype=np.float32)
        reference = reference / max(float(np.linalg.norm(reference)), 1e-8)
    except (OSError, ValueError, ReIDUnavailableError) as exc:
        logger.warning("REID_ASSOCIATE_SETUP_ERROR error=%s", shorten(str(exc), 1500))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("REID_ASSOCIATE_SETUP_UNEXPECTED_ERROR error=%s", exc)
        raise HTTPException(status_code=500, detail="Unexpected ReID model error.") from exc

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

    for frame_index, frame in enumerate(req.frames):
        if frame.stem in {req.start.stem, req.end.stem}:
            continue
        candidates = frame.candidates
        if req.same_label_only and anchor_label:
            same_label = [candidate for candidate in candidates if candidate.label.strip() == anchor_label]
            if same_label:
                candidates = same_label
        if not candidates:
            missing_stems.append(frame.stem)
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
        best: Optional[tuple[float, float, TrackIdCandidate]] = None
        best_iou = 0.0
        for candidate in reid_candidates:
            try:
                embedding = encoder.embed(frame.image_path, candidate.points)
            except (OSError, ValueError, ReIDUnavailableError) as exc:
                logger.warning(
                    "REID_CANDIDATE_SKIP stem=%s annotation=%s error=%s",
                    frame.stem,
                    candidate.annotation_id,
                    shorten(str(exc), 800),
                )
                continue
            similarity = cosine_similarity(reference, embedding)
            candidate_iou = candidate_ious.get(candidate.annotation_id, 0.0)
            location = candidate_iou if expected_bbox is not None and candidate_iou > 0.0 else _location_score(candidate, expected_center)
            combined = similarity * (1.0 - req.location_weight) + location * req.location_weight
            score = (combined, similarity, candidate)
            if best is None or score[:2] > best[:2]:
                best = score
                best_iou = candidate_iou

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
