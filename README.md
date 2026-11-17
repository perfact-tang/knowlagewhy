# KnowlageWhy · Knowledge Investigation Workbench

Drag and drop a UTF-8 encoded TXT or Markdown file to sequentially run knowledge parsing, recent retrieval, fact-checking & source tracing, virality & case analysis, comprehensive judgment, and Japanese animation generation. Nodes, relationships, and evidence citations from the first five stages are written to Neo4j. The short video is produced based on the final graph and saved as an MP4 with a Japanese audio track and Japanese subtitles.

## Getting Started

Requires Python 3.12–3.14, `uv`, Node.js 20.19+ or 22.12+, and a local Neo4j instance. For first-time setup, create a `.env` file based on `.env.example` and fill in your `ai&` API Key and Neo4j connection details. If you are using the pre-configured standalone local instance, the `.env` file in the workspace is already configured with the corresponding values.

The standalone local instance uses Bolt port `7689` and Browser port `7476`, with installation and data files stored in `var/neo4j/`. To restart the database, run the following in one terminal:

```sh
./scripts/neo4j-local.sh

```

Open another terminal and run the following commands from the project directory:

```sh
uv sync --python 3.12
npm ci
npm run build
uv run uvicorn investigator.main:app --host 127.0.0.1 --port 8000

```

Access the [Local Workbench](http://127.0.0.1:8000/). For frontend development, you can run `npm run dev` while the backend service is running. On the final desktop view, the knowledge graph is displayed on the left and the short video on the right. Click on a node to inspect its cited sources, or click the crossed-arrows icon at the top right of the graph to replay the stage-merging animation. If an investigation is paused, clicking retry on the page will reuse existing graphs and any still-valid video generation tasks. The backend runs on a single Uvicorn process.

## Interface Language

You can switch between **中文, 日本語, and English** in the top right corner; your selection is saved in the URL and local browser storage. When opening the Japanese or English version of a stage for the first time, the system uses `ai&` to translate the graph title, nodes, relationships, and summary, caching the translations in Neo4j. Initial translation is typically slower than reopening cached translations. Citation links, original text excerpts, node IDs, and verification verdicts remain unchanged.

The video uses its original Japanese voiceover, and the player provides Chinese, Japanese, and English subtitles. Switching the interface language automatically selects the corresponding subtitle track, though you can choose another track manually within the player. If translations are temporarily unavailable, you can still browse the original graph and Japanese subtitles.

## Investigation & Generation

* Each Agent uses [mini-SWE-agent's DefaultAgent](https://mini-swe-agent.com/latest/advanced/cookbook/) powered by `ai&`'s `deepseek-ai/deepseek-v4.1-flash-1017`. Investigation tools can search public resources and read cited web pages. Uploaded files are submitted by the server to the configured reasoning model for parsing.
* Recent retrieval uses a three-calendar-month window based on Tokyo time (JST). Bing News and DDGS are used by default, or you can switch to Brave Search by setting `BRAVE_SEARCH_API_KEY`. Fact-checking and virality analysis can search materials predating this window. Nodes distinguish between full webpage body text and search snippets; findings lacking full-text support have their certainty downgraded to "Pending Verification."
* Each stage reads upstream snapshots from Neo4j. The Neo4j relationships `KW_HAS_GRAPH`, `KW_HAS_NODE`, `KW_RELATES`, and `KW_CITES` connect investigations, stages, nodes, and citations respectively. Each stage retains an independent snapshot that can be reviewed in the interface.
* The short video uses `ai&`'s `minimaxai/minimax-h3-fast`. New accounts must first accept the video service terms in the [ai& Video Console](https://console.aiand.com/). When `JAPANESE_VOICE=Kyoko` is set, voiceovers are generated locally from the narration script using macOS `say` and FFmpeg; if left blank, H3 generates the Japanese dialogue directly. MP4 and VTT files are saved in `var/media/`.
* `.env`, the local graph database, and generated media are kept in Git-ignored directories. Sample uploads, searches, and generations will consume quota from their respective services.

## Checks

```sh
uv run pytest -q
uv run ruff check investigator tests
npm run check
npm run build

```