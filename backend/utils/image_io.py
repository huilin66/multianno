import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from skimage import io

try:
    import rawpy
except Exception as exc:  # pragma: no cover - depends on optional install
    rawpy = None
    RAWPY_IMPORT_ERROR = exc
else:
    RAWPY_IMPORT_ERROR = None

try:
    from pidng.core import DNGTags, RAW2DNG, Tag
    from pidng.defs import (
        CalibrationIlluminant,
        CFAPattern,
        DNGVersion,
        Orientation,
        PhotometricInterpretation,
        PreviewColorSpace,
    )
except Exception:  # pragma: no cover - depends on optional install
    RAW2DNG = None
    DNGTags = None
    Tag = None
    CalibrationIlluminant = None
    CFAPattern = None
    DNGVersion = None
    Orientation = None
    PhotometricInterpretation = None
    PreviewColorSpace = None
    PIDNG_AVAILABLE = False
else:
    PIDNG_AVAILABLE = True


STANDARD_IMAGE_EXTS = {
    ".tif",
    ".tiff",
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".webp",
}

RAW_IMAGE_EXTS = {
    ".3fr",
    ".arw",
    ".srf",
    ".sr2",
    ".bay",
    ".crw",
    ".cr2",
    ".cr3",
    ".cap",
    ".iiq",
    ".eip",
    ".dcs",
    ".dcr",
    ".drf",
    ".k25",
    ".kdc",
    ".dng",
    ".erf",
    ".fff",
    ".mef",
    ".mos",
    ".mrw",
    ".nef",
    ".nrw",
    ".orf",
    ".ptx",
    ".pef",
    ".pxn",
    ".r3d",
    ".raf",
    ".raw",
    ".rw2",
    ".rwl",
    ".rwz",
    ".x3f",
    ".srw",
}

SUPPORTED_IMAGE_EXTS = tuple(sorted(STANDARD_IMAGE_EXTS | RAW_IMAGE_EXTS))

DNG_STYLE_CCM = np.array(
    [
        [0.6668, -0.1588, -0.0857],
        [-0.5739, 1.3898, 0.1430],
        [-0.1378, 0.2651, 0.6036],
    ],
    dtype=np.float32,
)

DNG_STYLE_CCM_RATIONALS = [
    [+6668, 10000],
    [-1588, 10000],
    [-857, 10000],
    [-5739, 10000],
    [13898, 10000],
    [+1430, 10000],
    [-1378, 10000],
    [+2651, 10000],
    [+6036, 10000],
]


class RawDependencyError(RuntimeError):
    pass


def raw_support_status() -> dict[str, Any]:
    return {
        "rawpy_available": rawpy is not None,
        "pidng_available": PIDNG_AVAILABLE,
        "rawpy_error": str(RAWPY_IMPORT_ERROR) if RAWPY_IMPORT_ERROR else "",
    }


def is_supported_image(path_or_name: str) -> bool:
    return Path(path_or_name).suffix.lower() in SUPPORTED_IMAGE_EXTS


def is_raw_image(path_or_name: str) -> bool:
    return Path(path_or_name).suffix.lower() in RAW_IMAGE_EXTS


def split_bands_param(bands: str | list[int] | tuple[int, ...] | None) -> list[int]:
    if isinstance(bands, (list, tuple)):
        return [int(b) - 1 for b in bands if int(b) > 0]
    if not bands:
        return []
    out = []
    for b in str(bands).split(","):
        b = b.strip()
        if b.isdigit() and int(b) > 0:
            out.append(int(b) - 1)
    return out


def find_image_path(folder_path: str, file_name: str = "") -> Optional[str]:
    if not os.path.exists(folder_path):
        return None

    if file_name:
        target_stem = Path(file_name).stem
        for f in os.listdir(folder_path):
            if is_supported_image(f) and Path(f).stem == target_stem:
                return os.path.join(folder_path, f)

        direct_path = os.path.join(folder_path, file_name)
        if os.path.exists(direct_path):
            return direct_path
        return None

    image_files = [f for f in os.listdir(folder_path) if is_supported_image(f)]
    if not image_files:
        return None
    return os.path.join(folder_path, sorted(image_files)[0])


def _require_rawpy() -> None:
    if rawpy is None:
        detail = "RAW support requires optional dependency rawpy."
        if RAWPY_IMPORT_ERROR:
            detail += f" Import error: {RAWPY_IMPORT_ERROR}"
        raise RawDependencyError(detail)


def _rawpy_kwargs(half_size: bool = False) -> dict[str, Any]:
    _require_rawpy()
    kwargs = {
        "bright": 1.0,
        "half_size": half_size,
        "use_auto_wb": True,
        "use_camera_wb": True,
        "output_color": getattr(rawpy.ColorSpace, "sRGB", None),
        "output_bps": 8,
        "no_auto_bright": True,
        "auto_bright_thr": 0.01,
        "gamma": (2.4, 12.92),
    }

    if "use_camera_matrix" in getattr(rawpy.Params, "__annotations__", {}) or hasattr(
        rawpy, "UseCameraMatrix"
    ):
        kwargs["use_camera_matrix"] = True

    user_flip = getattr(rawpy, "UserFlip", None)
    if user_flip is not None:
        for name in ("CameraDefault", "FromSource", "FROM_SOURCE"):
            if hasattr(user_flip, name):
                kwargs["user_flip"] = getattr(user_flip, name)
                break

    demosaic = getattr(rawpy, "DemosaicAlgorithm", None)
    if demosaic is not None:
        for name in ("PPG", "AHD"):
            if hasattr(demosaic, name):
                kwargs["demosaic_algorithm"] = getattr(demosaic, name)
                break

    highlight = getattr(rawpy, "HighlightMode", None)
    if highlight is not None:
        for name in ("Clip", "CLIP"):
            if hasattr(highlight, name):
                kwargs["highlight_mode"] = getattr(highlight, name)
                break

    return {k: v for k, v in kwargs.items() if v is not None}


def _shift_with_zero(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    h, w = arr.shape
    out = np.zeros_like(arr)
    ys = slice(max(0, dy), min(h, h + dy))
    yt = slice(max(0, -dy), min(h, h - dy))
    xs = slice(max(0, dx), min(w, w + dx))
    xt = slice(max(0, -dx), min(w, w - dx))
    out[ys, xs] = arr[yt, xt]
    return out


def _demosaic_bilinear_linear(raw: np.ndarray, pattern: str) -> tuple[np.ndarray, np.ndarray]:
    pattern = (pattern or "RGGB").upper()
    if len(pattern) != 4 or any(c not in "RGB" for c in pattern):
        pattern = "RGGB"
    idx = {"R": 0, "G": 1, "B": 2}
    p = [[idx[pattern[0]], idx[pattern[1]]], [idx[pattern[2]], idx[pattern[3]]]]
    h, w = raw.shape
    cfa = np.zeros((h, w), dtype=np.uint8)
    cfa[0::2, 0::2] = p[0][0]
    cfa[0::2, 1::2] = p[0][1]
    cfa[1::2, 0::2] = p[1][0]
    cfa[1::2, 1::2] = p[1][1]

    channels = []
    raw_float = raw.astype(np.float32)
    for ci in (0, 1, 2):
        mask = (cfa == ci).astype(np.float32)
        values = raw_float * mask
        sums = np.zeros_like(raw_float, dtype=np.float32)
        counts = np.zeros_like(raw_float, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                sums += _shift_with_zero(values, dy, dx)
                counts += _shift_with_zero(mask, dy, dx)
        channels.append(sums / np.maximum(counts, 1e-6))

    return np.stack(channels, axis=-1), cfa


def _unpack_mipi10(buf: np.ndarray, width: int, height: int) -> np.ndarray:
    stride = (width * 10 + 7) // 8
    need = stride * height
    if buf.size < need:
        raise ValueError("RAW10 data is shorter than width/height require.")
    buf = buf[:need].reshape(height, stride)
    out = np.zeros((height, width), dtype=np.uint16)
    groups = width // 4
    for y in range(height):
        row = buf[y]
        for g in range(groups):
            b0, b1, b2, b3, b4 = row[g * 5 : g * 5 + 5]
            x = g * 4
            out[y, x + 0] = (int(b0) << 2) | (int(b4) & 0x03)
            out[y, x + 1] = (int(b1) << 2) | ((int(b4) >> 2) & 0x03)
            out[y, x + 2] = (int(b2) << 2) | ((int(b4) >> 4) & 0x03)
            out[y, x + 3] = (int(b3) << 2) | ((int(b4) >> 6) & 0x03)
    return out


def _unpack_mipi12(buf: np.ndarray, width: int, height: int) -> np.ndarray:
    stride = (width * 12 + 7) // 8
    need = stride * height
    if buf.size < need:
        raise ValueError("RAW12 data is shorter than width/height require.")
    buf = buf[:need].reshape(height, stride)
    out = np.zeros((height, width), dtype=np.uint16)
    pairs = width // 2
    for y in range(height):
        row = buf[y]
        for p in range(pairs):
            b0, b1, b2 = row[p * 3 : p * 3 + 3]
            x = p * 2
            out[y, x + 0] = (int(b0) << 4) | (int(b2) & 0x0F)
            out[y, x + 1] = (int(b1) << 4) | ((int(b2) >> 4) & 0x0F)
    return out


def _pattern_to_pidng(pattern: str):
    if not PIDNG_AVAILABLE:
        return None
    return {
        "RGGB": CFAPattern.RGGB,
        "BGGR": CFAPattern.BGGR,
        "GRBG": CFAPattern.GRBG,
        "GBRG": CFAPattern.GBRG,
    }.get(str(pattern).upper(), CFAPattern.RGGB)


def _wb_to_as_shot_neutral(wb_enabled: bool, wb: tuple[float, float, float]):
    if not wb_enabled:
        return [[1000, 1000], [1000, 1000], [1000, 1000]]
    gains = np.array(wb, dtype=np.float64)
    gains = np.where(gains > 1e-6, gains, 1.0)
    neutral = np.clip(1.0 / gains, 1e-6, 64.0)
    return [[int(round(v * 1000.0)), 1000] for v in neutral.tolist()]


def _plain_raw_temp_dng_to_rgb(
    raw: np.ndarray,
    pattern: str,
    bit: int,
    black_level: float,
    white_level: float,
    wb_enabled: bool,
    wb: tuple[float, float, float],
) -> Optional[np.ndarray]:
    if not PIDNG_AVAILABLE or rawpy is None:
        return None

    bits_per_sample = max(1, min(16, int(bit)))
    tag_white = int(max(1.0, min(float((1 << bits_per_sample) - 1), float(white_level))))
    tag_black = int(max(0.0, min(float(tag_white - 1), float(black_level))))

    tags = DNGTags()
    tags.set(Tag.ImageLength, int(raw.shape[0]))
    tags.set(Tag.ImageWidth, int(raw.shape[1]))
    tags.set(Tag.TileLength, int(raw.shape[0]))
    tags.set(Tag.TileWidth, int(raw.shape[1]))
    tags.set(Tag.Orientation, Orientation.Horizontal)
    tags.set(Tag.PhotometricInterpretation, PhotometricInterpretation.Color_Filter_Array)
    tags.set(Tag.SamplesPerPixel, 1)
    tags.set(Tag.BitsPerSample, bits_per_sample)
    tags.set(Tag.CFARepeatPatternDim, [2, 2])
    tags.set(Tag.CFAPattern, _pattern_to_pidng(pattern))
    tags.set(Tag.BlackLevel, tag_black)
    tags.set(Tag.WhiteLevel, tag_white)
    tags.set(Tag.ColorMatrix1, DNG_STYLE_CCM_RATIONALS)
    tags.set(Tag.CalibrationIlluminant1, CalibrationIlluminant.D65)
    tags.set(Tag.AsShotNeutral, _wb_to_as_shot_neutral(wb_enabled, wb))
    tags.set(Tag.BaselineExposure, [[-150, 100]])
    tags.set(Tag.Make, "MultiAnno")
    tags.set(Tag.Model, "Plain RAW")
    tags.set(Tag.DNGVersion, DNGVersion.V1_4)
    tags.set(Tag.DNGBackwardVersion, DNGVersion.V1_2)
    tags.set(Tag.PreviewColorSpace, PreviewColorSpace.sRGB)

    fd, tmp_path = tempfile.mkstemp(prefix="multianno_raw_", suffix=".dng")
    os.close(fd)
    try:
        writer = RAW2DNG()
        writer.options(tags, path="", compress=False)
        writer.convert(raw, filename=tmp_path)
        rgb, _raw_info = _load_rawpy_image(tmp_path)
        return rgb
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _linear_rgb_to_srgb(
    rgb: np.ndarray,
    black_level: float,
    white_level: float,
    exposure_gain: float,
    wb: tuple[float, float, float],
) -> np.ndarray:
    lo = float(max(0.0, black_level))
    hi = float(max(lo + 1.0, white_level))
    arr = np.clip((rgb - lo) / max(1.0, hi - lo), 0.0, 1.0)
    arr = np.clip(arr * float(max(0.01, exposure_gain)), 0.0, 1.0)
    gains = np.array(wb, dtype=np.float32)
    gains = np.where(gains > 1e-6, gains, 1.0)
    arr *= gains.reshape(1, 1, 3)
    arr = arr @ DNG_STYLE_CCM.T
    arr *= np.float32(2.0**-1.5)
    arr = np.clip(arr, 0.0, 1.0)
    srgb = np.where(arr <= 0.0031308, arr * 12.92, 1.055 * np.power(arr, 1.0 / 2.4) - 0.055)
    return np.clip(srgb * 255.0, 0, 255).astype(np.uint8)


def render_plain_raw_with_matrix(
    raw: np.ndarray,
    pattern: str,
    black_level: float,
    white_level: float,
    exposure_gain: float,
    wb_enabled: bool,
    wb: tuple[float, float, float],
    bit: int,
    prefer_temp_dng: bool = True,
) -> np.ndarray:
    if prefer_temp_dng:
        rgb = _plain_raw_temp_dng_to_rgb(
            raw,
            pattern=pattern,
            bit=bit,
            black_level=black_level,
            white_level=white_level,
            wb_enabled=wb_enabled,
            wb=wb,
        )
        if rgb is not None:
            return rgb

    linear_rgb, _cfa = _demosaic_bilinear_linear(raw, pattern)
    gains = wb if wb_enabled else (1.0, 1.0, 1.0)
    return _linear_rgb_to_srgb(
        linear_rgb,
        black_level=black_level,
        white_level=white_level,
        exposure_gain=exposure_gain,
        wb=gains,
    )


def _plain_raw_profile_value(profile: Optional[dict[str, Any]], *keys: str, default: Any = None) -> Any:
    profile = profile or {}
    for key in keys:
        if key in profile and profile[key] not in (None, ""):
            return profile[key]
    return default


def _load_plain_raw(path: str, profile: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    width = int(_plain_raw_profile_value(profile, "width", "w"))
    height = int(_plain_raw_profile_value(profile, "height", "h"))
    bit = int(_plain_raw_profile_value(profile, "bit", "bitDepth", "bit_depth", default=16))
    pattern = str(_plain_raw_profile_value(profile, "pattern", "bayer", default="RGGB")).upper()
    packing = str(_plain_raw_profile_value(profile, "packing", default="u16")).lower()
    if pattern not in {"RGGB", "BGGR", "GRBG", "GBRG"}:
        raise ValueError("Plain RAW Bayer pattern must be RGGB, BGGR, GRBG, or GBRG.")

    buf = np.fromfile(path, dtype=np.uint8)
    if packing == "mipi10":
        raw = _unpack_mipi10(buf, width, height)
    elif packing == "mipi12":
        raw = _unpack_mipi12(buf, width, height)
    elif packing == "u8":
        need = width * height
        if buf.size < need:
            raise ValueError("u8 RAW data is shorter than width/height require.")
        raw = buf[:need].reshape(height, width).astype(np.uint16)
    else:
        raw16 = np.fromfile(path, dtype="<u2")
        need = width * height
        if raw16.size < need:
            raise ValueError("u16 RAW data is shorter than width/height require.")
        raw = raw16[:need].reshape(height, width)

    mask = (1 << bit) - 1 if 1 <= bit <= 16 else 0xFFFF
    raw = (raw & mask).astype(np.uint16)
    _linear_rgb, cfa = _demosaic_bilinear_linear(raw, pattern)
    white_level = int(mask)
    rgb = render_plain_raw_with_matrix(
        raw,
        pattern=pattern,
        black_level=0,
        white_level=white_level,
        exposure_gain=1.0,
        wb_enabled=False,
        wb=(1.0, 1.0, 1.0),
        bit=bit,
    )
    raw_info = {
        "raw": raw,
        "cfa": cfa,
        "desc": "RGB",
        "bit": bit,
        "black_level": 0,
        "white_level": white_level,
        "pattern": pattern,
        "plain_raw": True,
    }
    return np.ascontiguousarray(rgb), raw_info


def _load_rawpy_image(path: str) -> tuple[np.ndarray, dict[str, Any]]:
    _require_rawpy()
    with rawpy.imread(path) as raw:
        rgb = raw.postprocess(**_rawpy_kwargs(half_size=False))
        raw_visible = np.ascontiguousarray(raw.raw_image_visible.copy())
        cfa_visible = np.ascontiguousarray(raw.raw_colors_visible.copy())
        desc = getattr(raw, "color_desc", b"RGBG")
        if isinstance(desc, bytes):
            desc = desc.decode("ascii", errors="ignore") or "RGBG"
        white_level = getattr(raw, "white_level", None)
        bit = int(np.ceil(np.log2(max(2, int(white_level) + 1)))) if white_level else 16
        bit = max(1, min(16, bit))
        raw_info = {
            "raw": raw_visible,
            "cfa": cfa_visible,
            "desc": str(desc),
            "bit": bit,
            "black_level": 0,
            "white_level": int(white_level) if white_level else (1 << bit) - 1,
            "plain_raw": False,
        }
    return np.ascontiguousarray(rgb.astype(np.uint8, copy=False)), raw_info


def _can_open_with_rawpy(path: str) -> bool:
    if rawpy is None:
        return False
    try:
        with rawpy.imread(path):
            return True
    except Exception:
        return False


@lru_cache(maxsize=20)
def read_image_cached(image_path: str) -> np.ndarray:
    if is_raw_image(image_path):
        rgb, _raw_info = load_raw_image(image_path, None)
        return rgb
    return io.imread(image_path)


@lru_cache(maxsize=10)
def _load_raw_image_cached(image_path: str) -> tuple[np.ndarray, dict[str, Any]]:
    return load_raw_image(image_path, None)


def clear_image_cache() -> None:
    read_image_cached.cache_clear()
    _load_raw_image_cached.cache_clear()


def load_raw_image(path: str, raw_profile: Optional[dict[str, Any]] = None) -> tuple[np.ndarray, dict[str, Any]]:
    ext = Path(path).suffix.lower()
    if ext == ".raw" and raw_profile:
        return _load_plain_raw(path, raw_profile)
    if ext == ".raw" and not _can_open_with_rawpy(path):
        raise RawDependencyError("Plain .raw files require width, height, bit depth, Bayer pattern, and packing.")
    return _load_rawpy_image(path)


def _select_bands(img: np.ndarray, band_indices: list[int]) -> np.ndarray:
    if len(band_indices) == 1:
        idx = band_indices[0]
        if img.ndim == 2:
            out = img
        else:
            out = img[:, :, idx] if idx < img.shape[2] else img[:, :, 0]
        return np.stack([out] * 3, axis=-1)

    if len(band_indices) == 3:
        if img.ndim == 2:
            return np.stack([img] * 3, axis=-1)
        channels = []
        for idx in band_indices:
            channels.append(img[:, :, idx] if idx < img.shape[2] else np.zeros_like(img[:, :, 0]))
        return np.stack(channels, axis=-1)

    if img.ndim == 2:
        return np.stack([img] * 3, axis=-1)
    if img.shape[2] >= 3:
        return img[:, :, :3]
    if img.shape[2] == 1:
        return np.repeat(img, 3, axis=2)
    return img


def normalize_to_uint8(img: np.ndarray) -> np.ndarray:
    if img.size == 0:
        return np.zeros((1, 1, 3), dtype=np.uint8)
    if img.dtype == np.uint8 and float(np.max(img)) <= 255.0:
        out = img
    else:
        out = img.astype(np.float32)
        p2, p98 = np.percentile(out, (2, 98))
        if p98 <= p2:
            p2 = float(np.min(out))
            p98 = float(np.max(out)) if float(np.max(out)) > p2 else p2 + 1.0
        out = np.clip((out - p2) / (p98 - p2 + 1e-5) * 255.0, 0, 255).astype(np.uint8)

    if out.ndim == 2:
        return np.stack([out] * 3, axis=-1)
    if out.shape[2] >= 3:
        return out[:, :, :3]
    if out.shape[2] == 1:
        return np.repeat(out, 3, axis=2)
    return out


def _raw_channel_to_display_rgb(
    raw: np.ndarray,
    cfa: np.ndarray,
    desc: str,
    mode: str,
    display_bits: Optional[int],
    black_level: float,
    white_level: Optional[float],
    exposure_gain: float,
) -> np.ndarray:
    mode = (mode or "ALL").upper()
    if mode == "ALL":
        return _raw_to_display_rgb(raw, display_bits, black_level, white_level, exposure_gain)

    h, w = raw.shape
    desc = desc or "RGBG"
    mask = np.zeros((h, w), dtype=bool)
    if mode in ("R", "B"):
        for i in range(min(len(desc), 8)):
            if desc[i].upper() == mode:
                mask |= cfa == i
    elif mode in ("G1", "G2"):
        green = np.zeros((h, w), dtype=bool)
        for i in range(min(len(desc), 8)):
            if desc[i].upper() == "G":
                green |= cfa == i
        yy = np.indices((h, w))[0]
        mask = green & ((yy % 2 == 0) if mode == "G1" else (yy % 2 == 1))
    else:
        return _raw_to_display_rgb(raw, display_bits, black_level, white_level, exposure_gain)

    if not np.any(mask):
        return _raw_to_display_rgb(raw, display_bits, black_level, white_level, exposure_gain)
    selected = np.zeros_like(raw, dtype=raw.dtype)
    selected[mask] = raw[mask]
    return _raw_to_display_rgb(selected, display_bits, black_level, white_level, exposure_gain)


def _raw_to_display_rgb(
    raw: np.ndarray,
    display_bits: Optional[int],
    black_level: float,
    white_level: Optional[float],
    exposure_gain: float,
) -> np.ndarray:
    arr = raw.astype(np.float32)
    if display_bits is not None and 1 <= int(display_bits) <= 16:
        hi_default = float((1 << int(display_bits)) - 1)
        lo = float(max(0.0, black_level))
        hi = float(hi_default if white_level is None else max(lo + 1.0, white_level))
        norm = np.clip((arr - lo) / max(1.0, hi - lo), 0.0, 1.0)
        norm = np.clip(norm * float(max(0.01, exposure_gain)), 0.0, 1.0)
    else:
        lo = float(np.percentile(arr, 1.0))
        hi = float(np.percentile(arr, 99.5))
        if hi <= lo:
            lo = float(arr.min())
            hi = float(arr.max()) if float(arr.max()) > lo else lo + 1.0
        norm = np.clip((arr - lo) / (hi - lo), 0.0, 1.0)
    gray = (norm * 255.0).astype(np.uint8)
    return np.stack([gray, gray, gray], axis=-1)


def _settings_value(settings: Optional[dict[str, Any]], *keys: str, default: Any = None) -> Any:
    settings = settings or {}
    for key in keys:
        if key in settings and settings[key] not in (None, ""):
            return settings[key]
    return default


def render_preview_rgb(
    image_path: str,
    bands: str | list[int] | tuple[int, ...] | None = None,
    settings: Optional[dict[str, Any]] = None,
    raw_profile: Optional[dict[str, Any]] = None,
) -> np.ndarray:
    band_indices = split_bands_param(bands)
    if is_raw_image(image_path):
        rgb, raw_info = load_raw_image(image_path, raw_profile)
        channel = str(_settings_value(settings, "rawChannel", "raw_channel", "channel", default="ALL")).upper()
        display_bits = int(_settings_value(settings, "displayBit", "display_bits", "bit", default=raw_info.get("bit", 16)))
        black_level = float(_settings_value(settings, "blackLevel", "black_level", default=raw_info.get("black_level", 0)))
        white_level = float(_settings_value(settings, "whiteLevel", "white_level", default=raw_info.get("white_level", (1 << display_bits) - 1)))
        exposure_gain = float(_settings_value(settings, "exposureGain", "exposure_gain", default=1.0))
        wb_enabled = bool(_settings_value(settings, "wbEnabled", "wb_enabled", default=False))
        wb = (
            float(_settings_value(settings, "wbR", "wb_r", default=1.0)),
            float(_settings_value(settings, "wbG", "wb_g", default=1.0)),
            float(_settings_value(settings, "wbB", "wb_b", default=1.0)),
        )

        if channel != "ALL":
            raw = raw_info.get("raw")
            cfa = raw_info.get("cfa")
            if raw is not None and cfa is not None:
                return _raw_channel_to_display_rgb(
                    raw,
                    cfa,
                    raw_info.get("desc", "RGBG"),
                    channel,
                    display_bits,
                    black_level,
                    white_level,
                    exposure_gain,
                )

        if raw_info.get("plain_raw"):
            raw = raw_info.get("raw")
            if raw is not None:
                return render_plain_raw_with_matrix(
                    raw,
                    str(raw_info.get("pattern", "RGGB")).upper(),
                    black_level=black_level,
                    white_level=white_level,
                    exposure_gain=exposure_gain,
                    wb_enabled=wb_enabled,
                    wb=wb,
                    bit=display_bits,
                )
        return rgb

    img = read_image_cached(image_path)
    out = _select_bands(img, band_indices)
    return normalize_to_uint8(out)


def read_for_export(
    image_path: str,
    bands: str | list[int] | tuple[int, ...] | None = None,
    settings: Optional[dict[str, Any]] = None,
    raw_profile: Optional[dict[str, Any]] = None,
) -> np.ndarray:
    if is_raw_image(image_path):
        return render_preview_rgb(image_path, bands=bands, settings=settings, raw_profile=raw_profile)
    img = read_image_cached(image_path)
    band_indices = split_bands_param(bands)
    if band_indices:
        return _select_bands(img, band_indices)
    return img


def read_metadata(image_path: str, raw_profile: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    if is_raw_image(image_path):
        rgb, raw_info = load_raw_image(image_path, raw_profile)
        return {
            "width": int(rgb.shape[1]),
            "height": int(rgb.shape[0]),
            "bands": 1 if raw_info.get("plain_raw") else 3,
            "dtype": f"RAW{raw_info.get('bit', 16)}",
            "isRaw": True,
            "raw": {
                "bit": raw_info.get("bit", 16),
                "pattern": raw_info.get("pattern", ""),
                "plain_raw": bool(raw_info.get("plain_raw", False)),
            },
        }

    img = read_image_cached(image_path)
    return {
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "bands": int(img.shape[2]) if img.ndim > 2 else 1,
        "dtype": str(img.dtype),
        "isRaw": False,
    }


def encode_jpeg_rgb(rgb: np.ndarray, quality: int = 90) -> bytes:
    rgb8 = normalize_to_uint8(rgb)
    bgr = cv2.cvtColor(rgb8[:, :, :3], cv2.COLOR_RGB2BGR)
    success, encoded = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    if not success:
        raise RuntimeError("Failed to encode preview JPEG.")
    return encoded.tobytes()


def sample_pixel(
    image_path: str,
    x: int,
    y: int,
    mode: str = "render",
    display_width: Optional[int] = None,
    display_height: Optional[int] = None,
    settings: Optional[dict[str, Any]] = None,
    raw_profile: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if not is_raw_image(image_path) or mode != "raw":
        rgb = render_preview_rgb(image_path, settings=settings, raw_profile=raw_profile)
        h, w = rgb.shape[:2]
        x = max(0, min(w - 1, int(x)))
        y = max(0, min(h - 1, int(y)))
        r, g, b = [int(v) for v in rgb[y, x, :3]]
        return {
            "mode": "render",
            "x": x,
            "y": y,
            "r": r,
            "g": g,
            "b": b,
            "gray": int(round(0.299 * r + 0.587 * g + 0.114 * b)),
            "dtype": "uint8",
        }

    _rgb, raw_info = load_raw_image(image_path, raw_profile)
    raw = raw_info.get("raw")
    cfa = raw_info.get("cfa")
    desc = raw_info.get("desc", "RGBG")
    if raw is None or cfa is None:
        raise ValueError("RAW data is not available for sampling.")

    h_raw, w_raw = raw.shape[:2]
    w_display = int(display_width or w_raw)
    h_display = int(display_height or h_raw)
    rx = int(round(int(x) * (w_raw - 1) / max(1, w_display - 1)))
    ry = int(round(int(y) * (h_raw - 1) / max(1, h_display - 1)))
    rx = max(0, min(w_raw - 1, rx))
    ry = max(0, min(h_raw - 1, ry))
    ci = int(cfa[ry, rx])
    channel = desc[ci] if 0 <= ci < len(desc) else f"C{ci}"
    return {
        "mode": "raw",
        "x": rx,
        "y": ry,
        "value": int(raw[ry, rx]),
        "channel": channel,
        "dtype": str(raw.dtype),
    }

