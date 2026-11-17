import re
from calendar import monthrange
from datetime import date as CalendarDate
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

STAGES = (
    ("structure", "知识解析", "拆解原文主张、实体和关联"),
    ("discovery", "近期检索", "查找近三个月发生的关联事件"),
    ("verification", "事实溯源", "追查最早可核实出处和正反证据"),
    ("traction", "传播与案例", "追踪传播与独立落地案例"),
    ("synthesis", "综合判断", "从 Neo4j 汇总证据、分歧和待核实问题"),
    ("video", "日语动画", "用最终图谱制作日语解说短片"),
)
GRAPH_STAGES = tuple(stage[0] for stage in STAGES[:-1])
RESEARCH_STAGES = {"discovery", "verification", "traction"}

PROMPTS = {
    "structure": """只分析用户原文。提取 2–6 条可验证主张、核心主题和关键实体。
    建立贴近原文的关系，每条主张的 excerpt 必须是原文中的连续短句，verdict 留空。
    original 代表原文，可供节点引用。以 research_topics 提供 2–4 个精确的公开检索关键词。""",
    "discovery": """根据上游图谱制定多角度检索。时间范围是东京时区的近三个自然月，
    只把日期在范围内的事件列为近期发现。打开关键结果，区分事件日期与页面发布日期。
    若日期未核实，仅在 summary 解释检索局限。发现通过保留上游节点 ID 与原主题连接。""",
    "verification": """逐一核查原文的主要主张及重要近期发现。
    主动检索可观察到的最早出处、原始证据和反证，允许溯源到三个月前。
    用 date 记录最早找到的可核实日期，说明是否为首发或仅是目前最早查到的出处。
    保留上游主张 ID。在 verdict 使用 supported、contradicted、mixed 或 unverified。
    二手复述、搜索摘要、缺少证据、转载互相引用时不能判定属实，说明调查边界。""",
    "traction": """检索首发、媒体或社交扩散节点、时间、公开传播指标及实际应用案例。
    若能找到原始公告或公开案例，核查独立第三方、可量化数据、是否真正部署；
    区分宣传、试点、已部署和独立验证。缺少材料时明确标示，绝不编造传播量或动机。
    保留关键上游 ID，用关系连接传播事件和原始主张。""",
    "synthesis": """综合 Neo4j 的四份阶段快照，对照原文、近期事件、正反证据、传播和案例。
    保留关键节点 ID 和之前的证据 refs。建立连接来源不同的发现的关系，
    保留重要分歧及不确定性，在 summary 给出清晰的中文结论和待核实问题。
    既不要把引用数量当证据强度，也不要将无证据解释为虚假。
    最终图谱应包含 6–20 个有实际信息的主题、主张、证据、案例、事件或结论节点。""",
    "video": """仅依据 Neo4j 的最终图谱。做一段 15 秒的日语解说动画。
    提供三个按时间排序的镜头，分别用 0–5、5–10、10–15 秒。
    每段 narration 用地道的现代日语写一句易读的短句，约 15–24 字。
    专业术语使用日语惯常说法，数字和单位成对出现，避免机械直译。
    每段 visual 用英语描述具象、容易辨识的插画镜头，避免屏幕出现文字。
    起承转合覆盖调查主题、关键证据、结论及其不确定性。没有证据的事实不得加入。""",
}


def three_months_ago(today: CalendarDate) -> CalendarDate:
    index = today.year * 12 + today.month - 4
    year, month_zero = divmod(index, 12)
    month = month_zero + 1
    return CalendarDate(year, month, min(today.day, monthrange(year, month)[1]))


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Source(Strict):
    id: str
    title: str
    url: str = ""
    date: str = ""
    quality: Literal["original", "snippet", "page"]
    excerpt: str = ""


class Node(Strict):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,47}$")
    label: str = Field(min_length=1, max_length=100)
    kind: Literal["topic", "claim", "entity", "event", "evidence", "case", "conclusion"]
    detail: str = Field(default="", max_length=850)
    verdict: Literal["", "supported", "contradicted", "mixed", "unverified"] = ""
    date: CalendarDate | None = None
    excerpt: str = Field(default="", max_length=420)
    refs: list[str] = Field(default_factory=list, max_length=10)


class Edge(Strict):
    source: str
    target: str
    label: str = Field(min_length=1, max_length=60)


class Findings(Strict):
    title: str = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=1800)
    research_topics: list[str] = Field(default_factory=list, max_length=6)
    nodes: list[Node] = Field(min_length=1, max_length=32)
    edges: list[Edge] = Field(default_factory=list, max_length=90)

    @model_validator(mode="after")
    def valid_graph(self):
        ids = {node.id for node in self.nodes}
        if len(ids) != len(self.nodes):
            raise ValueError("节点 ID 不能重复")
        for edge in self.edges:
            if edge.source not in ids or edge.target not in ids or edge.source == edge.target:
                raise ValueError("关系必须连接图谱中两个不同的节点 ID")
        return self


class Graph(Findings):
    sources: list[Source] = Field(default_factory=list)


class Shot(Strict):
    visual: str = Field(min_length=1, max_length=450)
    narration: str = Field(min_length=1, max_length=42)

    @field_validator("narration")
    @classmethod
    def japanese_line(cls, line: str) -> str:
        if not re.search(r"[ぁ-ゖァ-ヺ]", line) or any(char in line for char in "<>\r\n"):
            raise ValueError("每段配音应为一行含假名的日语")
        return line


class Storyboard(Strict):
    title: str = Field(min_length=1, max_length=120)
    shots: list[Shot] = Field(min_length=3, max_length=3)
