# KnowlageWhy · 知识调查工作台

拖入 UTF-8 的 TXT 或 Markdown 文件，依次运行知识解析、近期检索、事实溯源、传播与案例、综合判断和日语动画。前五个阶段的节点、关系及证据引用写入 Neo4j。短片基于最终图谱制作，保存为带日语音轨的 MP4 及日语字幕。

## 启动

需要 Python 3.12–3.14、uv、Node.js 20.19+ 或 22.12+，以及本地 Neo4j。首次启动时根据 `.env.example` 建立 `.env`，填入 ai& API Key 和 Neo4j 连接信息。如果使用本机已经准备好的独立实例，工作区内的 `.env` 已配置对应值。

本机独立实例使用 Bolt 端口 `7689` 和浏览器端口 `7476`，安装和数据放在 `var/neo4j/`。需要重新启动数据库时，在一个终端运行：

```sh
./scripts/neo4j-local.sh
```

打开另一个终端，从项目目录运行：

```sh
uv sync --python 3.12
npm ci
npm run build
uv run uvicorn investigator.main:app --host 127.0.0.1 --port 8000
```

访问 [本地工作台](http://127.0.0.1:8000/)。前端开发可在后端服务运行时执行 `npm run dev`。桌面最终页面左侧是图谱，右侧是短片。点击节点可以检查引用来源，点击图谱右上方的交叉箭头可重播阶段合并动画。调查暂停后，页面上的重试会复用已有图谱和仍有效的视频生成任务。后端使用单个 Uvicorn 进程。

## 界面语言

右上角可切换**中文、日本語、English**，选择随链接和本机浏览器保存。首次打开某阶段的日语或英语版本时，系统使用 ai& 翻译图谱标题、节点、关系和总结，并将译文缓存到 Neo4j。首次翻译通常比重新打开已缓存的译文慢。引用链接、原文摘录、节点 ID 和核查判定保留原样。

视频使用原本的日语配音，播放器提供中文、日本語和 English 字幕。切换界面语言时会选用相应字幕，可在播放器内另选。译文暂不可用时仍可浏览原图谱和日语字幕。

## 调查与生成

- 每个 Agent 使用 [mini-SWE-agent 的 DefaultAgent](https://mini-swe-agent.com/latest/advanced/cookbook/) 与 ai& 的 `deepseek-ai/deepseek-v4.1-flash-1017`。调查工具可搜索公开资料和读取引用网页。上传的文件由服务端提交给配置的推理模型解析。
- 近期检索采用东京日期的三个自然月窗口。默认使用 Bing News 和 DDGS，可通过 `BRAVE_SEARCH_API_KEY` 改用 Brave Search。事实溯源和传播分析可以检索窗口之前的材料。节点区分网页正文和检索摘要，缺少正文支撑时将确定性判断降为待核实。
- 每一阶段从 Neo4j 读取上游快照。Neo4j 关系 `KW_HAS_GRAPH`、`KW_HAS_NODE`、`KW_RELATES`、`KW_CITES` 分别连接调查、阶段、节点和引用。各阶段保留独立快照，可在界面回看。
- 短片使用 ai& 的 `minimaxai/minimax-h3-fast`。新账号需要先在 [ai& 视频控制台](https://console.aiand.com/) 接受视频服务条款。设置 `JAPANESE_VOICE=Kyoko` 时，本机通过 macOS `say` 和 FFmpeg 按解说稿配音，留空时使用 H3 生成日语对白。MP4 和 VTT 存放在 `var/media/`。
- `.env`、本地图数据库及生成媒体收在 Git 忽略目录内。样例上传、搜索与生成会消耗对应服务的额度。

## 检查

```sh
uv run pytest -q
uv run ruff check investigator tests
npm run check
npm run build
```
