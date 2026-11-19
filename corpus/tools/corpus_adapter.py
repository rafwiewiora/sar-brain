"""Read-only corpus -> source-frontier reaction network adapter.

The archive's recorded reactant frontier is the stock boundary. A leaf is NOT a
purchasability assertion, and no laboratory preparation costs outside that
recorded boundary are invented. Distinct reaction memberships in different route
trees are preserved as alternative recipes rather than unioned into fake
co-products. Every input needed by one recorded recipe remains an AND input.
"""
from __future__ import annotations

from collections import defaultdict, Counter
from pathlib import Path
from contextlib import contextmanager
import argparse, hashlib, json, math, sqlite3, sys, statistics
from urllib.parse import quote

DEFAULT_DB=Path('outputs/sar_brain_corpus/sar_corpus.sqlite')
BOUNDARY=('Recorded source-frontier molecules only: a molecule is initially '
          'available if it has no recorded producing reaction anywhere in this '
          'patent graph. Being a leaf in one tree does not make an otherwise '
          'prepared intermediate free. These source-frontier molecules are not '
          'asserted commercially available; absent upstream preparations, '
          'quantities, yields, failures, procurement and assays are not priced.')


@contextmanager
def connection(db):
    if isinstance(db,sqlite3.Connection):
        yield db
        return
    p=Path(db).resolve()
    d=sqlite3.connect('file:'+quote(str(p))+'?mode=ro',uri=True)
    d.execute('PRAGMA query_only=ON')
    try:yield d
    finally:d.close()


def rows(d,sql,args=()):
    c=d.execute(sql,args);keys=[x[0]for x in c.description]
    return [dict(zip(keys,r))for r in c]


def export_patent(db,patent_id):
    """Return all recorded recipes for one patent, with no assay outcomes.

    patent_id may be the database integer ID or exact normalized patent key.
    Invalid-identity edges and cyclic patent graphs raise a clear QC exclusion.
    The caller can cache this result across context/endpoint exports.
    """
    with connection(db) as d:
        if isinstance(patent_id,str)and not patent_id.isdigit():
            pp=rows(d,'SELECT * FROM patent WHERE patent_key=?',(patent_id,))
        else:pp=rows(d,'SELECT * FROM patent WHERE id=?',(int(patent_id),))
        if len(pp)!=1:raise ValueError(f'Unknown patent: {patent_id}')
        pid=pp[0]['id'];pat=pp[0]['patent_key']
        qq=rows(d,'SELECT * FROM patent_graph_quality WHERE patent_id=?',(pid,))
        if not qq:raise ValueError(f'{pat}: no recorded reaction graph')
        quality=qq[0]
        if not quality['is_dag']:raise ValueError(f'{pat}: cyclic graph excluded')
        if quality['invalid_structure_edge_rows']:
            raise ValueError(f'{pat}: invalid chemical identity edges excluded ({quality["invalid_structure_edge_rows"]})')
        rs=rows(d,'''SELECT rm.route_id,rm.reaction_id,rm.direction,s.molecule_id,
                   rx.source_reaction_id,rx.source_patent_key,rx.missing_source_id,
                   rt.source_array_index
            FROM reaction_member rm JOIN route rt ON rt.id=rm.route_id
            JOIN structure s ON s.id=rm.structure_id
            JOIN reaction rx ON rx.id=rm.reaction_id
            WHERE rt.patent_id=? ORDER BY rm.route_id,rm.reaction_id,rm.direction,s.molecule_id''',(pid,))
        if any(r['molecule_id']is None for r in rs):
            raise ValueError(f'{pat}: invalid edge despite QC flag')
        occurrence={}
        for r in rs:
            key=(r['route_id'],r['reaction_id'])
            if key not in occurrence:
                occurrence[key]=dict(inputs=set(),outputs=set(),source=r['source_reaction_id'],source_patent=r['source_patent_key'],missing_source_id=bool(r['missing_source_id']),source_route_array_indices=set(),source_route_ids=set(),db_reaction_id=r['reaction_id'])
            q=occurrence[key]
            q['inputs'if r['direction']==1 else'outputs'].add(r['molecule_id'])
            q['source_route_array_indices'].add(r['source_array_index'])
            q['source_route_ids'].add(r['route_id'])
        # Exact chemical I/O is a recipe; repeated descriptions share one paid
        # operation, while their source records are all retained for review.
        recipes={};source_recipes=defaultdict(set)
        for key,q in occurrence.items():
            sig=(tuple(sorted(q['inputs'])),tuple(sorted(q['outputs'])))
            digest=hashlib.sha256(json.dumps(sig).encode()).hexdigest()[:16]
            rid='r_'+digest
            source_recipes[q['source']].add(rid)
            if rid not in recipes:
                recipes[rid]=dict(inputs=['m_'+str(x)for x in sig[0]],outputs=['m_'+str(x)for x in sig[1]],cost=1,evidence='explicit_recorded_route_membership',expanded_preparation_inference=False,source_records=[],source_reaction_ids=set(),source_patents=set(),source_route_array_indices=set(),source_route_ids=set(),db_reaction_ids=set(),issues=[])
            z=recipes[rid]
            z['source_reaction_ids'].add(q['source'])
            if q['source_patent']:z['source_patents'].add(q['source_patent'])
            z['source_route_array_indices'].update(q['source_route_array_indices'])
            z['source_route_ids'].update(q['source_route_ids'])
            z['db_reaction_ids'].add(q['db_reaction_id'])
            z['source_records'].append(dict(source_reaction_id=q['source'],source_patent=q['source_patent'],db_reaction_id=q['db_reaction_id'],source_route_array_indices=sorted(q['source_route_array_indices']),source_route_ids=sorted(q['source_route_ids']),missing_source_id=q['missing_source_id']))
            if not sig[0]and'missing_recorded_inputs'not in z['issues']:z['issues'].append('missing_recorded_inputs')
            if set(sig[0])&set(sig[1])and'input_equals_output'not in z['issues']:z['issues'].append('input_equals_output')
            # A fabricated source ID has no independently traceable patent step.
            # Retain the recipe in the file but do not use it for pricing.
        mids={r['molecule_id']for r in rs}
        ms={}
        # Avoid SQLite placeholder limits on larger patent graphs.
        for start in range(0,len(mids),800):
            batch=sorted(mids)[start:start+800]
            for r in rows(d,'SELECT * FROM molecule WHERE id IN ('+','.join('?'for _ in batch)+')',batch):ms[r['id']]=r
        produced={x for q in recipes.values()for x in q['outputs']}
        nodes={}
        for mid,m in sorted(ms.items()):
            nid='m_'+str(mid);stock=nid not in produced
            nodes[nid]=dict(id=nid,smiles=m['canonical_smiles'],inchikey=m['inchikey'],database_molecule_id=mid,heavy_atoms=m['heavy_atoms'],rings=m['rings'],is_stock=stock,stock_reason='recorded_source_frontier'if stock else None,stock_purchasability_verified=False)
        for q in recipes.values():
            # A missing-ID duplicate must not poison an independently traceable
            # exact chemical recipe; all raw occurrences remain in provenance.
            if all(r['missing_source_id'] for r in q['source_records']):q['issues'].append('missing_source_reaction_id')
            for k in ['source_reaction_ids','source_patents','source_route_array_indices','source_route_ids','db_reaction_ids']:q[k]=sorted(q[k])
            q['source']=q['source_reaction_ids'][0]if q['source_reaction_ids']else''
        source_multi={s:sorted(rr)for s,rr in source_recipes.items()if len(rr)>1}
        terminals=rows(d,'SELECT molecule_id FROM route_target WHERE patent_id=?',(pid,))
        leaf=[q for q in nodes.values()if q['is_stock']]
        missing=[q for q in recipes.values()if q['issues']]
        metadata=dict(schema='corpus-source-frontier-network-1.0',patent=pat,patent_id=pid,source_boundary=BOUNDARY,
            cost_unit='One recorded preparative reaction operation = one step; no additional isolated-operation inference.',
            graph_quality=quality,source_array_index_base=0,all_patent_reactions_retained=True,
            reaction_membership_policy='Distinct per-route I/O recipes retained; exact chemical I/O deduplicated with every source record preserved. A shared source ID with different recipes is not a co-product assertion.',
            source_id_recipe_conflicts=source_multi,source_id_conflict_count=len(source_multi),
            missing_or_issue_recipe_count=len(missing),stock_frontier_count=len(leaf),
            stock_frontier_heavy_atoms=dict(min=min([q['heavy_atoms']for q in leaf],default=0),median=statistics.median(q['heavy_atoms']for q in leaf)if leaf else 0,max=max([q['heavy_atoms']for q in leaf],default=0),gt15=sum(q['heavy_atoms']>15 for q in leaf),gt25=sum(q['heavy_atoms']>25 for q in leaf)),
            adapter_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            source_db_build_id=json.loads(rows(d,"SELECT value FROM metadata WHERE key='build_id'")[0]['value']),
            source_db_build_version=json.loads(rows(d,"SELECT value FROM metadata WHERE key='build_version'")[0]['value']),
            source_archives=rows(d,'SELECT kind,path,sha256,byte_count FROM source ORDER BY id'),
            source_patent_url='https://patents.google.com/patent/'+pat+'/en')
        return dict(metadata=metadata,nodes=nodes,reactions=dict(sorted(recipes.items())),compounds=[],recorded_terminal_nodes=['m_'+str(r['molecule_id'])for r in terminals])


def closure(network):
    available={n for n,q in network['nodes'].items()if q.get('is_stock')}
    todo={r:q for r,q in network['reactions'].items()if not q.get('issues')}
    while todo:
        made=[]
        for r,q in todo.items():
            if set(q['inputs'])<=available:available.update(q['outputs']);made.append(r)
        if not made:break
        for r in made:del todo[r]
    return available


def export_context(db,context_id,endpoint_id,output=None,patent_graph=None):
    """Return/save one exact assay context and endpoint with source routes.

    output may be a .json file or a directory (network.json is used). A passed
    patent_graph is copied, never modified, allowing repeated context exports.
    All checked activity entries remain in compounds with explicit eligibility;
    only route-terminal matches with executable ancestry have experimental_link.
    """
    with connection(db) as d:
        cc=rows(d,'''SELECT c.*,p.patent_key,t.name target_name,t.organism,t.chain_count,t.chain_identity_json
           FROM assay_context c JOIN patent p ON p.id=c.patent_id JOIN target t ON t.id=c.target_id
           WHERE c.id=?''',(int(context_id),))
        if len(cc)!=1:raise ValueError(f'Unknown or unassigned assay context {context_id}')
        context=cc[0]
        ee=rows(d,'SELECT * FROM endpoint WHERE id=?',(int(endpoint_id),))
        if len(ee)!=1 or ee[0]['unit']!='nM':raise ValueError('Only concentration endpoints in nM are eligible')
        endpoint=ee[0]
        G=json.loads(json.dumps(patent_graph))if patent_graph is not None else export_patent(d,context['patent_id'])
        assert G['metadata']['patent_id']==context['patent_id']
        aa=rows(d,'''SELECT a.*,m.inchikey,m.canonical_smiles,m.heavy_atoms,m.rings,
                CASE WHEN rt.molecule_id IS NOT NULL THEN 1 ELSE 0 END route_terminal_match
            FROM compound_activity a JOIN molecule m ON m.id=a.molecule_id
            LEFT JOIN route_target rt ON rt.patent_id=a.patent_id AND rt.molecule_id=a.molecule_id
            WHERE a.context_id=? AND a.endpoint_id=? AND a.repeat_quality_pass=1
               AND a.median_nM>0 ORDER BY a.molecule_id''',(int(context_id),int(endpoint_id)))
        available=closure(G);cs=[]
        for a in aa:
            mid=a['molecule_id'];nid='m_'+str(mid)
            if nid not in G['nodes']:
                G['nodes'][nid]=dict(id=nid,smiles=a['canonical_smiles'],inchikey=a['inchikey'],database_molecule_id=mid,heavy_atoms=a['heavy_atoms'],rings=a['rings'],is_stock=False,stock_reason=None,stock_purchasability_verified=False)
            terminal=bool(a['route_terminal_match']);prepared=any(nid in r['outputs']and not r['issues']for r in G['reactions'].values());closed=nid in available and terminal and prepared and not G['nodes'][nid]['is_stock']
            status='route_closed_source_frontier'if closed else'not_a_recorded_route_terminal'if not terminal else'no_recorded_preparation_for_terminal'if not prepared else'recorded_route_has_excluded_or_unclosed_dependency'
            cs.append(dict(id='MID_'+str(mid),node=nid,smiles=a['canonical_smiles'],inchikey=a['inchikey'],database_molecule_id=mid,p_activity=9-math.log10(a['median_nM']),**{'p'+endpoint['name']:9-math.log10(a['median_nM'])},endpoint='p'+endpoint['name'],median_nM=a['median_nM'],numeric_count=a['numeric_count'],minimum_nM=a['minimum_nM'],maximum_nM=a['maximum_nM'],repeat_spread=a['repeat_spread'],repeat_quality_pass=True,context_id=int(context_id),target_id=context['target_id'],patents=[context['patent_key']],experimental_link=closed,eligible=closed,conservative_eligible=closed,status=status,gaps=[]if closed else[status],source_links=[dict(patent=context['patent_key'],route_terminal_match=terminal,url=G['metadata']['source_patent_url'])]))
        G['compounds']=cs
        G['metadata'].update(assay_context=context,endpoint=endpoint,context_id=int(context_id),endpoint_id=int(endpoint_id),quantitative_rule='compound_activity derives checked-identity positive exact nM observations; median within exact context/endpoint; repeat spread <=10; no pooling across contexts.',route_terminal_only=True,measured_activity_groups=len(cs),eligible_compounds=sum(c['eligible']for c in cs),activity_span=max([c['p_activity']for c in cs],default=0)-min([c['p_activity']for c in cs],default=0),assay_context_matching_caveat='Matching metadata fields does not establish experimentally identical assay protocol.')
        if output is not None:
            p=Path(output)
            if p.suffix!='.json':p=p/'network.json'
            p.parent.mkdir(parents=True,exist_ok=True)
            data=json.dumps(G,indent=2,allow_nan=False)+'\n'
            if p.exists()and p.read_text()!=data:raise FileExistsError('Refusing to overwrite different adapted graph: '+str(p))
            p.write_text(data)
            receipt=dict(file=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),patent=G['metadata']['patent'],context_id=int(context_id),endpoint_id=int(endpoint_id),eligible_compounds=G['metadata']['eligible_compounds'],nodes=len(G['nodes']),reactions=len(G['reactions']),all_source_recipe_memberships_preserved=True,source_id_conflict_count=G['metadata']['source_id_conflict_count'],boundary=BOUNDARY)
            p.with_name('adapter_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        return G


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--database',type=Path,default=DEFAULT_DB);p.add_argument('--context',type=int,required=True);p.add_argument('--endpoint',type=int,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    g=export_context(a.database,a.context,a.endpoint,a.output)
    print(json.dumps(dict(patent=g['metadata']['patent'],eligible=g['metadata']['eligible_compounds'],nodes=len(g['nodes']),reactions=len(g['reactions']),stocks=g['metadata']['stock_frontier_count'],conflicting_source_ids=g['metadata']['source_id_conflict_count'])))

if __name__=='__main__':main()
