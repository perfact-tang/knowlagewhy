from uuid import uuid4

from neo4j import GraphDatabase

from .config import Settings
from .domain import Graph


class Store:
    def __init__(self, settings: Settings):
        self.database = settings.neo4j_database
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password.get_secret_value()),
            notifications_min_severity="OFF",
            connection_timeout=4,
            max_transaction_retry_time=4,
        )

    def query(self, query: str, **params):
        return self.driver.execute_query(query, parameters_=params, database_=self.database).records

    def initialize(self):
        for name, label in (
            ("kw_run_id", "KWInvestigation"),
            ("kw_snapshot_id", "KWGraph"),
            ("kw_node_id", "KWNode"),
            ("kw_source_id", "KWSource"),
        ):
            self.query(f"CREATE CONSTRAINT {name} IF NOT EXISTS FOR (n:{label}) REQUIRE n.key IS UNIQUE")

    def create(self, filename: str, document: str, start: str, end: str) -> str:
        key = str(uuid4())
        self.query(
            """CREATE (:KWInvestigation {key: $key, filename: $filename, document: $document,
                status: 'queued', active: 'structure', created_at: toString(datetime()),
                start: $start, end: $end, attempt: 0})""",
            key=key,
            filename=filename,
            document=document,
            start=start,
            end=end,
        )
        return key

    def list(self):
        return [
            row["run"]
            for row in self.query(
                """MATCH (r:KWInvestigation)
            RETURN r{.key, .filename, .created_at, .status, .title} AS run
            ORDER BY r.created_at DESC LIMIT 40"""
            )
        ]

    def get(self, key: str, *, private: bool = False):
        projection = (
            "properties(r)"
            if private
            else """r{.key, .filename, .title, .status,
            .active, .progress, .error, .created_at, .start, .end, .video_status, .video_title, .narration}"""
        )
        rows = self.query(
            f"""MATCH (r:KWInvestigation {{key: $key}})
            OPTIONAL MATCH (r)-[:KW_HAS_GRAPH]->(g:KWGraph)
            RETURN {projection} AS run, collect(g.stage) AS stages""",
            key=key,
        )
        return {**rows[0]["run"], "stages": rows[0]["stages"]} if rows else None

    def update(self, key: str, **fields):
        self.query("MATCH (r:KWInvestigation {key: $key}) SET r += $fields", key=key, fields=fields)

    def claim(self, key: str, expected: str) -> bool:
        # Incrementing a property takes an exclusive write lock before checking status.
        return bool(
            self.query(
                """MATCH (r:KWInvestigation {key: $key})
            SET r.attempt = r.attempt + 1
            WITH r WHERE r.status = $expected
            SET r.status = 'running', r.error = null, r.progress = null
            RETURN r.key""",
                key=key,
                expected=expected,
            )
        )

    def recover(self):
        return [
            row["key"]
            for row in self.query(
                """MATCH (r:KWInvestigation) WHERE r.status IN ['queued', 'running']
            SET r.status = 'queued' RETURN r.key AS key"""
            )
        ]

    def save_graph(self, key: str, stage: str, graph: Graph):
        snapshot = f"{key}:{stage}"
        nodes = [
            node.model_dump(mode="json", exclude={"refs"}, exclude_none=True) for node in graph.nodes
        ]
        sources = [source.model_dump() for source in graph.sources]
        refs = [{"node": node.id, "ref": ref} for node in graph.nodes for ref in node.refs]
        edges = [edge.model_dump() for edge in graph.edges]

        def write(tx):
            base = {"key": key, "snapshot": snapshot}
            tx.run(
                """MATCH (r:KWInvestigation {key: $key})
                CREATE (r)-[:KW_HAS_GRAPH]->(g:KWGraph {key: $snapshot, stage: $stage,
                    title: $title, summary: $summary, research_topics: $topics})
                SET r.title = $title, r.progress = null""",
                **base,
                stage=stage,
                title=graph.title,
                summary=graph.summary,
                topics=graph.research_topics,
            ).consume()
            tx.run(
                """MATCH (g:KWGraph {key: $snapshot})
                UNWIND $nodes AS row
                CREATE (g)-[:KW_HAS_NODE]->(n:KWNode {key: $snapshot + ':' + row.id})
                SET n += row""",
                snapshot=snapshot,
                nodes=nodes,
            ).consume()
            tx.run(
                """UNWIND $sources AS row
                MERGE (s:KWSource {key: $key + ':' + row.id})
                ON CREATE SET s += row""",
                key=key,
                sources=sources,
            ).consume()
            tx.run(
                """UNWIND $refs AS row
                MATCH (n:KWNode {key: $snapshot + ':' + row.node}), (s:KWSource {key: $key + ':' + row.ref})
                MERGE (n)-[:KW_CITES]->(s)""",
                **base,
                refs=refs,
            ).consume()
            tx.run(
                """UNWIND $edges AS row
                MATCH (a:KWNode {key: $snapshot + ':' + row.source}),
                      (b:KWNode {key: $snapshot + ':' + row.target})
                MERGE (a)-[:KW_RELATES {label: row.label}]->(b)""",
                snapshot=snapshot,
                edges=edges,
            ).consume()

        with self.driver.session(database=self.database) as session:
            session.execute_write(write)

    def graph(self, key: str, stage: str) -> Graph | None:
        rows = self.query(
            """MATCH (g:KWGraph {key: $snapshot})
            CALL (g) {
                MATCH (g)-[:KW_HAS_NODE]->(n)
                OPTIONAL MATCH (n)-[:KW_CITES]->(s)
                WITH n, collect(s.id) AS refs
                RETURN collect(n{.*, key: null, refs: refs}) AS nodes
            }
            CALL (g) {
                MATCH (g)-[:KW_HAS_NODE]->(n)-[e:KW_RELATES]->(m)
                RETURN collect({source: n.id, target: m.id, label: e.label}) AS edges
            }
            CALL (g) {
                MATCH (g)-[:KW_HAS_NODE]->()-[:KW_CITES]->(s)
                WITH DISTINCT s
                RETURN collect(s{.*, key: null}) AS sources
            }
            RETURN g.title AS title, g.summary AS summary, g.research_topics AS research_topics,
                nodes, edges, sources""",
            snapshot=f"{key}:{stage}",
        )
        if not rows:
            return None
        data = rows[0].data()
        for item in data["nodes"] + data["sources"]:
            item.pop("key", None)
        return Graph.model_validate(data)
