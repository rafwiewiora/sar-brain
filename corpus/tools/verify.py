"""Check the published archive against assay rows, screen results and an inventory quote."""
import csv
import hashlib
from collections import defaultdict
from math import isclose
from statistics import mean, median
from patent import ROOT, load, price
from corpus_adapter import closure


def verify():
    for line in (ROOT / "SHA256SUMS").read_text().splitlines():
        digest, filename = line.split("  ", 1)
        assert hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == digest, filename
    index = load(ROOT / "catalog.json")
    paired = load(ROOT / "screen/paired_starts.json.gz")
    with (ROOT / "screen/coverage_all_128.csv").open() as f:
        table = {r["context"]: r for r in csv.DictReader(f)}
    assert index.keys() == paired.keys() == table.keys()
    total = 0
    for key, entry in index.items():
        assert entry["screen_network"] == entry["versions"][entry["screen_revision"]]["file"]
        for version in entry["versions"].values():
            file = ROOT / version["file"]
            assert hashlib.sha256(file.read_bytes()).hexdigest() == version["sha256"]
            g = load(file)
            assert g["metadata"]["context_id"] == entry["context_id"]
            assert g["metadata"]["patent"] == entry["patent"]
            for r in g["reactions"].values():
                assert set(r["inputs"] + r["outputs"]) <= g["nodes"].keys()
            reached = closure(g)
            assert all(c["node"] in reached and not g["nodes"][c["node"]]["is_stock"]
                       for c in g["compounds"] if c["eligible"])
        g = load(ROOT / entry["screen_network"])
        eligible = [c for c in g["compounds"] if c["eligible"]]
        assert len(eligible) == entry["screen_eligible"] == int(table[key]["n"])
        values = defaultdict(list)
        for obs in load(ROOT / entry["observations"]):
            if obs["is_positive_exact"] and obs["identity_status"] == "match" and not obs["row_qc_excluded"]:
                values[obs["molecule_id"]].append(obs["value"])
        for c in g["compounds"]:
            numbers = values[c["database_molecule_id"]]
            assert len(numbers) == c["numeric_count"] and isclose(median(numbers), c["median_nM"])
        total += len(eligible)
        records = paired[key]["records"]
        assert {r["seed"] for r in records} == set(range(64)) | set(range(1000, 1064))
        assert len(records) == 128 and all(len(set(r["initial"])) == 3 for r in records)
        diffs = [r["fixed"] - r["aware"] for r in records]
        stats = table[key]
        for field, actual in [("mean_paired_savings", mean(diffs)), ("median_paired_savings", median(diffs)),
                              ("wins", sum(v > 0 for v in diffs)), ("ties", diffs.count(0)),
                              ("losses", sum(v < 0 for v in diffs))]:
            assert isclose(float(stats[field]), actual), (key, field)
        for method, col in [("sar", "sar"), ("fixed", "fixed"), ("aware", "updated")]:
            assert median(r[method] for r in records) == float(stats[col])
    example = load(ROOT / "examples/abl1-saving.json")
    graph = load(ROOT / index["US9278981_c8205_e2"]["screen_network"])
    got = price(graph, example["first"], example["next"])
    assert (got["first_steps"], got["next_from_start"], got["next_after_first"]) == (3, 3, 1)
    assert got["reused_molecules"] == example["reused_molecules"]
    for case, fep in load(ROOT / "fep/index.json").items():
        context = load(ROOT / index[fep["context"]]["screen_network"])
        ids = {c["id"] for c in context["compounds"] if c["eligible"]}
        for file in fep["files"]:
            if "/network" in file:
                graph = load(ROOT / file)
                if "nodes" in graph:
                    assert set(graph["nodes"]) == ids
                assert all({e["a"], e["b"]} <= ids for e in graph["edges"])
    print(f"Verified {len({e['patent'] for e in index.values()})} patents, {len(index)} assays, "
          f"{total} eligible compound–context entries, {len(index)*128} paired starts and the ABL1 saving.")


if __name__ == "__main__":
    verify()
