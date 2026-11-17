import type { Graph, GraphNode } from './domain';
import { languages } from './i18n';
import type { Locale } from './i18n';

type Triple = readonly [string, string, string];

const nodes = [
  ['center', 'topic', ['城市屋顶绿化', '都市の屋上緑化', 'Urban green roofs'],
    ['梳理城市屋顶绿化、降温、维护和落地应用之间的关系。', '都市の屋上緑化と、気温の低下、維持管理、導入事例との関係を整理しています。', 'Explore how green roofs connect to cooling, maintenance and real-world adoption.']],
  ['heat', 'event', ['热岛效应', 'ヒートアイランド現象', 'Urban heat island'],
    ['展示屋顶绿化试图缓解的问题。', '屋上緑化が対策となり得る課題です。', 'This is a problem green roofs may help address.']],
  ['research', 'evidence', ['城市气候研究', '都市気候の研究', 'Urban climate study'],
    ['调查开始后，证据节点可展开查看原始链接、发布日期和正文摘要。', '調査結果の証拠ノードでは、リンク、公開日、本文の抜粋を確認できます。', 'Evidence nodes from an investigation can show the source link, publication date and excerpt.']],
  ['temp', 'claim', ['降温潜力', '冷却効果の可能性', 'Cooling potential'],
    ['可检验的主张。实际调查会追查适用条件与反例。', '検証できる主張です。調査では適用条件と反例を探します。', 'A claim to test against the conditions where it applies and any documented counterexamples.']],
  ['policy', 'case', ['市政试点', '自治体の実証事業', 'Municipal pilot'],
    ['案例节点可区分试点、实际部署，以及是否有独立验证。', '実例ノードでは、試験導入と本格導入の違いや、独立検証の有無を確認できます。', 'Case nodes can distinguish pilots, deployments and independent verification.']],
  ['maintenance', 'claim', ['维护成本', '維持管理費', 'Maintenance cost'],
    ['维护投入是评估应用时值得追查的条件。', '導入を評価する際、維持管理にかかる費用や手間も調査の対象になります。', 'Ongoing maintenance is one factor to investigate when assessing adoption.']],
  ['vegetation', 'entity', ['植被覆盖', '植生被覆', 'Vegetation cover'],
    ['屋顶上被植被覆盖的区域。', '屋上で植物に覆われている範囲です。', 'The part of a roof covered by plants.']],
  ['survey', 'evidence', ['现场温度记录', '現地の温度記録', 'On-site temperature'],
    ['调查时可检查数据来自实地测量、模拟或报道。', '調査では、実測値、シミュレーション、報道のどれに基づくデータか確認できます。', 'Check whether the figures come from field measurements, a simulation or a report.']],
  ['levels', 'entity', ['建筑能耗', '建物のエネルギー消費', 'Building energy use'],
    ['可作为后续调查的观察指标。', '追加調査で確認できる指標です。', 'A metric to track in follow-up research.']],
  ['limits', 'conclusion', ['局部差异', '場所による違い', 'Local variation'],
    ['调查结论会显示数据范围、分歧及待核实问题。', '結論にはデータの範囲、見解の相違、未確認の事項も含まれます。', 'The assessment shows the scope of the data, areas of disagreement and open questions.']],
  ['urban', 'entity', ['高密度街区', '高密度の市街地', 'Dense neighborhoods'],
    ['观察热岛效应和屋顶绿化影响的城市环境。', 'ヒートアイランド現象や屋上緑化の効果を観測する都市環境です。', 'An urban setting in which to study heat islands and the impact of green roofs.']],
  ['rain', 'claim', ['雨水调节', '雨水流出の抑制', 'Stormwater retention'],
    ['可检验屋顶绿化能否减少雨水径流。', '屋上緑化で雨水の流出を抑えられるか検証できます。', 'A claim about whether green roofs can reduce stormwater runoff.']],
] satisfies [string, GraphNode['kind'], Triple, Triple][];

const relations = {
  addresses: ['应对', '対策となる', 'addresses'],
  raises: ['提出', '着目する', 'raises'],
  applies: ['应用', '導入事例', 'applied in'],
  involves: ['涉及', '関わる', 'involves'],
  requires: ['需要', '必要とする', 'requires'],
  limits: ['适用条件', '適用条件', 'depends on'],
  occurs: ['发生于', '発生する', 'occurs in'],
  checks: ['用于核对', '検証に用いる', 'helps verify'],
  uses: ['使用', '用いる', 'uses'],
  measures: ['测量', '測定する', 'measures'],
  affects: ['影响', '影響する', 'affects'],
  relates: ['关联', '関連する', 'relates to'],
  studies: ['研究', '研究対象', 'studies'],
  explains: ['解释', '説明する', 'explains'],
} satisfies Record<string, Triple>;

const edges = [
  ['center', 'heat', 'addresses'], ['center', 'temp', 'raises'], ['center', 'policy', 'applies'],
  ['center', 'vegetation', 'involves'], ['center', 'maintenance', 'requires'], ['center', 'limits', 'limits'],
  ['center', 'rain', 'raises'], ['heat', 'urban', 'occurs'], ['survey', 'temp', 'checks'],
  ['research', 'survey', 'uses'], ['policy', 'survey', 'measures'], ['temp', 'levels', 'affects'],
  ['vegetation', 'rain', 'relates'], ['research', 'heat', 'studies'], ['limits', 'levels', 'explains'],
] as const;

export function exampleGraph(locale: Locale): Graph {
  const index = languages[locale].index;
  return {
    title: nodes[0][2][index],
    summary: [
      '点选节点，查看图谱如何组织主张、证据和案例。上传一份文档即可开始自己的调查。',
      'ノードを選ぶと、主張・証拠・実例がどうつながるか確認できます。文書をアップロードすると調査を始められます。',
      'Select a node to see how the graph connects claims, evidence and cases. Upload a document to start your own investigation.',
    ][index],
    nodes: nodes.map(([id, kind, label, detail]) => ({ id, label: label[index], kind, detail: detail[index], verdict: '', date: null, excerpt: '', refs: [] })),
    edges: edges.map(([source, target, label]) => ({ source, target, label: relations[label][index] })),
    sources: [],
  };
}
