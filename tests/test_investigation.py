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
