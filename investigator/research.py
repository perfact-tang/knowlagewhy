import hashlib
import ipaddress
import socket
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit

import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS
from ddgs.exceptions import DDGSException

from .domain import Source


def public_url(url: str) -> tuple[str, str]:
    target = urlsplit(url)
    if target.scheme not in {"http", "https"} or not target.hostname or target.username is not None:
        raise ValueError("无效的公开网页地址")
    port = 443 if target.scheme == "https" else 80
    if target.port not in (None, port):
        raise ValueError("网页只能使用标准 HTTP 端口")
    host = target.hostname.encode("idna").decode()
    addresses = list(
        dict.fromkeys(
            row[4][0]
            for row in socket.getaddrinfo(
                host,
                port,
                type=socket.SOCK_STREAM,
            )
        )
    )
    addresses = [addr for addr in addresses if ipaddress.ip_address(addr).is_global]
    if not addresses:
        raise ValueError("仅能读取公网网页")
    # Connect to the checked IP while keeping the original Host header and TLS name.
    address = next((addr for addr in addresses if ":" not in addr), addresses[0])
    netloc = f"[{address}]" if ":" in address else address
    return urlunsplit((target.scheme, netloc, target.path, target.query, "")), host


def fetch_page(url: str) -> tuple[str, str, str]:
    with httpx.Client(timeout=8, trust_env=False) as client:
        for _ in range(5):
            pinned, host = public_url(url)
            with client.stream(
                "GET",
                pinned,
                headers={"Host": host, "User-Agent": "Mozilla/5.0 (compatible; KnowlageWhy/0.1)"},
                extensions={"sni_hostname": host},
            ) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                if not any(
                    t in response.headers.get("content-type", "").lower()
                    for t in ("text/html", "application/xhtml+xml", "text/plain")
                ):
                    raise ValueError("来源不是可读取的网页文本")
                chunks = bytearray()
                started = time.monotonic()
                for chunk in response.iter_bytes(8192):
                    chunks.extend(chunk)
                    if len(chunks) >= 1_200_000 or time.monotonic() - started > 10:
                        break
                soup = BeautifulSoup(bytes(chunks), "html.parser", from_encoding=response.encoding)
                metadata = soup.select_one(
                    'meta[property="article:published_time"], meta[name="date"], '
                    'meta[itemprop="datePublished"], meta[name="pubdate"], time[datetime]'
                )
                published = (
                    (metadata.get("content") or metadata.get("datetime") or "") if metadata else ""
                )
                for tag in soup.select("script, style, nav, footer, aside, noscript, form, header"):
                    tag.decompose()
                article = soup.select_one("article") or soup.select_one("main") or soup.body or soup
                paragraphs = article.select("h1, h2, h3, p, blockquote, li, time")
                excerpt = "\n".join(tag.get_text(" ", strip=True) for tag in paragraphs)
                excerpt = " ".join((excerpt or article.get_text(" ", strip=True)).split())
                if len(excerpt) < 150:
                    raise ValueError("网页正文过短或无法提取")
                return url, date_string(published), excerpt[:6800]
    raise ValueError("网页重定向过多")


def date_string(raw: str) -> str:
    try:
        return date.fromisoformat(raw[:10]).isoformat()
    except (ValueError, TypeError):
        return ""


def bing_news(query: str, start: str, end: str) -> list[dict]:
    params = {"q": query, "format": "rss", "count": 12, "setlang": "en-us"}
    response = httpx.get("https://www.bing.com/news/search", params=params, timeout=9)
    response.raise_for_status()
    results = []
    for item in ET.fromstring(response.content).findall("./channel/item")[:12]:
        link = item.findtext("link", "")
        parsed = urlsplit(link)
        if parsed.hostname and parsed.hostname.endswith(".bing.com"):
            link = parse_qs(parsed.query).get("url", [link])[0]
        raw_date = item.findtext("pubDate", "")
        try:
            published = parsedate_to_datetime(raw_date).date().isoformat()
        except (ValueError, TypeError):
            published = ""
        if start and published and not start <= published <= end:
            continue
        results.append(
            {
                "url": link,
                "title": item.findtext("title", ""),
                "date": published,
                "snippet": item.findtext("description", ""),
            }
        )
    return results


def metasearch(query: str, start: str, end: str) -> list[dict]:
    terms = f"{query} after:{start} before:{end}" if start else query
    rows = DDGS(timeout=7).text(terms, max_results=8, backend="brave,duckduckgo,yahoo")
    return [{"url": r["href"], "title": r["title"], "snippet": r.get("body", "")} for r in rows]


class Research:
    def __init__(self, settings, stage: str, start: str, end: str, sources: dict[str, Source]):
        self.brave_key = settings.brave_search_api_key.get_secret_value()
        self.start = start if stage == "discovery" else ""
        self.end = end
        self.sources = sources.copy()
        self.searches: set[str] = set()
        self.opened: set[str] = set()
        self.results: dict[str, list[str]] = {}

    def _brave(self, query):
        params = {"q": query, "count": 10}
        if self.start:
            params["freshness"] = f"{self.start}to{self.end}"
        response = httpx.get(
            "https://api.search.brave.com/res/v1/web/search",
            params=params,
            headers={"X-Subscription-Token": self.brave_key},
            timeout=12,
        )
        response.raise_for_status()
        return [
            {
                "url": r["url"],
                "title": r["title"],
                "snippet": r.get("description", ""),
                "date": date_string(r.get("page_age") or ""),
            }
            for r in response.json().get("web", {}).get("results", [])
        ]

    def search(self, query: str):
        query = " ".join(query.split())[:220]
        if query in self.results:
            return [self.sources[ref].model_dump() for ref in self.results[query]]
        if not query or len(self.searches) >= 6:
            raise ValueError("该阶段可执行至多六次不同的搜索")
        self.searches.add(query)
        if self.brave_key:
            results = self._brave(query)
        else:
            with ThreadPoolExecutor(max_workers=2) as pool:
                requests = [
                    pool.submit(engine, query, self.start, self.end)
                    for engine in (bing_news, metasearch)
                ]
                results = []
                succeeded = False
                for request in requests:
                    try:
                        results.extend(request.result())
                        succeeded = True
                    except (httpx.HTTPError, DDGSException, ET.ParseError, ValueError):
                        continue
                if not succeeded:
                    raise ValueError("公共搜索暂不可用，可稍后重试或配置 Brave Search")
        refs = []
        for row in results:
            parsed = urlsplit(row["url"])
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
                continue
            url = urlunsplit(parsed._replace(fragment=""))
            ref = "web-" + hashlib.sha256(url.encode()).hexdigest()[:16]
            if ref not in self.sources:
                self.sources[ref] = Source(
                    id=ref,
                    url=url,
                    title=row["title"][:240],
                    date=row.get("date", ""),
                    quality="snippet",
                    excerpt=BeautifulSoup(row["snippet"], "html.parser").get_text(" ", strip=True)[:600],
                )
            if ref not in refs:
                refs.append(ref)
        self.results[query] = refs[:10]
        return [self.sources[ref].model_dump() for ref in self.results[query]]

    def open(self, ref: str):
        source = self.sources.get(ref)
        if not source or not source.url:
            raise ValueError("请使用检索结果里的来源 ID")
        if source.quality == "page":
            return source.model_dump()
        if ref in self.opened or len(self.opened) >= 8:
            raise ValueError("该来源已尝试打开，或网页读取额度已用完")
        self.opened.add(ref)
        url, published, text = fetch_page(source.url)
        page_ref = "page-" + hashlib.sha256(url.encode()).hexdigest()[:16]
        page = Source(
            id=page_ref,
            url=url,
            title=source.title,
            date=published or source.date,
            quality="page",
            excerpt=text[:1400],
        )
        self.sources[page_ref] = page
        return {**page.model_dump(), "excerpt": text, "search_result_ref": ref}
