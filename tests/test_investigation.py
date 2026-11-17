from datetime import date

import pytest

from investigator.agent import ground_graph
from investigator.domain import Findings, Source, three_months_ago
from investigator.research import public_url


@pytest.mark.parametrize(
    ("current", "expected"),
    [
        (date(2026, 11, 17), date(2026, 8, 17)),
        (date(2027, 5, 31), date(2027, 2, 28)),
        (date(2026, 1, 31), date(2025, 10, 31)),
    ],
)
def test_exact_calendar_window(current, expected):
    assert three_months_ago(current) == expected


def test_dated_event_outside_window_is_rejected_even_with_a_source():
    data = Findings.model_validate(
        {
            "title": "Sample",
            "summary": "Example",
            "nodes": [
                {
                    "id": "event",
                    "label": "Past event",
                    "kind": "event",
                    "date": "2026-08-16",
                    "refs": ["page-1"],
                }
            ],
        }
    )
    sources = {"page-1": Source(id="page-1", title="Source", quality="page")}
    with pytest.raises(ValueError, match="近期事件日期"):
        ground_graph(data, "discovery", sources, "", "2026-08-17", "2026-11-17")


def test_snippet_alone_does_not_confirm_claim():
    data = Findings.model_validate(
        {
            "title": "Sample",
            "summary": "Example",
            "nodes": [
                {
                    "id": "claim",
                    "label": "Claim",
                    "kind": "claim",
                    "verdict": "supported",
                    "refs": ["web-1"],
                }
            ],
        }
    )
    sources = {"web-1": Source(id="web-1", title="Snippet", quality="snippet")}
    graph = ground_graph(data, "verification", sources, "", "", "")
    assert graph.nodes[0].verdict == "unverified"
    assert graph.sources[0].id == "web-1"


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "https://[::1]/", "file:///etc/passwd"])
def test_page_reader_blocks_local_resources(url):
    with pytest.raises(ValueError):
        public_url(url)


def test_graph_translation_preserves_evidence_and_structure():
    from investigator.domain import Graph
    from investigator.localization import graph_texts, localized_graph

    graph = Graph.model_validate(
        {
            "title": "示例",
            "summary": "待核实",
            "nodes": [
                {
                    "id": "a",
                    "label": "主张",
                    "kind": "claim",
                    "detail": "内容",
                    "date": "2026-11-17",
                    "excerpt": "原文",
                    "refs": ["original"],
                    "verdict": "unverified",
                },
                {"id": "b", "label": "主题", "kind": "topic"},
            ],
            "edges": [{"source": "a", "target": "b", "label": "提出"}],
            "sources": [
                {
                    "id": "original",
                    "title": "Native title",
                    "quality": "original",
                    "excerpt": "原文",
                    "url": "https://example.com/source",
                }
            ],
        }
    )
    fields = graph_texts(graph)
    assert "原文" not in fields.values()
    assert "https://example.com/source" not in fields.values()

    localized = localized_graph(
        graph,
        {
            "title": "Example",
            "summary": "Unverified",
            "label.a": "Claim",
            "detail.a": "Content",
            "label.b": "Topic",
            "edge.0": "raises",
        },
    )

    assert localized.title == "Example"
    assert localized.nodes[0].model_dump(exclude={"label", "detail"}) == graph.nodes[0].model_dump(
        exclude={"label", "detail"}
    )
    assert localized.edges[0].label == "raises"
    assert localized.edges[0].source == "a"
    assert localized.sources == graph.sources
    assert graph.title == "示例"


def test_copied_chinese_is_rejected_as_japanese():
    from investigator.localization import valid_translation

    source = {"summary": "这是一个尚待核实的结论。", "label.nasa": "NASA"}
    assert not valid_translation(source, source, "ja")
    assert valid_translation(
        {"summary": "この結論はまだ検証されていません。", "label.nasa": "NASA"}, source, "ja"
    )


def test_multilingual_captions_keep_shot_times_and_escape_markup():
    from investigator.video import captions_vtt

    result = captions_vtt(["Lunar data & evidence", "Around the Moon\n", "<Verified>"])
    assert "00:00:00.000 --> 00:00:05.000\nLunar data &amp; evidence" in result
    assert "00:00:05.000 --> 00:00:10.000\nAround the Moon" in result
    assert "00:00:10.000 --> 00:00:15.000\n&lt;Verified&gt;" in result
