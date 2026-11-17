import logging
from threading import Event

import httpx

from .agent import aiand_client, ground_graph, run_agent
from .domain import GRAPH_STAGES, RESEARCH_STAGES, Source, Storyboard
from .research import Research
from .video import VideoFailed, await_video, create_video, local_voice_available, save_video

logger = logging.getLogger(__name__)


def graph_context(graph):
    data = graph.model_dump(mode="json")
    for source in data["sources"]:
        source["excerpt"] = source["excerpt"][:500]
    return data


class Pipeline:
    def __init__(self, settings, store):
        self.settings = settings
        self.store = store
        self.stopping = Event()

    def run(self, key):
        if not self.store.claim(key, "queued"):
            return
        try:
            run = self.store.get(key, private=True)
            with aiand_client(self.settings) as client:
                self._graphs(client, run)
                if self.stopping.is_set():
                    return
                self._video(client, key)
            self.store.update(
                key, status="completed", progress=None, video_status="completed", error=None
            )
        except Exception as error:
            if self.stopping.is_set():
                return
            logger.warning("Investigation %s failed (%s)", key, type(error).__name__)
            if isinstance(error, RuntimeError):
                code = "investigation_failed"
                message = str(error)
            elif isinstance(error, httpx.TransportError):
                code = "provider_timeout"
                message = "连接 ai& 超时或中断，可重试当前阶段。"
            else:
                logger.exception("Unhandled investigation failure")
                code = "investigation_failed"
                message = "当前阶段处理失败，请查看本地服务日志后重试。"
            self.store.update(key, status="failed", error=message[:500], error_code=code, progress=None)

    def _graphs(self, client, run):
        key = run["key"]
        upstream = {}
        sources = {"original": Source(id="original", title=run["filename"], quality="original")}
        for stage in GRAPH_STAGES:
            if self.stopping.is_set():
                return
            graph = self.store.graph(key, stage)
            if graph is None:
                self.store.update(key, active=stage, progress="analyze", progress_detail=None)
                research = None
                if stage in RESEARCH_STAGES:
                    research = Research(self.settings, stage, run["start"], run["end"], sources)
                context = {
                    "filename": run["filename"],
                    "recent_start": run["start"],
                    "recent_end": run["end"],
                    "upstream_graphs": {name: graph_context(g) for name, g in upstream.items()},
                    "source_ids": [{"id": s.id, "title": s.title} for s in sources.values()],
                }
                if stage == "structure":
                    context["document"] = run["document"]

                def validate(data, stage=stage, research=research):
                    return ground_graph(
                        data,
                        stage,
                        research.sources if research else sources,
                        run["document"],
                        run["start"],
                        run["end"],
                    )

                graph = run_agent(
                    client,
                    self.settings,
                    stage,
                    context,
                    research=research,
                    validate=validate,
                    progress=lambda event, detail: self.store.update(
                        key, progress=event, progress_detail=detail
                    ),
                )
                self.store.save_graph(key, stage, graph)
                # Reload the committed graph so each stage consumes persisted Neo4j data.
                graph = self.store.graph(key, stage)
            upstream[stage] = graph
            sources.update({source.id: source for source in graph.sources})

    def _video(self, client, key):
        self.store.update(key, active="video", progress="storyboard", progress_detail=None)
        run = self.store.get(key, private=True)
        voice = self.settings.japanese_voice
        if voice and not local_voice_available(voice):
            raise RuntimeError("本机日语配音需要 macOS say、ffmpeg 和 ffprobe。")
        if run.get("storyboard"):
            story = Storyboard.model_validate_json(run["storyboard"])
        else:
            graph = self.store.graph(key, "synthesis")
            story = run_agent(
                client,
                self.settings,
                "video",
                {"final_graph": graph_context(graph)},
                progress=lambda event, detail: self.store.update(
                    key, progress=event, progress_detail=detail
                ),
            )
            self.store.update(
                key,
                storyboard=story.model_dump_json(),
                video_title=story.title,
                narration=[shot.narration for shot in story.shots],
            )
        job = run.get("video_job")
        if not job:
            response = create_video(client, self.settings.aiand_video_model, story, bool(voice))
            job = response["id"]
            self.store.update(key, video_job=job, video_status=response["status"], video_voice=voice)
        else:
            voice = run.get("video_voice", "")
        try:
            await_video(
                client,
                job,
                lambda status: self.store.update(
                    key,
                    video_status=status,
                    progress="render",
                ),
                self.stopping,
            )
        except VideoFailed:
            self.store.update(key, video_job=None, video_status="failed")
            raise
        self.store.update(key, progress="save")
        save_video(client, job, self.settings.media_dir, key, story, voice)
