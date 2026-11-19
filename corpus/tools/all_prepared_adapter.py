"""New pool revision: all assayed, actually recorded prepared route nodes.

The terminal-only networks, their inputs and adapter remain unchanged. This
wrapper expands eligibility to internal prepared molecules with the same exact
context/endpoint, verified concentration conversion, and executable ancestry.
"""
from pathlib import Path
import sys,json,hashlib,math,statistics
sys.path.insert(0,str(Path(__file__).parent))
from corpus_adapter import export_context as export_terminal_context,closure

def export_context(db,context_id,endpoint_id,output=None,patent_graph=None,base_network=None):
 if base_network is not None:
  g=json.loads(Path(base_network).read_text())if isinstance(base_network,(str,Path))else json.loads(json.dumps(base_network))
  assert g['metadata']['context_id']==context_id and g['metadata']['endpoint_id']==endpoint_id
 else:g=export_terminal_context(db,context_id,endpoint_id,None,patent_graph)
 previous=sum(c.get('eligible',False)for c in g['compounds']);available=closure(g);produced={n for r in g['reactions'].values()if not r.get('issues')for n in r['outputs']}
 added=[];terminal=0
 for c in g['compounds']:
  assert c['context_id']==context_id and c['repeat_quality_pass']and c['repeat_spread']<=10 and c['median_nM']>0
  assert math.isclose(c['p_activity'],9-math.log10(c['median_nM']),abs_tol=1e-12)
  n=c['node'];okay=n in produced and n in available and not g['nodes'][n].get('is_stock')
  isterminal=bool(any(s.get('route_terminal_match')for s in c['source_links']))
  if okay and not c.get('eligible'):added.append(c['id'])
  c['experimental_link']=okay;c['eligible']=okay;c['conservative_eligible']=okay
  c['status']='recorded_prepared_node_closed_source_frontier'if okay else'no_executable_recorded_preparation'
  c['gaps']=[]if okay else[c['status']]
  c['recorded_route_terminal']=isterminal;c['recorded_prepared_node']=n in produced
  for s in c['source_links']:s['recorded_preparation_match']=n in produced
  if okay and isterminal:terminal+=1
 m=g['metadata'];m['route_terminal_only']=False;m['eligible_compounds']=sum(c['eligible']for c in g['compounds']);m['pool']='all_recorded_prepared_route_nodes'
 m['pool_expansion']=dict(wrapper_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),terminal_eligible=terminal,all_prepared_eligible=m['eligible_compounds'],added_assayed_internal_compounds=added,added_count=len(added),original_eligible_count=previous,definition='Every exact-QC context/endpoint activity molecule with an actual recorded producing recipe and forward-executable ancestry. Pure source-frontier inputs remain excluded. Source preparation is archive evidence; claims/proposed structures are not added independently.',base_network=str(base_network)if isinstance(base_network,(str,Path))else None,base_network_sha256=hashlib.sha256(Path(base_network).read_bytes()).hexdigest()if isinstance(base_network,(str,Path))else None)
 leaf=[v['heavy_atoms']for v in g['nodes'].values()if v.get('is_stock')];m['stock_frontier_count']=len(leaf);m['stock_frontier_heavy_atoms']=dict(min=min(leaf,default=0),median=statistics.median(leaf)if leaf else 0,max=max(leaf,default=0),gt15=sum(x>15 for x in leaf),gt25=sum(x>25 for x in leaf))
 if output is not None:
  p=Path(output)
  if p.suffix!='.json':p=p/'network.json'
  p.parent.mkdir(exist_ok=True,parents=True);payload=json.dumps(g,indent=2,allow_nan=False)+'\n'
  if p.exists():assert p.read_text()==payload,'Refusing to change consumed all-prepared revision: '+str(p)
  else:p.write_text(payload)
  receipt=dict(file=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),patent=m['patent'],context_id=context_id,endpoint_id=endpoint_id,original_terminal_eligible=terminal,all_prepared_eligible=m['eligible_compounds'],added_count=len(added),added_ids=added,base_network=m['pool_expansion']['base_network'],base_network_sha256=m['pool_expansion']['base_network_sha256'],wrapper_sha256=m['pool_expansion']['wrapper_sha256'],cost_boundary=m['source_boundary'],reviewed_boundary_revision=m.get('reviewed_boundary_revision'))
  p.with_name('all_prepared_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return g

def main():
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--database',default='outputs/sar_brain_corpus/sar_corpus.sqlite');p.add_argument('--context',type=int,required=True);p.add_argument('--endpoint',type=int,required=True);p.add_argument('--output',required=True);p.add_argument('--base-network');a=p.parse_args();g=export_context(a.database,a.context,a.endpoint,a.output,base_network=a.base_network);print(json.dumps(g['metadata']['pool_expansion']))
if __name__=='__main__':main()
