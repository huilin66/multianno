"""OpenAI-compatible vision-language model proxy.

The browser talks to this local router instead of calling a provider directly.
This keeps provider credentials out of project metadata and localStorage, and
also lets the backend prepare raw/TIFF images before sending them to a VLM.
"""

import base64
import binascii
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException

from models import VLMConfigRequest, VLMInferenceRequest
from utils.image_io import normalize_to_uint8, render_preview_rgb
from utils.logging_config import get_logger, shorten

try:
    import httpx
except (ImportError, OSError) as exc:  # pragma: no cover - environment dependent
    httpx = None
    HTTPX_IMPORT_ERROR = exc
else:
    HTTPX_IMPORT_ERROR = None


router = APIRouter(prefix="/api/ai/vlm", tags=["Vision Language Model"])
logger = get_logger("vlm")


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return default


# This state deliberately lives only for the backend process lifetime.  The
# non-secret fields are mirrored in the frontend for display, while api_key is
# never sent back to the browser or written to project metadata.
_vlm_config: dict[str, Any] = {
    "base_url": _env_first("MULTIANNO_VLM_BASE_URL", default="https://api.openai.com/v1"),
    "model": _env_first("MULTIANNO_VLM_MODEL", default="gpt-4o-mini"),
    "api_key": _env_first("MULTIANNO_VLM_API_KEY", "OPENAI_API_KEY"),
    "timeout": 90.0,
    "temperature": 0.1,
    "max_tokens": 1024,
}


def _normalise_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def _chat_completions_url(base_url: str) -> str:
    base = _normalise_base_url(base_url)
    if base.lower().endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _is_local_endpoint(base_url: str) -> bool:
    try:
        hostname = (urlparse(base_url).hostname or "").lower()
    except ValueError:
        return False
    return hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _is_configured() -> bool:
    # Local OpenAI-compatible servers such as Ollama commonly do not require
    # a key.  Remote endpoints are considered configured only when a key is
    # available, which gives the UI a useful status before an inference call.
    return bool(
        httpx is not None
        and _vlm_config.get("base_url")
        and _vlm_config.get("model")
        and (_vlm_config.get("api_key") or _is_local_endpoint(_vlm_config["base_url"]))
    )


def _public_status() -> dict[str, Any]:
    return {
        "is_available": httpx is not None,
        "is_configured": _is_configured(),
        "base_url": _vlm_config["base_url"],
        "model": _vlm_config["model"],
        "has_api_key": bool(_vlm_config.get("api_key")),
        "timeout": _vlm_config["timeout"],
        "temperature": _vlm_config["temperature"],
        "max_tokens": _vlm_config["max_tokens"],
        "detail": (
            f"httpx is unavailable: {HTTPX_IMPORT_ERROR}"
            if httpx is None and HTTPX_IMPORT_ERROR
            else None
        ),
    }


def _decode_image_data(image_data: str) -> np.ndarray:
    value = image_data.strip()
    if "," in value and value.lower().startswith("data:"):
        value = value.split(",", 1)[1]
    try:
        raw = base64.b64decode(value, validate=False)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"Invalid image_data: {exc}") from exc

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image_data is not a readable image")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def _load_image(req: VLMInferenceRequest) -> np.ndarray:
    if req.image_data:
        return _decode_image_data(req.image_data)
    if not req.image_path:
        raise ValueError("Either image_path or image_data is required")
    image_path = Path(req.image_path)
    if not image_path.is_file():
        raise FileNotFoundError(f"Image file not found: {req.image_path}")
    return normalize_to_uint8(render_preview_rgb(str(image_path)))


def _crop_image(image: np.ndarray, bbox: list[float] | None) -> tuple[np.ndarray, list[int] | None]:
    if not bbox:
        return image, None
    if len(bbox) != 4 or not all(np.isfinite(float(value)) for value in bbox):
        raise ValueError("bbox must contain four finite pixel coordinates")

    height, width = image.shape[:2]
    x1, y1, x2, y2 = [float(value) for value in bbox]
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    object_width = max(1.0, right - left)
    object_height = max(1.0, bottom - top)
    # A small context margin helps the model distinguish defects at an edge,
    # while still keeping the request focused on the selected object.
    margin_x = max(4.0, object_width * 0.05)
    margin_y = max(4.0, object_height * 0.05)
    left = max(0, int(np.floor(left - margin_x)))
    top = max(0, int(np.floor(top - margin_y)))
    right = min(width, int(np.ceil(right + margin_x)))
    bottom = min(height, int(np.ceil(bottom + margin_y)))
    if right <= left or bottom <= top:
        raise ValueError("bbox does not intersect the image")
    return image[top:bottom, left:right], [left, top, right, bottom]


def _image_data_url(image: np.ndarray) -> str:
    image = normalize_to_uint8(image)
    height, width = image.shape[:2]
    max_side = 1536
    if max(height, width) > max_side:
        scale = max_side / max(height, width)
        image = cv2.resize(
            image,
            (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
            interpolation=cv2.INTER_AREA,
        )

    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    encoded_ok, encoded = cv2.imencode(
        ".jpg",
        bgr,
        [int(cv2.IMWRITE_JPEG_QUALITY), 90],
    )
    if not encoded_ok:
        raise ValueError("Failed to encode image for VLM")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def _taxonomy_attributes(taxonomy: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(taxonomy, dict):
        return []
    raw_attributes = taxonomy.get("attributes", [])
    if not isinstance(raw_attributes, list):
        return []

    result: list[dict[str, Any]] = []
    for item in raw_attributes:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        raw_values = item.get("values", item.get("options", []))
        values = [str(value).strip() for value in raw_values] if isinstance(raw_values, list) else []
        values = [value for value in values if value]
        result.append({"name": name, "values": values})
    return result


def _build_prompt(req: VLMInferenceRequest) -> str:
    if req.mode == "attributes":
        attributes = _taxonomy_attributes(req.taxonomy)
        if not attributes:
            raise ValueError("No taxonomy attributes were provided")
        taxonomy_text = json.dumps(attributes, ensure_ascii=False, separators=(",", ":"))
        class_text = req.class_name.strip() if req.class_name else "the selected object"
        user_instruction = req.prompt.strip() or "Evaluate the selected object's attributes for annotation."
        return (
            "You are an image inspection assistant. Analyze "
            f"{class_text} in the supplied image crop. {user_instruction}\n"
            "Return JSON only, without Markdown or extra text, using exactly this shape:\n"
            '{"attributes":[{"name":"attribute_name","value":"allowed_value",'
            '"confidence":0.0,"evidence":"short visual reason"}]}\n'
            "Only return attributes from this taxonomy, and use the exact allowed value spelling. "
            "If an attribute cannot be determined, still return its best allowed value with a lower "
            "confidence. Do not invent attributes or values.\n"
            f"Allowed taxonomy: {taxonomy_text}"
        )

    user_instruction = req.prompt.strip() or "Describe the most relevant visual finding in this image."
    return (
        "You are a visual inspection assistant. Answer the user's question about the supplied image. "
        "Return JSON only, without Markdown or extra text, using exactly this shape:\n"
        '{"answer":" concise answer"}\n'
        f"User question: {user_instruction}"
    )


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts).strip()
    return ""


def _parse_json_response(text: str) -> Any:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Some compatible servers prepend a short sentence despite the JSON
        # instruction.  Recover the first complete object/array if possible.
        starts = [index for index in (cleaned.find("{"), cleaned.find("[")) if index >= 0]
        if not starts:
            raise ValueError("VLM response is not valid JSON")
        start = min(starts)
        for end in range(len(cleaned), start, -1):
            candidate = cleaned[start:end].strip()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
        raise ValueError("VLM response is not valid JSON")


def _canonical_value(value: Any, allowed: list[str]) -> str:
    text = str(value).strip()
    if not allowed:
        return text
    for candidate in allowed:
        if candidate == text or candidate.lower() == text.lower():
            return candidate
    return ""


def _normalise_attribute_results(payload: Any, taxonomy: dict[str, Any] | None) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        raw_results = payload.get("attributes", [])
    elif isinstance(payload, list):
        raw_results = payload
    else:
        raw_results = []
    if not isinstance(raw_results, list):
        return []

    allowed_by_name = {
        item["name"]: item.get("values", [])
        for item in _taxonomy_attributes(taxonomy)
    }
    allowed_by_lower = {name.lower(): (name, values) for name, values in allowed_by_name.items()}
    results: list[dict[str, Any]] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        raw_name = str(item.get("name", "")).strip()
        canonical_name, allowed_values = allowed_by_lower.get(
            raw_name.lower(),
            ("", []),
        )
        if not canonical_name:
            continue
        value = _canonical_value(item.get("value", ""), allowed_values)
        if not value:
            continue
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        evidence = str(item.get("evidence", "")).strip()
        results.append(
            {
                "name": canonical_name,
                "value": value,
                "confidence": confidence,
                "evidence": evidence[:500],
            }
        )
    return results


async def _call_provider(prompt: str, image_url: str) -> tuple[str, dict[str, Any] | None]:
    if httpx is None:
        raise RuntimeError(_public_status()["detail"] or "httpx is not installed")

    headers = {"Content-Type": "application/json"}
    api_key = str(_vlm_config.get("api_key") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": _vlm_config["model"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        "temperature": _vlm_config["temperature"],
        "max_tokens": _vlm_config["max_tokens"],
    }
    url = _chat_completions_url(_vlm_config["base_url"])
    logger.info(
        "VLM_PROVIDER_START url=%s model=%s image_bytes=%s",
        shorten(url, 1000),
        _vlm_config["model"],
        len(image_url),
    )
    try:
        async with httpx.AsyncClient(timeout=_vlm_config["timeout"]) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        logger.warning("VLM_PROVIDER_TIMEOUT model=%s", _vlm_config["model"])
        raise RuntimeError("VLM provider request timed out") from exc
    except httpx.HTTPError as exc:
        logger.warning("VLM_PROVIDER_CONNECTION_ERROR error=%s", exc)
        raise RuntimeError(f"VLM provider connection failed: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text[:1200].replace("\n", " ")
        logger.warning(
            "VLM_PROVIDER_ERROR status=%s detail=%s",
            response.status_code,
            shorten(detail, 1200),
        )
        raise RuntimeError(f"VLM provider returned HTTP {response.status_code}: {detail}")

    try:
        response_payload = response.json()
    except ValueError as exc:
        raise RuntimeError("VLM provider returned a non-JSON response") from exc
    choices = response_payload.get("choices") if isinstance(response_payload, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("VLM provider response has no choices")
    message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
    content = _content_to_text(message.get("content")) if isinstance(message, dict) else ""
    if not content:
        raise RuntimeError("VLM provider response has no message content")
    usage = response_payload.get("usage") if isinstance(response_payload, dict) else None
    return content, usage if isinstance(usage, dict) else None


@router.get("/status")
async def get_vlm_status():
    status = _public_status()
    logger.info(
        "VLM_STATUS available=%s configured=%s model=%s has_api_key=%s",
        status["is_available"],
        status["is_configured"],
        status["model"],
        status["has_api_key"],
    )
    return status


@router.post("/config")
async def update_vlm_config(req: VLMConfigRequest):
    base_url = _normalise_base_url(req.base_url)
    model = req.model.strip()
    if not base_url or not model:
        raise HTTPException(status_code=400, detail="VLM base URL and model are required")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="VLM base URL must be an http(s) URL")
    if httpx is None:
        raise HTTPException(status_code=503, detail=_public_status()["detail"])

    _vlm_config.update(
        {
            "base_url": base_url,
            "model": model,
            "timeout": req.timeout,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }
    )
    # None means the user left the password box empty: preserve an existing
    # runtime key (including one supplied through the environment).
    if req.api_key is not None and req.api_key.strip():
        _vlm_config["api_key"] = req.api_key.strip()

    logger.info(
        "VLM_CONFIG_END base_url=%s model=%s has_api_key=%s timeout=%s",
        shorten(base_url, 1000),
        model,
        bool(_vlm_config.get("api_key")),
        req.timeout,
    )
    return {"status": "success", **_public_status()}


@router.post("/infer")
async def infer_vlm(req: VLMInferenceRequest):
    status = _public_status()
    if not status["is_available"]:
        raise HTTPException(status_code=503, detail=status["detail"] or "VLM support is unavailable")
    if not status["is_configured"]:
        raise HTTPException(
            status_code=400,
            detail="VLM is not configured. Set an API key or use a local OpenAI-compatible endpoint.",
        )

    logger.info(
        "VLM_INFER_START mode=%s image_path=%s has_image_data=%s bbox=%s class=%s",
        req.mode,
        shorten(req.image_path, 1200),
        bool(req.image_data),
        req.bbox,
        shorten(req.class_name, 300),
    )
    try:
        image = _load_image(req)
        original_height, original_width = image.shape[:2]
        image, crop_bbox = _crop_image(image, req.bbox)
        image_url = _image_data_url(image)
        prompt = _build_prompt(req)
        raw_text, usage = await _call_provider(prompt, image_url)
        parsed = _parse_json_response(raw_text)

        response: dict[str, Any] = {
            "mode": req.mode,
            "attributes": [],
            "answer": None,
            "usage": usage,
            "image_width": original_width,
            "image_height": original_height,
            "crop_bbox": crop_bbox,
        }
        if req.mode == "attributes":
            response["attributes"] = _normalise_attribute_results(parsed, req.taxonomy)
        else:
            answer = parsed.get("answer") if isinstance(parsed, dict) else parsed
            response["answer"] = str(answer).strip() if answer is not None else ""

        logger.info(
            "VLM_INFER_END mode=%s attributes=%s has_answer=%s",
            req.mode,
            len(response["attributes"]),
            bool(response["answer"]),
        )
        return response
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        logger.warning("VLM_INFER_IMAGE_NOT_FOUND error=%s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        logger.warning("VLM_INFER_ERROR error=%s", shorten(str(exc), 1500))
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive boundary
        logger.exception("VLM_INFER_UNEXPECTED_ERROR error=%s", exc)
        raise HTTPException(status_code=500, detail="Unexpected VLM inference error") from exc
