import re
import shutil
import subprocess
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic

import httpx

from .agent import require_success
from .domain import Storyboard

DURATION = 15


class VideoFailed(RuntimeError):
    pass


def create_video(client, model, story: Storyboard, local_voice: bool):
    shots = []
    for i, shot in enumerate(story.shots):
        narration = "" if local_voice else f" Say exactly in Japanese <d>{shot.narration}</d>."
        shots.append(f"{i * 5}–{(i + 1) * 5} sec: {shot.visual}{narration}")
    sound = (
        "No spoken words."
        if local_voice
        else (
            "One clear native Japanese narrator, no other voices, no English. "
            "Read all tagged Japanese sentences without paraphrasing. Keep music quiet."
        )
    )
    prompt = (
        "15-second editorial explainer animation. Dark graphite backgrounds, warm amber illustrations, "
        "coherent stylized 2D vector visuals, smoothly animated diagrams and objects. "
        f"No subtitles, screen text, logos or watermarks. {sound}\n" + "\n".join(shots)
    )
    response = client.post(
        "/v1/videos",
        json={
            "model": model,
            "prompt": prompt,
            "seconds": DURATION,
            "aspect_ratio": "16:9",
        },
    )
    require_success(response)
    job = response.json()
    if not re.fullmatch(r"video_[A-Za-z0-9-]+", job["id"]):
        raise RuntimeError("ai& 返回了无效的视频任务 ID")
    return job


def await_video(client, job, on_status, stopping):
    deadline = monotonic() + 25 * 60
    while monotonic() < deadline and not stopping.is_set():
        try:
            response = client.get(f"/v1/videos/{job}")
            if response.status_code >= 500 or response.status_code == 429:
                if stopping.wait(12):
                    break
                continue
            require_success(response)
            payload = response.json()
        except httpx.TransportError:
            if stopping.wait(12):
                break
            continue
        state = payload["status"]
        on_status(state)
        if state == "completed":
            return
        if state in {"failed", "canceled"}:
            code = (payload.get("error") or {}).get("code", state)
            raise VideoFailed(f"视频生成结束（{code}），可重新生成。")
        if stopping.wait(12):
            break
    raise RuntimeError("视频任务尚未完成。重试会继续查询原视频任务。")


def render_voice(input_path: Path, output: Path, story: Storyboard, voice: str):
    with TemporaryDirectory(dir=input_path.parent) as temp:
        temp = Path(temp)
        paths = []
        filters = []
        for index, shot in enumerate(story.shots):
            script = temp / f"{index}.txt"
            track = temp / f"{index}.aiff"
            script.write_text(shot.narration, encoding="utf-8")
            subprocess.run(
                ["say", "-v", voice, "-f", str(script), "-o", str(track)],
                check=True,
                capture_output=True,
                timeout=20,
            )
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(track),
                ],
                capture_output=True,
                text=True,
                check=True,
                timeout=10,
            )
            duration = float(result.stdout)
            if duration < 0.25:
                raise ValueError("日语配音没有有效音频")
            # Leave a short gap at each shot boundary.
            tempo = max(1, duration / 4.6)
            filters.append(
                f"[{index + 1}:a]atempo={tempo:.4f},adelay={index * 5000 + 140}:all=1[a{index}]"
            )
            paths.extend(["-i", str(track)])
        filters.append("[a0][a1][a2]amix=inputs=3:normalize=0,apad[a]")
        subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-y",
                "-v",
                "error",
                "-i",
                str(input_path),
                *paths,
                "-filter_complex",
                ";".join(filters),
                "-map",
                "0:v:0",
                "-map",
                "[a]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-metadata:s:a:0",
                "language=jpn",
                "-movflags",
                "+faststart",
                "-shortest",
                str(output),
            ],
            check=True,
            capture_output=True,
            timeout=75,
        )


def save_video(client, job, root: Path, key: str, story, voice: str):
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root) as temp:
        raw = Path(temp) / "raw.mp4"
        with client.stream("GET", f"/v1/videos/{job}/content", follow_redirects=True) as response:
            # Streaming errors must be read before parsing the provider's response.
            if not response.is_success:
                response.read()
            require_success(response)
            size = 0
            with raw.open("wb") as file:
                for chunk in response.iter_bytes(128 * 1024):
                    size += len(chunk)
                    if size > 150_000_000:
                        raise RuntimeError("视频文件超过 150 MB")
                    file.write(chunk)
        if size < 512:
            raise RuntimeError("ai& 返回空视频")
        final = raw
        if voice:
            final = Path(temp) / "dubbed.mp4"
            try:
                render_voice(raw, final, story, voice)
            except (subprocess.SubprocessError, OSError, ValueError) as error:
                raise RuntimeError("本机日语配音失败，请检查 say、ffmpeg 和日语语音。") from error
        final.replace(root / f"{key}.mp4")
        subtitles = Path(temp) / "captions.vtt"
        subtitles.write_text(captions_vtt([shot.narration for shot in story.shots]), encoding="utf-8")
        subtitles.replace(root / f"{key}.vtt")


def captions_vtt(lines: list[str]) -> str:
    cues = [
        f"00:00:{i * 5:02}.000 --> 00:00:{(i + 1) * 5:02}.000\n{escape(' '.join(line.split()), quote=False)}"
        for i, line in enumerate(lines)
    ]
    return "WEBVTT\n\n" + "\n\n".join(cues) + "\n"


def local_voice_available(voice):
    return bool(voice and all(shutil.which(tool) for tool in ("say", "ffmpeg", "ffprobe")))
