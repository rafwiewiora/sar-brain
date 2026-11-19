"""Look up, extract and price recorded patent chemistry. Uses Python's standard library."""
import argparse
import gzip
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
import os

from all_prepared_adapter import export_context
from corpus_adapter import connection, rows
from planner import ReactionPlanner

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    path = Path(path)
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def persist(value, dest):
    raw = (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode()
    if dest is None:
        print(raw.decode(), end="")
        return
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.suffix == ".gz":
        raw = gzip.compress(raw, mtime=0)
    with NamedTemporaryFile(dir=dest.parent, delete=False) as tmp:
        name = Path(tmp.name)
        try:
            tmp.write(raw)
            tmp.flush()
            os.link(name, dest)  # A saved revision is immutable, even across concurrent exports.
        finally:
            name.unlink(missing_ok=True)


def observations(db, context, endpoint):
    sql = """SELECT b.source_data_row, b.reactant_set_id, l.monomer_id, l.ligand_name,
                    b.reported_inchikey, b.identity_status, s.molecule_id, o.raw_value,
                    o.relation, o.value, o.is_positive_exact,
                    EXISTS(SELECT 1 FROM bindingdb_row_qc q WHERE q.row_id=b.id) AS row_qc_excluded
             FROM bindingdb_row b JOIN measurement o ON o.row_id=b.id
             JOIN structure s ON s.id=b.structure_id LEFT JOIN compound_label l ON l.id=b.label_id
             WHERE b.context_id=? AND o.endpoint_id=? ORDER BY b.source_data_row"""
    return rows(db, sql, (context, endpoint))


def portable(graph):
    for source in graph["metadata"]["source_archives"]:
        source["path"] = Path(source["path"]).name
    return graph


def get_graph(key):
    path = Path(key)
    if path.is_file():
        return load(path)
    return load(ROOT / load(ROOT / "catalog.json")[key]["screen_network"])


def inspect_node(g, node):
    return {
        "patent": g["metadata"]["patent"], "source": g["metadata"]["source_patent_url"],
        "context_id": g["metadata"]["context_id"], "molecule": g["nodes"][node],
        "preparations": {k:v for k,v in g["reactions"].items() if node in v["outputs"]},
        "subsequent_reactions": {k:v for k,v in g["reactions"].items() if node in v["inputs"]},
    }


def price(g, first, second):
    if first == second:
        raise ValueError("Choose two distinct molecules for the reuse comparison.")
    planner = ReactionPlanner(g["nodes"], g["reactions"], targets=[first, second])
    stock = set(planner.stock)
    a = planner.plan(first, stock)
    b = planner.plan(second, stock)
    if a is None or b is None:
        raise ValueError("A requested molecule has no executable preparation from the recorded stock.")
    planner.execute_plan(a, stock)
    after = planner.plan(second, stock)
    used = {n for r in after.reactions for n in g["reactions"][r]["inputs"]}
    reused = (used | {second}) & a.outputs - planner.stock
    return dict(patent=g["metadata"]["patent"], context=g["metadata"]["context_id"],
                first=first, next=second, first_steps=a.cost, next_from_start=b.cost,
                next_after_first=after.cost, steps_saved=b.cost-after.cost,
                first_route=a.reactions, standalone_next_route=b.reactions, remaining_route=after.reactions,
                reused_molecules={n:g["nodes"][n] for n in sorted(reused)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("contexts", help="Find exact context and endpoint IDs in a source database")
    p.add_argument("database")
    p.add_argument("patent", help="Normalized publication number such as US9278981")
    p = sub.add_parser("extract", help="Save one assay and synthesis network, including raw assay evidence")
    p.add_argument("database")
    p.add_argument("context", type=int)
    p.add_argument("endpoint", type=int)
    p.add_argument("output", help="Fresh .json or .json.gz file")
    p = sub.add_parser("inspect", help="Save a molecule and every recorded reaction making or using it")
    p.add_argument("graph", help="Archived context key or a network file")
    p.add_argument("node")
    p.add_argument("--output")
    p = sub.add_parser("price", help="Count the marginal operations after making the first compound")
    p.add_argument("graph")
    p.add_argument("first")
    p.add_argument("second")
    p.add_argument("--output")
    args = parser.parse_args()
    if args.command == "contexts":
        sql = """SELECT context_id, endpoint_id, target_name, endpoint, count(*) AS measured
                 FROM v_usable_activity WHERE patent_key=? GROUP BY context_id, endpoint_id
                 ORDER BY context_id, endpoint_id"""
        with connection(args.database) as db:
            persist(rows(db, sql, (args.patent,)), None)
    elif args.command == "extract":
        with connection(args.database) as db:
            graph = portable(export_context(db, args.context, args.endpoint))
            graph["source_observations"] = observations(db, args.context, args.endpoint)
        persist(graph, args.output)
    elif args.command == "inspect":
        persist(inspect_node(get_graph(args.graph), args.node), args.output)
    else:
        persist(price(get_graph(args.graph), args.first, args.second), args.output)


if __name__ == "__main__":
    main()
