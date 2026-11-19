"""Extend a patent network with a cited preparation for a recorded starting material."""
import argparse
from graphlib import TopologicalSorter
import hashlib
import json

from rdkit import Chem
from all_prepared_adapter import export_context
from patent import get_graph, load, persist


def extend(network, review):
    meta = network["metadata"]
    if review["patent"] != meta["patent"]:
        raise ValueError("Review belongs to another patent.")
    nodes, reactions = network["nodes"], network["reactions"]
    index = {n["inchikey"]: k for k, n in nodes.items()}
    original_stock = {n["inchikey"] for n in nodes.values() if n.get("is_stock")}
    steps = review["reactions"]
    if not steps:
        raise ValueError("Empty preparation.")
    produced = {key for step in steps for key in step["outputs"]}
    consumed = {key for step in steps for key in step["inputs"]}
    if not (produced - consumed) or not (produced - consumed) <= original_stock:
        raise ValueError("Each final product of the added preparation must match a recorded stock molecule.")
    if set(review["molecules"]) != produced | consumed:
        raise ValueError("Provide one SMILES for each input and output InChIKey.")
    for key, smiles in review["molecules"].items():
        mol = Chem.MolFromSmiles(smiles)
        if mol is None or Chem.MolToInchiKey(mol) != key:
            raise ValueError(f"Structure does not match {key}.")
        if key not in index:
            nid = "review_" + key
            index[key] = nid
            nodes[nid] = dict(id=nid, inchikey=key, smiles=Chem.MolToSmiles(mol),
                              heavy_atoms=mol.GetNumHeavyAtoms(), rings=mol.GetRingInfo().NumRings(),
                              is_stock=True, stock_reason="reviewed_source_frontier",
                              stock_purchasability_verified=False)
    for s in steps:
        rid = s["id"]
        if rid in reactions or type(s["cost"]) is not int or s["cost"] < 1:
            raise ValueError(f"Duplicate reaction ID or invalid operation count at {rid}.")
        refs = s["source_records"]
        if not refs or any(not (r.get("url") and r.get("example") and r.get("patent")) for r in refs):
            raise ValueError(f"Supply a source patent, URL and example or step for {rid}.")
        inputs = [index[k] for k in s["inputs"]]
        outputs = [index[k] for k in s["outputs"]]
        if not inputs or not outputs or set(inputs) & set(outputs):
            raise ValueError(f"Check the input and output structures at {rid}.")
        reactions[rid] = dict(inputs=inputs, outputs=outputs, cost=s["cost"], label=s["label"],
                              conditions=s.get("conditions"), reagents=s.get("reagents"), issues=[],
                              source=refs[0]["url"], source_records=refs, evidence="explicit_preparation_reviewed")
        for nid in outputs:
            nodes[nid].update(is_stock=False, stock_reason=None)
    order = TopologicalSorter()
    for r in reactions.values():
        if not r.get("issues"):
            for n in r["outputs"]:
                order.add(n, *r["inputs"])
    tuple(order.static_order())
    digest = hashlib.sha256(json.dumps(review, sort_keys=True).encode()).hexdigest()
    meta.setdefault("preparation_reviews", []).append(dict(title=review["title"], sha256=digest,
                                                           added_reactions=[s["id"] for s in steps]))
    # Recalculate the stock frontier and eligible assay pool after the edit.
    return export_context(None, meta["context_id"], meta["endpoint_id"], base_network=network)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("graph")
    p.add_argument("review")
    p.add_argument("output")
    args = p.parse_args()
    persist(extend(get_graph(args.graph), load(args.review)), args.output)
