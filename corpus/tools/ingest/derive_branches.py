#!/usr/bin/env python3
"""Inventory all recorded branching intermediates, without outcome selection.

This is a structural/coverage inventory. Fixed R groups, nonadditivity, historical
commitment and actual switching costs are not inferred by this derivation.
"""
import argparse, collections, itertools, json, sqlite3, time
from pathlib import Path
import networkx as nx

def main():
    p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);a=p.parse_args()
    db=sqlite3.connect(a.database);db.execute('PRAGMA temp_store=MEMORY');db.execute('PRAGMA journal_mode=MEMORY')
    if db.execute("SELECT 1 FROM sqlite_master WHERE name='branch_fact'").fetchone():raise SystemExit('Branch inventory already exists; never silently overwrite a derivation')
    db.executescript('''
CREATE TABLE patent_graph_quality(patent_id INTEGER PRIMARY KEY,molecule_nodes INTEGER,reaction_nodes INTEGER,edges INTEGER,is_dag INTEGER,recorded_terminals INTEGER,invalid_structure_edge_rows INTEGER);
CREATE TABLE branch_fact(patent_id INTEGER NOT NULL,molecule_id INTEGER NOT NULL,also_terminal INTEGER NOT NULL,
  upstream_reactions INTEGER,min_reaction_layers INTEGER,outgoing_reactions INTEGER NOT NULL,direct_products INTEGER NOT NULL,
  descendant_terminals INTEGER NOT NULL,descendant_measured_terminals_any_context INTEGER NOT NULL,
  distinct_nonempty_terminal_branch_sets INTEGER NOT NULL,is_dag INTEGER NOT NULL,PRIMARY KEY(patent_id,molecule_id)) WITHOUT ROWID;
CREATE INDEX branch_fact_size ON branch_fact(descendant_terminals);
''')
    terminals=collections.defaultdict(set)
    for pid,mid in db.execute('SELECT patent_id,molecule_id FROM route_target'):terminals[pid].add(mid)
    measured=collections.defaultdict(set)
    for pid,mid in db.execute('''SELECT DISTINCT a.patent_id,a.molecule_id FROM compound_activity a
        JOIN route_target rt ON rt.patent_id=a.patent_id AND rt.molecule_id=a.molecule_id WHERE a.repeat_quality_pass=1'''):
        measured[pid].add(mid)
    counts=collections.Counter();start=time.monotonic()
    # The sorted stream bounds Python memory by one patent graph.
    cursor=db.execute('SELECT patent_id,reaction_id,molecule_id,direction FROM v_patent_reaction_edge ORDER BY patent_id')
    for pid,group in itertools.groupby(cursor,key=lambda r:r[0]):
        G=nx.DiGraph()
        for _,rx,mo,direction in group:
            r=('r',rx);m=('m',mo)
            G.add_edge(m,r) if direction else G.add_edge(r,m)
        isdag=nx.is_directed_acyclic_graph(G)
        roots={('m',m) for m in terminals[pid]}
        invalid=db.execute('''SELECT COUNT(*) FROM reaction_member rm JOIN route r ON r.id=rm.route_id
            JOIN structure s ON s.id=rm.structure_id WHERE r.patent_id=? AND s.molecule_id IS NULL''',(pid,)).fetchone()[0]
        db.execute('INSERT INTO patent_graph_quality VALUES(?,?,?,?,?,?,?)',(pid,sum(n[0]=='m' for n in G),sum(n[0]=='r' for n in G),G.number_of_edges(),int(isdag),len(roots),invalid))
        if isdag:
            ordered=list(nx.topological_sort(G));desc={};depth={}
            for n in reversed(ordered):
                desc[n]=({n[1]} if n in roots else set())|set().union(*(desc[c] for c in G.successors(n)))
            for n in ordered:
                parents=list(G.predecessors(n))
                depth[n]=((1+max(depth[x] for x in parents)) if n[0]=='r' else min(depth[x] for x in parents)) if parents else (1 if n[0]=='r' else 0)
        else:desc={}
        for n in G:
            if n[0]!='m' or not G.in_degree(n) or not G.out_degree(n):continue
            # Only molecules with a recorded preparation and subsequent use.
            children=list(G.successors(n));products={m for r in children for m in G.successors(r) if m[0]=='m'}
            if isdag:
                downstream=desc[n]-{n[1]};branchsets={frozenset(desc[r]-{n[1]}) for r in children if desc[r]-{n[1]}}
                upstream=sum(x[0]=='r' for x in nx.ancestors(G,n)) if invalid==0 else None
                layers=depth[n] if invalid==0 else None
            else:
                downstream={x[1] for x in nx.descendants(G,n)&roots}-{n[1]}
                branchsets={frozenset(x[1] for x in (nx.descendants(G,r)&roots) if x!=n) for r in children}
                branchsets.discard(frozenset());upstream=None;layers=None
            # Retain all reused prepared molecules, including one-product continuations.
            db.execute('INSERT INTO branch_fact VALUES(?,?,?,?,?,?,?,?,?,?,?)',(pid,n[1],int(n in roots),upstream,layers,len(children),len(products),len(downstream),len(downstream&measured[pid]),len(branchsets),int(isdag)))
            counts['prepared_and_reused_molecules']+=1
            if len(branchsets)>=2:counts['distinct_terminal_branch_candidates']+=1
        counts['patent_graphs']+=1;counts['dag_graphs' if isdag else 'cyclic_graphs']+=1
        if counts['patent_graphs']%1000==0:
            db.commit();print(json.dumps(dict(**counts,elapsed_seconds=round(time.monotonic()-start,1))),flush=True)
    metadata=dict(version='all-branch-inventory-1.0',scope='all route patents',definitions={
        'upstream_reactions':'All distinct ancestral recorded reaction IDs, including alternative preparations. Not a minimum complete route or actual cost.',
        'min_reaction_layers':'Minimum producer layer in the merged DAG; source nodes define the recorded boundary.',
        'descendant_measured_terminals_any_context':'Coverage only, across any positive exact checked-identity activity context. Not a potency comparison or assay pooling.',
        'cyclic_graphs':'Retained with explicit flag; upstream reaction count and depth set NULL, not repaired by deleting edges.',
        'invalid_structure_edges':'Original source memberships retained; upstream count and depth are NULL when a graph contains unassigned chemical identities.',
        'commitment':'Not inferred here. A reusable molecule does not by itself establish a fixed R group or historical commitment.'},counts=dict(counts))
    db.execute('INSERT INTO metadata VALUES(?,?)',('branch_derivation',json.dumps(metadata)))
    db.commit();db.close();receipt=dict(**counts,elapsed_seconds=round(time.monotonic()-start,1));a.receipt.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)

if __name__=='__main__':main()
