export const languages = {
  zh: { label: '中文', tag: 'zh-CN', index: 0 },
  ja: { label: '日本語', tag: 'ja', index: 1 },
  en: { label: 'English', tag: 'en', index: 2 },
} as const;

export type Locale = keyof typeof languages;
type Triple = readonly [string, string, string];

export const messages = {
  language: ['显示语言', '表示言語', 'Display language'],
  home: ['KnowlageWhy 首页', 'KnowlageWhy ホーム', 'KnowlageWhy home'],
  workspace: ['知识调查工作台', '知識調査ワークスペース', 'Knowledge Investigation Workspace'],
  workspaceShort: ['调查工作台', '調査ワークスペース', 'Workspace'],
  investigation: ['知识调查', '知識調査', 'Knowledge Investigation'],
  connected: ['Neo4j 已连接', 'Neo4j 接続済み', 'Neo4j connected'],
  disconnected: ['本地服务待连接', 'ローカルサービス未接続', 'Local service offline'],
  document: ['原始文档', '元の文書', 'Source document'],
  chooseFile: ['拖入文档，或点击选择', '文書をドロップ、または選択', 'Drop a document or browse'],
  fileTypes: ['TXT / MD · UTF-8 · 最大 100 KB', 'TXT / MD · UTF-8 · 最大 100 KB', 'TXT / MD · UTF-8 · up to 100 KB'],
  removeFile: ['移除所选文件', '選択したファイルを外す', 'Remove selected file'],
  start: ['开始调查', '調査を開始', 'Start investigation'],
  starting: ['正在开始', '開始しています', 'Starting'],
  history: ['调查记录', '調査履歴', 'Investigation history'],
  newRun: ['返回新调查', '新規調査に戻る', 'Back to a new investigation'],
  noRuns: ['暂无调查记录', '調査履歴はまだありません', 'No investigations yet'],
  recentRange: ['近期检索区间', '直近情報の検索期間', 'Recent search window'],
  stages: ['调查阶段', '調査ステップ', 'Investigation stages'],
  structure: ['知识解析', '構造解析', 'Source map'],
  discovery: ['近期检索', '最新情報', 'Recent search'],
  verification: ['事实溯源', '出典・検証', 'Fact-check'],
  traction: ['传播与案例', '拡散・実例', 'Reach & cases'],
  synthesis: ['综合判断', '総合分析', 'Synthesis'],
  video: ['日语动画', '日本語動画', 'Japanese video'],
  structureDesc: ['拆解原文主张、实体和关联', '原文の主張・登場する対象・関係を整理', 'Map the source document’s claims, entities and relationships'],
  discoveryDesc: ['查找近三个月发生的关联事件', '直近3か月の関連情報を検索', 'Find related events from the last three months'],
  verificationDesc: ['追查最早可核实出处和正反证据', '確認可能な最初の出典、裏付けと反証を調査', 'Trace the earliest verifiable sources and assess evidence'],
  tractionDesc: ['追踪传播与独立落地案例', '情報の拡散経路と独立に確認できる実例を調査', 'Trace how the story spread and look for independently documented cases'],
  synthesisDesc: ['整合 Neo4j 中的证据与分歧', 'Neo4j の証拠と見解の相違を統合', 'Reconcile evidence and disagreements recorded in Neo4j'],
  videoDesc: ['从最终图谱生成解说短片', '最終グラフをもとに解説動画を作成', 'Create an explainer from the final graph'],
  retryStage: ['重试当前阶段', 'このステップを再試行', 'Retry this stage'],
  graph: ['知识图谱', 'ナレッジグラフ', 'Knowledge graph'],
  finalGraph: ['最终知识图谱', '最終ナレッジグラフ', 'Final knowledge graph'],
  generatingGraph: ['正在生成图谱', 'グラフを生成しています', 'Generating the graph'],
  knowledgeStructure: ['知识结构', '知識の構造', 'Knowledge structure'],
  nodes: ['节点', 'ノード', 'nodes'],
  edges: ['关系', '関係', 'relationships'],
  waitingRetry: ['等待重试', '再試行を待っています', 'Waiting to retry'],
  preparing: ['正在准备调查', '調査を準備しています', 'Preparing the investigation'],
  kind: ['节点种类', 'ノード種別', 'Node types'],
  topic: ['主题', 'テーマ', 'Topic'],
  claim: ['主张', '主張', 'Claim'],
  entity: ['实体', '対象', 'Entity'],
  event: ['事件', '出来事', 'Event'],
  evidence: ['证据', '証拠', 'Evidence'],
  case: ['案例', '実例', 'Case'],
  conclusion: ['结论', '結論', 'Conclusion'],
  supported: ['证据支持', '裏付けあり', 'Supported'],
  contradicted: ['有反证', '反証あり', 'Contradicted'],
  mixed: ['证据分歧', '証拠が不一致', 'Mixed evidence'],
  unverified: ['待核实', '未確認', 'Unverified'],
  details: ['结果详情', '調査結果の詳細', 'Investigation details'],
  nodeDetail: ['节点详情', 'ノードの詳細', 'Node details'],
  exampleGuide: ['示例导览', 'サンプルガイド', 'Example guide'],
  stageResult: ['阶段结果', 'ステップの結果', 'Stage results'],
  clearSelection: ['清除节点选择', 'ノードの選択を解除', 'Clear node selection'],
  explore: ['在图谱中查看关联', 'グラフから関係を見る', 'Explore relationships in the graph'],
  synthesisResult: ['综合研判', '総合評価', 'Overall assessment'],
  inspectHint: ['点选节点查看详情和来源', 'ノードを選んで詳細と出典を確認', 'Select a node to see details and sources'],
  sourceList: ['证据来源', '証拠の出典', 'Evidence sources'],
  original: ['上传原文', 'アップロードされた原文', 'Uploaded source'],
  snippet: ['检索摘要', '検索結果の抜粋', 'Search snippet'],
  page: ['网页正文', 'ウェブページ本文', 'Web page'],
  seeExcerpt: ['查看原文摘录', '原文の抜粋を見る', 'View original excerpt'],
  clip: ['调查短片', '調査の解説動画', 'Investigation video'],
  jpVoice: ['日语配音', '日本語音声', 'Japanese narration'],
  download: ['下载 MP4', 'MP4 をダウンロード', 'Download MP4'],
  playbackError: ['浏览器无法播放，请下载视频。', 'ブラウザーで再生できません。動画をダウンロードしてください。', 'This browser could not play the video. Download the MP4 to watch it.'],
  clipPaused: ['短片生成暂停', '動画生成が一時停止しています', 'Video generation paused'],
  clipWaiting: ['等待生成', '生成待ち', 'Waiting to generate'],
  transcript: ['解说稿', 'ナレーション原稿', 'Transcript'],
  videoModerating: ['审核中', '審査中', 'In review'],
  videoTranslating: ['准备提示词', 'プロンプトを準備中', 'Preparing prompt'],
  videoQueued: ['渲染排队', 'レンダリング待ち', 'In the render queue'],
  videoRendering: ['渲染中', 'レンダリング中', 'Rendering'],
  videoSaving: ['保存至本地', 'ローカルに保存中', 'Saving locally'],
  queued: ['等待开始', '開始待ち', 'Queued'],
  running: ['调查中', '調査中', 'Investigating'],
  failed: ['调查暂停', '調査が一時停止しています', 'Investigation paused'],
  completed: ['已完成', '完了', 'Completed'],
  analyze: ['正在分析', '分析中', 'Analyzing'],
  search: ['搜索公开资料', '公開資料を検索中', 'Searching public sources'],
  read: ['读取并核对来源正文', '出典の本文を確認中', 'Reading and checking sources'],
  storyboard: ['正在准备分镜', '絵コンテを作成中', 'Preparing the storyboard'],
  render: ['MiniMax H3 Fast 正在生成动画', 'MiniMax H3 Fast で動画を生成中', 'MiniMax H3 Fast is generating the video'],
  save: ['保存动画与日语字幕', '動画と日本語字幕を保存中', 'Saving the video and Japanese captions'],
  sampleGraph: ['示例图谱', 'サンプルグラフ', 'Example graph'],
  relationships: ['关系视图', '関係ビュー', 'Relationship view'],
  graphTools: ['图谱操作', 'グラフ操作', 'Graph controls'],
  replay: ['重播图谱合并', 'グラフ統合を再生', 'Replay graph merge'],
  zoomIn: ['放大图谱', 'グラフを拡大', 'Zoom in on graph'],
  zoomOut: ['缩小图谱', 'グラフを縮小', 'Zoom out of graph'],
  resetView: ['重置图谱视图', 'グラフ表示をリセット', 'Reset graph view'],
  translating: ['正在翻译，暂显示中文原版。', '翻訳中は中国語の原文を表示します。', 'Translating. The original Chinese is shown for now.'],
  graphTranslationFailed: ['翻译暂不可用，正在显示中文原版。', '翻訳を取得できないため、中国語の原文を表示しています。', 'Translation is unavailable. The original Chinese is shown.'],
  captionTranslationFailed: ['翻译字幕暂不可用，可继续使用日语字幕。', '翻訳字幕を取得できません。日本語字幕は利用できます。', 'Translated captions are unavailable. Japanese captions are still available.'],
  retryTranslation: ['重试翻译', '翻訳を再試行', 'Retry translation'],
  invalidFile: ['请选择非空的 UTF-8 文本文件，大小上限为 100 KB。', '空でない UTF-8 のテキストファイル（100 KB 以下）を選択してください。', 'Choose a non-empty UTF-8 text file up to 100 KB.'],
  oneFile: ['每次调查请上传一份文档。', '1回の調査につき文書を1件アップロードしてください。', 'Upload one document per investigation.'],
  serviceError: ['无法访问本地调查服务。', 'ローカルの調査サービスに接続できません。', 'The local investigation service is unavailable.'],
  createFailed: ['新建调查失败。', '調査を開始できませんでした。', 'Could not start the investigation.'],
  readFailed: ['获取调查状态失败。', '調査の状況を取得できませんでした。', 'Could not load the investigation status.'],
  retryFailed: ['重试失败。', '再試行できませんでした。', 'Could not retry the investigation.'],
  diagnostics: ['原始错误详情', '元のエラー詳細', 'Original error details'],
  investigation_failed: ['当前阶段处理失败，请重试。', 'このステップでエラーが発生しました。再試行してください。', 'This stage failed. Try running it again.'],
  provider_timeout: ['连接 ai& 超时或中断，请重试。', 'ai& との接続がタイムアウトまたは切断されました。再試行してください。', 'The ai& connection timed out or dropped. Try again.'],
  local_only: ['请从本地工作台发起调查。', 'ローカルのワークスペースから調査を開始してください。', 'Start the investigation from the local workspace.'],
  run_missing: ['调查不存在。', '調査が見つかりません。', 'Investigation not found.'],
  db_auth: ['Neo4j 认证失败，请核对 .env 里的用户名和密码。', 'Neo4j の認証に失敗しました。.env のユーザー名とパスワードを確認してください。', 'Neo4j authentication failed. Check the credentials in .env.'],
  db_unavailable: ['无法访问 Neo4j，请检查实例、连接端口和数据库名。', 'Neo4j に接続できません。インスタンス、ポート、データベース名を確認してください。', 'Could not reach Neo4j. Check the instance, port and database name.'],
  key_required: ['请在 .env 设置 AIAND_API_KEY，随后重启服务。', '.env に AIAND_API_KEY を設定し、サービスを再起動してください。', 'Set AIAND_API_KEY in .env and restart the service.'],
  file_type: ['请选择 .txt 或 .md 文本文件。', '.txt または .md ファイルを選択してください。', 'Choose a .txt or .md file.'],
  file_size: ['文件大小上限为 100 KB。', 'ファイルサイズの上限は 100 KB です。', 'The file must be 100 KB or smaller.'],
  file_encoding: ['请使用 UTF-8 编码。', 'UTF-8 で保存したファイルを使用してください。', 'Use a UTF-8 encoded file.'],
  file_empty: ['请上传非空的纯文本文件。', '空でないテキストファイルをアップロードしてください。', 'Upload a non-empty text file.'],
  stage_missing: ['图谱阶段不存在。', '調査ステップが見つかりません。', 'Investigation stage not found.'],
  graph_missing: ['该阶段的图谱尚未生成。', 'このステップのグラフはまだありません。', 'This graph has not been generated yet.'],
  video_missing: ['日语解说或字幕尚未生成。', '解説動画または字幕はまだありません。', 'The video or captions are not ready yet.'],
  retry_unavailable: ['仅暂停的调查可重试。', '一時停止中の調査のみ再試行できます。', 'Only paused investigations can be retried.'],
  translation_failed: ['翻译暂不可用，请重试。', '翻訳を取得できません。再試行してください。', 'Translation is unavailable. Try again.'],
} satisfies Record<string, Triple>;

export type MessageKey = keyof typeof messages;

export function isLocale(value: string | null): value is Locale {
  return !!value && Object.hasOwn(languages, value);
}

export function isMessage(value: string | null | undefined): value is MessageKey {
  return !!value && Object.hasOwn(messages, value);
}

export function text(locale: Locale, key: MessageKey) {
  return messages[key][languages[locale].index];
}

export function initialLocale(): Locale {
  const url = new URLSearchParams(window.location.search).get('lang');
  if (isLocale(url)) return url;
  try {
    const saved = localStorage.getItem('knowlagewhy.locale');
    if (isLocale(saved)) return saved;
  } catch {
    // The URL can still retain the selection if site storage is disabled.
  }
  return 'zh';
}
