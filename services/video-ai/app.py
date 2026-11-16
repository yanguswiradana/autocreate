import base64
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Autocreate Video AI Service", version="1.0.0")

_whisper_model = None

ASPECT_DIMENSIONS = {
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


class ProcessOptions(BaseModel):
    trimStart: Optional[float] = None
    trimEnd: Optional[float] = None
    removeSilence: bool = False
    aspectRatio: str = "9:16"
    bgMask: str = "none"  # none | blur | solid_dark | green_screen
    autoSubtitle: bool = False
    language: str = "id"
    hookText: Optional[str] = None
    watermarkText: Optional[str] = None
    brandColor: Optional[str] = None


class ProcessRequest(BaseModel):
    inputPath: str
    outputPath: str
    options: ProcessOptions = ProcessOptions()


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        model_size = os.environ.get("WHISPER_MODEL", "tiny")
        _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _whisper_model


def run_cmd(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"Command failed ({' '.join(cmd[:3])}): {proc.stderr[-600:]}"
        )
    return proc.stdout + "\n" + proc.stderr


def probe_duration(path: str) -> float:
    out = run_cmd(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ]
    )
    try:
        return float(out.strip().splitlines()[0])
    except Exception:
        return 0.0


def trim_video(src: str, dst: str, start: Optional[float], end: Optional[float]) -> None:
    cmd = ["ffmpeg", "-y", "-i", src]
    if start is not None and start > 0:
        cmd.extend(["-ss", f"{start:.2f}"])
    if end is not None and end > 0:
        cmd.extend(["-to", f"{end:.2f}"])
    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", dst])
    run_cmd(cmd)


def remove_silence(src: str, dst: str, work_dir: Path) -> bool:
    duration = probe_duration(src)
    if duration <= 0.5:
        return False

    log = run_cmd(
        [
            "ffmpeg",
            "-i",
            src,
            "-af",
            "silencedetect=noise=-32dB:d=0.65",
            "-f",
            "null",
            "-",
        ]
    )
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", log)]

    if not starts:
        return False

    keep_segments: list[tuple[float, float]] = []
    cursor = 0.0
    for idx, s_start in enumerate(starts):
        if s_start - cursor > 0.25:
            keep_segments.append((cursor, s_start))
        cursor = ends[idx] if idx < len(ends) else duration

    if duration - cursor > 0.25:
        keep_segments.append((cursor, duration))

    if not keep_segments or (
        len(keep_segments) == 1
        and keep_segments[0][0] <= 0.1
        and keep_segments[0][1] >= duration - 0.1
    ):
        return False

    seg_files: list[Path] = []
    for i, (seg_s, seg_e) in enumerate(keep_segments):
        seg_path = work_dir / f"seg_{i}.mp4"
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{seg_s:.3f}",
                "-to",
                f"{seg_e:.3f}",
                "-i",
                src,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-c:a",
                "aac",
                str(seg_path),
            ]
        )
        seg_files.append(seg_path)

    concat_list = work_dir / "concat.txt"
    concat_list.write_text(
        "\n".join([f"file '{p.as_posix()}'" for p in seg_files]), encoding="utf-8"
    )
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            dst,
        ]
    )
    return True


def apply_mediapipe_mask(src: str, dst: str, mode: str, work_dir: Path) -> None:
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError("Tidak bisa membuka video untuk MediaPipe masking.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    silent_out = str(work_dir / "masked_silent.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(silent_out, fourcc, fps, (width, height))

    mp_selfie = mp.solutions.selfie_segmentation
    with mp_selfie.SelfieSegmentation(model_selection=1) as segmenter:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = segmenter.process(rgb)
            mask = result.segmentation_mask
            condition = np.stack((mask,) * 3, axis=-1) > 0.45

            if mode == "blur":
                bg = cv2.GaussianBlur(frame, (55, 55), 0)
            else:
                bg = np.full(frame.shape, (12, 11, 11), dtype=np.uint8)  # #0b0b0c BGR

            output_frame = np.where(condition, frame, bg)
            writer.write(output_frame)

    cap.release()
    writer.release()

    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            silent_out,
            "-i",
            src,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-shortest",
            dst,
        ]
    )


def format_ass_time(seconds: float) -> str:
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def generate_subtitles(src: str, ass_path: Path, language: str, work_dir: Path) -> str:
    wav_path = str(work_dir / "audio.wav")
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            src,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            wav_path,
        ]
    )

    model = get_whisper_model()
    segments, _ = model.transcribe(wav_path, language=language, beam_size=1)

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        "PlayResX: 1080\n"
        "PlayResY: 1920\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Default,DejaVu Sans,54,&H00FFFFFF,&H007BF7DD,&H00121214,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,210,1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events: list[str] = []
    transcript_parts: list[str] = []
    for seg in segments:
        txt = seg.text.strip().replace("\n", " ")
        if not txt:
            continue
        transcript_parts.append(txt)
        events.append(
            f"Dialogue: 0,{format_ass_time(seg.start)},{format_ass_time(seg.end)},Default,,0,0,0,,{txt}"
        )

    ass_path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return " ".join(transcript_parts)


def escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def safe_hex_color(color: Optional[str], fallback: str = "#ddf77b") -> str:
    if color and re.fullmatch(r"#[0-9a-fA-F]{6}", color.strip()):
        return color.strip()
    return fallback


def finalize_video(
    src: str,
    dst: str,
    aspect_ratio: str,
    bg_mask: str,
    hook_text: Optional[str],
    ass_path: Optional[Path],
    watermark_text: Optional[str] = None,
    brand_color: Optional[str] = None,
) -> None:
    vf_filters: list[str] = []
    accent = safe_hex_color(brand_color)

    if bg_mask == "green_screen":
        vf_filters.append("chromakey=0x00FF00:0.18:0.08")

    if aspect_ratio in ASPECT_DIMENSIONS:
        w, h = ASPECT_DIMENSIONS[aspect_ratio]
        vf_filters.append(
            f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
        )

    if ass_path and ass_path.exists():
        escaped = ass_path.as_posix().replace(":", "\\:")
        vf_filters.append(f"ass='{escaped}'")

    if hook_text and hook_text.strip():
        safe_hook = escape_drawtext(hook_text.strip())
        vf_filters.append(
            "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
            f"text='{safe_hook}':fontcolor={accent}:fontsize=46:box=1:boxcolor=black@0.72:boxborderw=18:"
            "x=(w-text_w)/2:y=110"
        )

    if watermark_text and watermark_text.strip():
        safe_wm = escape_drawtext(watermark_text.strip())
        vf_filters.append(
            "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
            f"text='{safe_wm}':fontcolor={accent}@0.88:fontsize=28:box=1:boxcolor=black@0.45:boxborderw=10:"
            "x=w-tw-36:y=36"
        )

    cmd = ["ffmpeg", "-y", "-i", src]
    if vf_filters:
        cmd.extend(["-vf", ",".join(vf_filters)])
    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-movflags", "+faststart", dst])
    run_cmd(cmd)


@app.get("/health")
def health():
    return {"ok": True, "service": "autocreate-video-ai"}


@app.post("/process")
def process_video(req: ProcessRequest):
    if not os.path.exists(req.inputPath):
        raise HTTPException(status_code=404, detail=f"Input video tidak ditemukan: {req.inputPath}")

    os.makedirs(os.path.dirname(req.outputPath), exist_ok=True)
    opts = req.options
    transcript = ""

    with tempfile.TemporaryDirectory(prefix="vidai_") as tmp:
        work_dir = Path(tmp)
        current = work_dir / "stage_0.mp4"
        shutil.copy2(req.inputPath, current)

        if opts.trimStart is not None or opts.trimEnd is not None:
            trimmed = work_dir / "stage_trim.mp4"
            trim_video(str(current), str(trimmed), opts.trimStart, opts.trimEnd)
            current = trimmed

        if opts.removeSilence:
            cut = work_dir / "stage_cut.mp4"
            if remove_silence(str(current), str(cut), work_dir):
                current = cut

        if opts.bgMask in ("blur", "solid_dark"):
            masked = work_dir / "stage_mask.mp4"
            apply_mediapipe_mask(str(current), str(masked), opts.bgMask, work_dir)
            current = masked

        ass_path: Optional[Path] = None
        if opts.autoSubtitle:
            ass_path = work_dir / "subtitles.ass"
            transcript = generate_subtitles(
                str(current), ass_path, opts.language or "id", work_dir
            )

        finalize_video(
            str(current),
            req.outputPath,
            opts.aspectRatio,
            opts.bgMask,
            opts.hookText,
            ass_path,
            opts.watermarkText,
            opts.brandColor,
        )

    return {
        "ok": True,
        "outputPath": req.outputPath,
        "transcript": transcript,
        "durationSeconds": round(probe_duration(req.outputPath), 2),
    }


class AnalyzeReferenceRequest(BaseModel):
    inputPath: str


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def pick_aspect_ratio(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "9:16"
    ratio = width / height
    targets = {
        "9:16": 9 / 16,
        "4:5": 4 / 5,
        "1:1": 1.0,
        "16:9": 16 / 9,
    }
    return min(targets.keys(), key=lambda k: abs(targets[k] - ratio))


@app.post("/analyze-reference")
def analyze_reference(req: AnalyzeReferenceRequest):
    if not os.path.exists(req.inputPath):
        raise HTTPException(status_code=404, detail="Reference video file not found")

    cap = cv2.VideoCapture(req.inputPath)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Cannot open reference video")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 24.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = round(frame_count / fps, 2) if fps > 0 and frame_count > 0 else round(probe_duration(req.inputPath), 2)

    total_samples = 16
    indices = (
        [int(i * (frame_count - 1) / (total_samples - 1)) for i in range(total_samples)]
        if frame_count >= total_samples
        else list(range(max(frame_count, 1)))
    )

    keyframe_slots = {indices[i] for i in [1, 5, 10, 14] if i < len(indices)} if len(indices) >= 15 else set(indices[:4])
    keyframes: list[str] = []
    sampled_small: list[np.ndarray] = []
    diffs: list[float] = []
    prev_gray: Optional[np.ndarray] = None

    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue

        small = cv2.resize(frame, (96, 96))
        sampled_small.append(small)

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        if prev_gray is not None:
            diffs.append(float(np.mean(np.abs(gray.astype(np.float32) - prev_gray.astype(np.float32)))))
        prev_gray = gray

        if idx in keyframe_slots and len(keyframes) < 4:
            h, w = frame.shape[:2]
            scale = min(1.0, 420.0 / max(w, 1))
            thumb = cv2.resize(frame, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1.0 else frame
            ok_jpg, enc = cv2.imencode(".jpg", thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok_jpg:
                keyframes.append("data:image/jpeg;base64," + base64.b64encode(enc.tobytes()).decode("ascii"))

    cap.release()

    if not sampled_small:
        raise HTTPException(status_code=400, detail="Could not decode frames from reference video")

    pixels_bgr = np.vstack([img.reshape(-1, 3) for img in sampled_small])
    pixels_rgb = pixels_bgr[:, ::-1]
    avg_rgb = np.mean(pixels_rgb, axis=0)
    luma = float(0.299 * avg_rgb[0] + 0.587 * avg_rgb[1] + 0.114 * avg_rgb[2])

    # Quantize to 24-step buckets to find dominant background & vibrant accent colors
    quant = (pixels_rgb // 24) * 24 + 12
    packed = (quant[:, 0].astype(np.int32) << 16) | (quant[:, 1].astype(np.int32) << 8) | quant[:, 2].astype(np.int32)
    vals, counts = np.unique(packed, return_counts=True)
    order = np.argsort(-counts)

    top_colors: list[tuple[int, int, int, float]] = []
    for pos in order[:20]:
        c = int(vals[pos])
        r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
        sat = (max(r, g, b) - min(r, g, b)) / max(max(r, g, b), 1)
        top_colors.append((r, g, b, sat))

    bg_rgb = top_colors[0][:3]
    accent_candidates = sorted(top_colors, key=lambda x: x[3], reverse=True)
    primary_rgb = accent_candidates[0][:3] if accent_candidates and accent_candidates[0][3] > 0.18 else (221, 247, 123)
    text_rgb = (24, 24, 27) if luma > 165 else (244, 244, 245)

    avg_sat = float(np.mean([c[3] for c in top_colors[:5]])) if top_colors else 0.0
    if luma > 165:
        preset = "clean_paper"
    elif avg_sat < 0.12:
        preset = "monochrome_luxury"
    elif avg_rgb[2] > avg_rgb[0] * 1.15 and avg_rgb[2] > avg_rgb[1]:
        preset = "midnight_tech"
    elif avg_rgb[1] > avg_rgb[0] and avg_sat > 0.35:
        preset = "neon_cyber"
    elif avg_rgb[0] > avg_rgb[2] * 1.18:
        preset = "warm_cinematic"
    else:
        preset = "noir_editorial"

    avg_diff = float(np.mean(diffs)) if diffs else 15.0
    if avg_diff > 28.0:
        pacing = "fast"
        recommended_slides = 7
    elif avg_diff > 14.0:
        pacing = "medium"
        recommended_slides = 5
    else:
        pacing = "calm"
        recommended_slides = 3

    return {
        "ok": True,
        "width": width,
        "height": height,
        "durationSeconds": duration,
        "aspectRatio": pick_aspect_ratio(width, height),
        "preset": preset,
        "pacing": pacing,
        "recommendedSlides": recommended_slides,
        "palette": {
            "primaryColor": rgb_to_hex(primary_rgb),
            "secondaryColor": rgb_to_hex(bg_rgb),
            "accentColor": rgb_to_hex(text_rgb),
        },
        "keyframes": keyframes,
    }
