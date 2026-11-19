"""Shared, inventory-aware retrospective experiment; all assay feedback at batch completion."""
from pathlib import Path
from functools import lru_cache
from collections import defaultdict
import argparse,json,hashlib,math,time,os,gzip
import numpy as np
from rdkit import Chem,DataStructs
from rdkit.Chem import rdFingerprintGenerator

from patent import load

class Experiment:
 def __init__(self,path,tier='conservative'):
  self.path=Path(path);self.G=load(path);self.N=self.G['nodes'];self.R=self.G['reactions'];self.tier=tier
  by=defaultdict(list)
  for r,q in self.R.items():
   if q.get('issues')or q.get('alternative')or(tier=='conservative'and q.get('expanded_preparation_inference')):continue
   assert isinstance(q['cost'],int)and q['cost']>0
   for n in q['outputs']:by[n].append(r)
  def plan(n,trail=frozenset()):
   if self.N[n].get('is_stock'):return frozenset()
   if n in trail:return None
   options=[]
   for r in by[n]:
    bits={r}
    for i in self.R[r]['inputs']:
     z=plan(i,trail|{n})
     if z is None:break
     bits.update(z)
    else:options.append(frozenset(bits))
   return min(options,key=lambda b:(sum(self.R[r]['cost']for r in b),len(b),sorted(b)))if options else None
  # Coherent recipe per chemical product, determined from the same minimum standalone route.
  self.P={}
  @lru_cache(None)
  def nodeplan(n):return plan(n)
  for n in self.N:
   p=nodeplan(n)
   if p and not self.N[n].get('is_stock'):
    own=[r for r in p if n in self.R[r]['outputs']]
    self.P[n]=min(own,key=lambda r:(self.R[r]['cost'],r))
  def recipe(n,tr=frozenset()):
   if self.N[n].get('is_stock'):return set()
   assert n not in tr and n in self.P,(n,tr)
   r=self.P[n];bits={r}
   for i in self.R[r]['inputs']:bits.update(recipe(i,tr|{n}))
   return bits
  self.E=[];self.routes=[]
  for c in self.G['compounds']:
   p=nodeplan(c['node'])
   if p is None or not c.get('experimental_link',False):continue
   y=c.get('p_activity',c.get('pIC50',c.get('pKi',c.get('pEC50'))))
   if y is None or not np.isfinite(float(y)):continue
   rr=recipe(c['node']);self.E.append(dict(c,p_activity=float(y)));self.routes.append(rr)
  self.n=len(self.E);assert self.n>=8,('Too few complete routes',self.n)
  self.y=np.array([c['p_activity']for c in self.E]);self.active=sorted(set.union(*self.routes));ix={r:i for i,r in enumerate(self.active)}
  self.weights=[self.R[r]['cost']for r in self.active];offset={};z=0
  for i,w in enumerate(self.weights):offset[i]=((1<<w)-1)<<z;z+=w
  self.total_cost=z;self.rmasks=[sum(1<<ix[r]for r in rr)for rr in self.routes];self.smasks=[sum(offset[ix[r]]for r in rr)for rr in self.routes]
  self.term=[sum(1<<ix[r]for r in self.active if c['node']in self.R[r]['outputs'])for c in self.E]
  self.C0=np.array([s.bit_count()for s in self.smasks]);self.top_threshold=sorted(self.y,reverse=True)[math.ceil(self.n*.1)-1];self.top=self.y>=self.top_threshold;self.ntop=int(self.top.sum())
  gen=rdFingerprintGenerator.GetMorganGenerator(radius=2,fpSize=2048);fps=[gen.GetFingerprint(Chem.MolFromSmiles(c['smiles']))for c in self.E];self.S=np.array([DataStructs.BulkTanimotoSimilarity(f,fps)for f in fps])
  self.route_price_discrepancies=[dict(compound=c['id'],graph_cost=c.get('standalone_cost'),executor_cost=int(self.C0[i]))for i,c in enumerate(self.E)if tier=='expanded'and c.get('standalone_cost')is not None and c['standalone_cost']!=self.C0[i]]

 def score(self,best,vals=None):
  vals=self.y if vals is None else vals;s=self.S[np.arange(self.n)[:,None],best];w=s**4+1e-8;pred=(w*vals[best]).sum(1)/w.sum(1);return pred+1-s.max(1),pred
 def update_neighbors(self,best,new):
  ids=np.broadcast_to(np.array(new,int),(self.n,len(new)))
  cand=ids if best is None else np.concatenate([best,ids],axis=1)
  sim=self.S[np.arange(self.n)[:,None],cand];order=np.lexsort((cand,-sim),axis=1)[:,:min(5,cand.shape[1])]
  return np.take_along_axis(cand,order,axis=1)
 def run(self,seed,mode,lam,batch,limit=None):
  rng=np.random.default_rng(seed);initial=rng.choice(self.n,min(3,self.n),False).tolist();tie=rng.random(self.n)*1e-9
  seen=np.zeros(self.n,bool);done=done_r=spent=0;best=None;events=[];plans=[]
  def acquire(i,phase,pid):
   nonlocal done,done_r,spent,seen,best
   cost=(self.smasks[i]&~done).bit_count();new_r=self.rmasks[i]&~done_r;done|=self.smasks[i];done_r|=self.rmasks[i];spent+=cost
   # Every prepared dataset molecule is assayable; assay price is outside this equal-step model.
   available=np.array([bool(t&done_r)for t in self.term]);new=np.flatnonzero(available&~seen).tolist();seen|=available
   events.append(dict(chosen=i,compound=self.E[i]['id'],phase=phase,plan=pid,cost=cost,spent=spent,newResults=new,newReactions=[self.active[j]for j in range(len(self.active))if new_r>>j&1],hits=int(self.top[seen].sum()),recall=float(self.top[seen].sum()/self.ntop),observed=int(seen.sum())))
   return new
  new=[]
  for i in initial:
   if not seen[i]:new+=acquire(i,'seed',-1)
  best=self.update_neighbors(best,new)
  completed=[dict(events[-1],allNewResults=new,allCompounds=[self.E[i]['id']for i in initial])]
  while not seen.all()and(limit is None or spent<limit):
   utility,pred=self.score(best);marg=np.array([(s&~done).bit_count()for s in self.smasks]);quote=self.C0 if mode=='fixed'else marg
   a=utility-(0 if mode=='sar'else lam)*np.log(np.maximum(quote,1))+tie;a[seen]=-np.inf;k=min(batch,int((~seen).sum()));chosen=[int(i)for i in np.argsort(-a,kind='stable')[:k]]
   if mode=='aware_greedy':
    virtual=done;chosen=[]
    for _ in range(k):
     cost=np.array([(s&~virtual).bit_count()for s in self.smasks]);a=utility-lam*np.log(np.maximum(cost,1))+tie;a[seen]=-np.inf;a[chosen]=-np.inf;i=int(np.argmax(a));chosen.append(i);virtual|=self.smasks[i]
   pid=len(plans);plans.append(dict(atSpent=spent,targets=chosen.copy(),utility={str(i):float(utility[i])for i in chosen},quote={str(i):int(quote[i])for i in chosen}));new=[];executed=[]
   while chosen:
    chosen=[i for i in chosen if not seen[i]]
    if not chosen:break
    i=max(chosen,key=lambda j:utility[j]-(0 if mode=='sar'else lam)*np.log(max((self.smasks[j]&~done).bit_count(),1))+tie[j]);new+=acquire(i,'select',pid);executed.append(self.E[i]['id']);chosen.remove(i)
   if new:best=self.update_neighbors(best,new)
   completed.append(dict(events[-1],allNewResults=new,allCompounds=executed))
  assert spent==done.bit_count()
  if seen.all():assert spent==self.total_cost
  return dict(seed=seed,mode=mode,lambda_=lam,batch=batch,initial=initial,events=events,plans=plans,completedEvents=completed)
