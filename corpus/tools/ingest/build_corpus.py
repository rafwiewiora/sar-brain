#!/usr/bin/env python3
"""Stream the complete local route and BindingDB archives into a queryable corpus.

Original archives remain the source of record. No target, potency, vector-count or
legacy-patent selection is applied during ingestion. Run with the task RDKit venv.
"""
import argparse, collections, csv, functools, gzip, hashlib, io, json, math
import os, re, shutil, sqlite3, sys, time, zipfile, uuid, platform
from pathlib import Path
import ijson
from rdkit import Chem, RDLogger
import rdkit

RDLogger.DisableLog('rdApp.warning');RDLogger.DisableLog('rdApp.error')
VERSION='sar-corpus-1.0'
NUM=re.compile(r'^(?P<op><=|>=|<|>|=|~|≤|≥|≈)?\s*(?P<num>(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)$')
ENDPOINTS=[('Ki (nM)','Ki','nM'),('IC50 (nM)','IC50','nM'),('Kd (nM)','Kd','nM'),('EC50 (nM)','EC50','nM'),('koff (s-1)','koff','s^-1'),('kon (M-1-s-1)','kon','M^-1 s^-1')]

def patent_key(text):
    text=str(text or '').strip().upper().split(';')[0]
    # Leading-zero and kind-code aliases only. Do not infer patent families.
    m=re.fullmatch(r'([A-Z]{2})[\s-]*0*(\d+)(?:[A-Z]\d?)?',text)
    return m[1]+str(int(m[2])) if m else (text if text else None)

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()

def signature(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def log(message,**data):print(json.dumps(dict(time=time.strftime('%H:%M:%S'),message=message,**data)),flush=True)

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE source(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,byte_count INTEGER NOT NULL);
CREATE TABLE patent(id INTEGER PRIMARY KEY,patent_key TEXT NOT NULL UNIQUE);
CREATE TABLE patent_alias(source_id INTEGER NOT NULL,raw_patent TEXT NOT NULL,patent_id INTEGER NOT NULL REFERENCES patent,PRIMARY KEY(source_id,raw_patent)) WITHOUT ROWID;
CREATE TABLE cohort(name TEXT NOT NULL,patent_id INTEGER NOT NULL REFERENCES patent,PRIMARY KEY(name,patent_id)) WITHOUT ROWID;
CREATE TABLE molecule(id INTEGER PRIMARY KEY,inchikey TEXT NOT NULL UNIQUE,canonical_smiles TEXT NOT NULL,heavy_atoms INTEGER NOT NULL,rings INTEGER NOT NULL);
CREATE TABLE structure(id INTEGER PRIMARY KEY,raw_smiles TEXT NOT NULL UNIQUE,molecule_id INTEGER REFERENCES molecule,valid INTEGER NOT NULL);
CREATE TABLE route(id INTEGER PRIMARY KEY,source_array_index INTEGER NOT NULL UNIQUE,patent_id INTEGER REFERENCES patent,root_structure_id INTEGER NOT NULL REFERENCES structure,root_molecule_id INTEGER REFERENCES molecule,root_reaction_source_id TEXT);
CREATE TABLE route_target(patent_id INTEGER NOT NULL REFERENCES patent,molecule_id INTEGER NOT NULL REFERENCES molecule,PRIMARY KEY(patent_id,molecule_id)) WITHOUT ROWID;
CREATE TABLE reaction(id INTEGER PRIMARY KEY,source_reaction_id TEXT NOT NULL UNIQUE,source_patent_key TEXT,first_source_array_index INTEGER NOT NULL,missing_source_id INTEGER NOT NULL);
CREATE TABLE reaction_metadata_variant(reaction_id INTEGER NOT NULL REFERENCES reaction,metadata_sha256 TEXT NOT NULL,reaction_hash TEXT,first_source_array_index INTEGER NOT NULL,PRIMARY KEY(reaction_id,metadata_sha256)) WITHOUT ROWID;
CREATE TABLE route_reaction(route_id INTEGER NOT NULL REFERENCES route,reaction_id INTEGER NOT NULL REFERENCES reaction,PRIMARY KEY(route_id,reaction_id)) WITHOUT ROWID;
CREATE TABLE route_molecule(route_id INTEGER NOT NULL REFERENCES route,molecule_id INTEGER NOT NULL REFERENCES molecule,role_bits INTEGER NOT NULL,PRIMARY KEY(route_id,molecule_id)) WITHOUT ROWID;
CREATE TABLE reaction_member(route_id INTEGER NOT NULL REFERENCES route,reaction_id INTEGER NOT NULL REFERENCES reaction,structure_id INTEGER NOT NULL REFERENCES structure,direction INTEGER NOT NULL CHECK(direction IN (0,1)),PRIMARY KEY(route_id,reaction_id,structure_id,direction)) WITHOUT ROWID;
CREATE TABLE target(id INTEGER PRIMARY KEY,identity_sha256 TEXT NOT NULL UNIQUE,name TEXT NOT NULL,organism TEXT NOT NULL,chain_count TEXT NOT NULL,chain_identity_json TEXT NOT NULL);
CREATE TABLE assay_context(id INTEGER PRIMARY KEY,identity_sha256 TEXT NOT NULL UNIQUE,patent_id INTEGER REFERENCES patent,target_id INTEGER NOT NULL REFERENCES target,curation_source TEXT NOT NULL,entry_doi TEXT NOT NULL,article_doi TEXT NOT NULL,pubchem_aid TEXT NOT NULL,ph TEXT NOT NULL,temperature_c TEXT NOT NULL);
CREATE TABLE compound_label(id INTEGER PRIMARY KEY,identity_sha256 TEXT NOT NULL UNIQUE,monomer_id TEXT NOT NULL,ligand_name TEXT NOT NULL);
CREATE TABLE bindingdb_row(id INTEGER PRIMARY KEY,source_data_row INTEGER NOT NULL UNIQUE,reactant_set_id TEXT NOT NULL,context_id INTEGER NOT NULL REFERENCES assay_context,structure_id INTEGER NOT NULL REFERENCES structure,reported_inchikey TEXT NOT NULL,label_id INTEGER NOT NULL REFERENCES compound_label,identity_status TEXT NOT NULL);
CREATE TABLE bindingdb_row_qc(row_id INTEGER PRIMARY KEY REFERENCES bindingdb_row,issue TEXT NOT NULL,source_field_count INTEGER NOT NULL);
CREATE TABLE endpoint(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,unit TEXT NOT NULL);
CREATE TABLE measurement(row_id INTEGER NOT NULL REFERENCES bindingdb_row,endpoint_id INTEGER NOT NULL REFERENCES endpoint,raw_value TEXT NOT NULL,relation TEXT NOT NULL,value REAL,is_positive_exact INTEGER NOT NULL,PRIMARY KEY(row_id,endpoint_id)) WITHOUT ROWID;
'''

class Builder:
    def __init__(self,args):
        self.args=args;self.path=args.database
        if self.path.exists():raise FileExistsError('Choose a fresh database path; existing corpora are never overwritten')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(self.path)
        self.db.execute('PRAGMA page_size=4096')
        self.db.execute('PRAGMA journal_mode=MEMORY');self.db.execute('PRAGMA synchronous=NORMAL')
        self.db.execute('PRAGMA temp_store=MEMORY');self.db.execute('PRAGMA cache_size=-50000')
        self.db.executescript(SCHEMA)
        self.counts=collections.Counter();self.started=time.monotonic()
        self.setmeta('build_version',VERSION);self.setmeta('status','building')
        self.setmeta('build_id',str(uuid.uuid4()))
        self.setmeta('runtime_versions',dict(python=platform.python_version(),sqlite=sqlite3.sqlite_version,rdkit=rdkit.__version__,ijson=ijson.__version__))
        self.setmeta('scope','Complete provided archives; legacy103 is a tag, not an inclusion criterion')
        self.setmeta('role_bits',{'root':1,'prepared_in_this_tree':2,'leaf_input_in_this_tree':4})
        self.setmeta('identity_policy','Reported versus RDKit-derived Standard InChIKey checked explicitly. No additional salt stripping, tautomer normalization or stereo relaxation beyond Standard InChI identity. No fuzzy target matching or patent-family inference. Canonical SMILES is a stored representative; raw provided variants remain in structure.')
        for sid,kind,path in [(1,'routes',args.routes),(2,'bindingdb',args.bindingdb)]:
            self.db.execute('INSERT INTO source VALUES(?,?,?,?,?)',(sid,kind,str(path.resolve()),digest(path),path.stat().st_size))
        for i,(_,name,unit) in enumerate(ENDPOINTS,1):self.db.execute('INSERT INTO endpoint VALUES(?,?,?)',(i,name,unit))
        self.db.commit()

    def setmeta(self,key,value):self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)',(key,json.dumps(value)))
    def checkpoint(self,stage,rows):
        self.setmeta('progress',dict(stage=stage,rows=rows,elapsed_seconds=round(time.monotonic()-self.started,1)))
        self.db.commit()
        free=shutil.disk_usage(self.path.parent).free
        log(stage,rows=rows,database_MB=round(self.path.stat().st_size/1e6,1),free_disk_MB=round(free/1e6),elapsed_seconds=round(time.monotonic()-self.started,1))
        if free<450*2**20:raise RuntimeError('Stopped safely with preserved partial database: less than 450 MiB free disk space')

    @functools.lru_cache(maxsize=100000)
    def patent(self,raw,sid):
        key=patent_key(raw)
        if not key:return None
        self.db.execute('INSERT OR IGNORE INTO patent(patent_key) VALUES(?)',(key,))
        pid=self.db.execute('SELECT id FROM patent WHERE patent_key=?',(key,)).fetchone()[0]
        self.db.execute('INSERT OR IGNORE INTO patent_alias VALUES(?,?,?)',(sid,raw,pid))
        return pid

    @functools.lru_cache(maxsize=160000)
    def structure(self,smiles):
        old=self.db.execute('SELECT s.id,s.molecule_id,m.inchikey FROM structure s LEFT JOIN molecule m ON m.id=s.molecule_id WHERE raw_smiles=?',(smiles,)).fetchone()
        if old:return old
        m=Chem.MolFromSmiles(smiles)
        key=Chem.MolToInchiKey(m) if m is not None else None
        mid=None
        if key:
            self.db.execute('INSERT OR IGNORE INTO molecule(inchikey,canonical_smiles,heavy_atoms,rings) VALUES(?,?,?,?)',
                (key,Chem.MolToSmiles(m),m.GetNumHeavyAtoms(),m.GetRingInfo().NumRings()))
            mid=self.db.execute('SELECT id FROM molecule WHERE inchikey=?',(key,)).fetchone()[0]
        else:self.counts['invalid_structure_variants']+=1
        cur=self.db.execute('INSERT INTO structure(raw_smiles,molecule_id,valid) VALUES(?,?,?)',(smiles,mid,int(bool(key))))
        return cur.lastrowid,mid,key

    @functools.lru_cache(maxsize=100000)
    def reaction(self,source_id,meta_hash,reaction_hash,index,missing):
        self.db.execute('INSERT OR IGNORE INTO reaction(source_reaction_id,source_patent_key,first_source_array_index,missing_source_id) VALUES(?,?,?,?)',
            (source_id,patent_key(source_id.split(';')[0]) if not missing else None,index,int(missing)))
        rid=self.db.execute('SELECT id FROM reaction WHERE source_reaction_id=?',(source_id,)).fetchone()[0]
        self.db.execute('INSERT OR IGNORE INTO reaction_metadata_variant VALUES(?,?,?,?)',(rid,meta_hash,reaction_hash,index))
        return rid

    def ingest_routes(self):
        with gzip.open(self.args.routes,'rb') as f:
            for index,tree in enumerate(ijson.items(f,'item',use_float=True)):
                rid=index+1;children=tree.get('children',[])
                source_id=children[0].get('metadata',{}).get('ID','') if children else ''
                raw_pat=source_id.split(';')[0] if source_id else ''
                pid=self.patent(raw_pat,1)
                sid,mid,_=self.structure(tree.get('smiles',''))
                self.db.execute('INSERT INTO route VALUES(?,?,?,?,?,?)',(rid,index,pid,sid,mid,source_id or None))
                if mid and pid:self.db.execute('INSERT OR IGNORE INTO route_target VALUES(?,?)',(pid,mid))
                members={};rxns=set();edges=set()
                def walk(node,path,isroot=False):
                    st,mo,_=self.structure(node.get('smiles',''));kids=node.get('children',[])
                    if mo:members[mo]=members.get(mo,0)|(1 if isroot else 0)|(2 if kids else 4)
                    for j,rx in enumerate(kids):
                        meta=rx.get('metadata',{});sr=meta.get('ID','')
                        missing=not bool(sr)
                        if missing:sr=f'missing:{index}:{path}:{j}'
                        rxid=self.reaction(sr,signature(meta),meta.get('reaction_hash',''),index,missing)
                        rxns.add(rxid);edges.add((rid,rxid,st,0))
                        for k,ch in enumerate(rx.get('children',[])):
                            cs=walk(ch,f'{path}.{j}.{k}')
                            edges.add((rid,rxid,cs,1))
                    return st
                walk(tree,'0',True)
                self.db.executemany('INSERT INTO route_molecule VALUES(?,?,?)',((rid,m,bits) for m,bits in members.items()))
                self.db.executemany('INSERT INTO route_reaction VALUES(?,?)',((rid,r) for r in rxns))
                self.db.executemany('INSERT INTO reaction_member VALUES(?,?,?,?)',edges)
                self.counts['route_trees']+=1
                if pid is None:self.counts['routes_unassigned_patent']+=1
                if rid%10000==0:self.checkpoint('routes',rid)
        self.checkpoint('routes_complete',self.counts['route_trees'])
        # Keep shared cache bounded before the second source is read.
        self.reaction.cache_clear()

    @functools.lru_cache(maxsize=100000)
    def target(self,name,organism,chain_count,chain_json):
        sig=signature([name,organism,chain_count,chain_json])
        self.db.execute('INSERT OR IGNORE INTO target(identity_sha256,name,organism,chain_count,chain_identity_json) VALUES(?,?,?,?,?)',(sig,name,organism,chain_count,chain_json))
        return self.db.execute('SELECT id FROM target WHERE identity_sha256=?',(sig,)).fetchone()[0]

    @functools.lru_cache(maxsize=150000)
    def context(self,pid,tid,curation,entry,article,aid,ph,temp):
        vals=(pid,tid,curation,entry,article,aid,ph,temp);sig=signature(vals)
        self.db.execute('INSERT OR IGNORE INTO assay_context VALUES(NULL,?,?,?,?,?,?,?,?,?)',(sig,*vals))
        return self.db.execute('SELECT id FROM assay_context WHERE identity_sha256=?',(sig,)).fetchone()[0]

    @functools.lru_cache(maxsize=100000)
    def label(self,monomer,name):
        sig=signature([monomer,name])
        self.db.execute('INSERT OR IGNORE INTO compound_label VALUES(NULL,?,?,?)',(sig,monomer,name))
        return self.db.execute('SELECT id FROM compound_label WHERE identity_sha256=?',(sig,)).fetchone()[0]

    def ingest_bindingdb(self):
        with zipfile.ZipFile(self.args.bindingdb) as z:
            names=[n for n in z.namelist() if n.endswith('.tsv')]
            if len(names)!=1:raise ValueError('Expected exactly one TSV member')
            with z.open(names[0]) as binary:
                stream=io.TextIOWrapper(binary,encoding='utf-8-sig',newline='')
                reader=csv.reader(stream,delimiter='\t');header=next(reader)
                idx={name:i for i,name in enumerate(header)}
                chain_fields=[]
                for j,name in enumerate(header):
                    ma=re.fullmatch(r'BindingDB Target Chain Sequence (\d+)',name)
                    if ma:
                        n=int(ma[1]);chain_fields.append((n,j,idx.get(f'UniProt (SwissProt) Primary ID of Target Chain {n}'),idx.get(f'UniProt (TrEMBL) Primary ID of Target Chain {n}')))
                self.setmeta('bindingdb_header',header)
                sequence_hash_cache={}
                for number,row in enumerate(reader,1):
                    if len(row)!=len(header):self.counts['bindingdb_variable_width_rows']+=1
                    def get(name):
                        i=idx[name];return row[i].strip() if i<len(row) else ''
                    pid=self.patent(get('Patent Number'),2)
                    sid,mid,derived=self.structure(get('Ligand SMILES'));reported=get('Ligand InChI Key')
                    status='match' if derived and reported==derived else ('invalid_smiles' if not derived else ('missing_reported_key' if not reported else 'key_mismatch'))
                    self.counts['bindingdb_identity_'+status]+=1
                    chains=[]
                    for n,j,sw,tr in chain_fields:
                        seq=row[j].strip() if j<len(row) else ''
                        swi=row[sw].strip() if sw is not None and sw<len(row) else ''
                        tri=row[tr].strip() if tr is not None and tr<len(row) else ''
                        if seq or swi or tri:
                            if seq and seq not in sequence_hash_cache:sequence_hash_cache[seq]=hashlib.sha256(seq.encode()).hexdigest()
                            chains.append((n,sequence_hash_cache.get(seq,''),swi,tri))
                    tid=self.target(get('Target Name'),get('Target Source Organism According to Curator or DataSource'),get('Number of Protein Chains in Target (>1 implies a multichain complex)'),json.dumps(chains,separators=(',',':')))
                    cid=self.context(pid,tid,get('Curation/DataSource'),get('BindingDB Entry DOI'),get('Article DOI'),get('PubChem AID'),get('pH'),get('Temp (C)'))
                    lid=self.label(get('BindingDB MonomerID'),get('BindingDB Ligand Name'))
                    self.db.execute('INSERT INTO bindingdb_row VALUES(?,?,?,?,?,?,?,?)',(number,number,get('BindingDB Reactant_set_id'),cid,sid,reported,lid,status))
                    if len(row)!=len(header):self.db.execute('INSERT INTO bindingdb_row_qc VALUES(?,?,?)',(number,'malformed_source_field_count',len(row)))
                    for ep,(column,_,_) in enumerate(ENDPOINTS,1):
                        value=get(column)
                        if not value:continue
                        ma=NUM.fullmatch(value);rel='unparsed';num=None;usable=0
                        if ma:
                            rel={'':'eq','=':'eq','>':'gt','<':'lt','>=':'ge','<=':'le','≥':'ge','≤':'le','~':'approx','≈':'approx'}[ma['op'] or '']
                            num=float(ma['num'])
                            if not math.isfinite(num):num=None
                            usable=int(rel=='eq' and num is not None and num>0)
                        self.db.execute('INSERT INTO measurement VALUES(?,?,?,?,?,?)',(number,ep,value,rel,num,usable))
                        self.counts['measurement_'+rel]+=1
                    self.counts['bindingdb_rows']+=1
                    if number%25000==0:self.checkpoint('bindingdb',number)
        self.checkpoint('bindingdb_complete',self.counts['bindingdb_rows'])

    def finish(self):
        for sql in [
            'CREATE INDEX route_patent ON route(patent_id)',
            'CREATE INDEX route_molecule_reverse ON route_molecule(molecule_id,route_id)',
            'CREATE INDEX reaction_member_reaction ON reaction_member(reaction_id,route_id)',
            'CREATE INDEX structure_molecule ON structure(molecule_id)',
            'CREATE INDEX context_patent_target ON assay_context(patent_id,target_id)',
            'CREATE INDEX row_context ON bindingdb_row(context_id)',
            'CREATE INDEX row_structure ON bindingdb_row(structure_id)',
            'CREATE INDEX row_reported_key ON bindingdb_row(reported_inchikey)',
        ]:self.db.execute(sql)
        self.checkpoint('indexes_complete',self.counts['bindingdb_rows'])
        # The legacy cohort is an annotation only.
        if self.args.legacy_graphs:
            with gzip.open(self.args.legacy_graphs,'rt') as f:
                for g in json.load(f):
                    pid=self.patent(g['id'],1)
                    self.db.execute('INSERT OR IGNORE INTO cohort VALUES(?,?)',('legacy103',pid))
        self.db.executescript('''
CREATE VIEW v_observation AS
 SELECT p.patent_key,p.id patent_id,t.id target_id,t.name target_name,t.organism,c.id context_id,
        e.name endpoint,e.unit,b.id source_row,b.reactant_set_id,b.reported_inchikey,b.identity_status,
        m.id molecule_id,m.inchikey derived_inchikey,m.canonical_smiles,o.raw_value,o.relation,o.value,o.is_positive_exact,
        EXISTS(SELECT 1 FROM route_target rt WHERE rt.patent_id=c.patent_id AND rt.molecule_id=s.molecule_id) route_terminal_match
 FROM measurement o JOIN bindingdb_row b ON b.id=o.row_id JOIN assay_context c ON c.id=b.context_id
 JOIN target t ON t.id=c.target_id JOIN endpoint e ON e.id=o.endpoint_id LEFT JOIN patent p ON p.id=c.patent_id
 JOIN structure s ON s.id=b.structure_id LEFT JOIN molecule m ON m.id=s.molecule_id;
CREATE VIEW v_activity_context_summary AS
 SELECT patent_id,target_id,context_id,endpoint,molecule_id,derived_inchikey,
        COUNT(*) numeric_count,MIN(value) minimum_nM,MAX(value) maximum_nM,
        MAX(value)/MIN(value) repeat_spread,
        CASE WHEN MAX(value)/MIN(value)<=10 THEN 1 ELSE 0 END repeat_quality_pass
 FROM v_observation
 WHERE identity_status='match' AND is_positive_exact=1 AND unit='nM'
 GROUP BY patent_id,target_id,context_id,endpoint,molecule_id;
CREATE VIEW v_patent_reaction_edge AS
 SELECT DISTINCT r.patent_id,rm.reaction_id,s.molecule_id,rm.direction
 FROM reaction_member rm JOIN route r ON r.id=rm.route_id JOIN structure s ON s.id=rm.structure_id
 WHERE r.patent_id IS NOT NULL AND s.molecule_id IS NOT NULL;
CREATE VIEW v_identity_quality AS
 SELECT b.id source_row,b.identity_status,
 CASE WHEN b.identity_status='key_mismatch' AND substr(b.reported_inchikey,1,14)=substr(m.inchikey,1,14)
 THEN 'same_connectivity_block' WHEN b.identity_status='key_mismatch' THEN 'different_connectivity_block'
 ELSE b.identity_status END identity_detail,b.reported_inchikey,m.inchikey derived_inchikey
 FROM bindingdb_row b JOIN structure s ON s.id=b.structure_id LEFT JOIN molecule m ON m.id=s.molecule_id;
CREATE TABLE patent_coverage AS
WITH rc AS (SELECT patent_id,COUNT(*) route_trees FROM route GROUP BY patent_id),
tc AS (SELECT patent_id,COUNT(*) route_targets FROM route_target GROUP BY patent_id),
bc AS (SELECT c.patent_id,COUNT(*) assay_rows,COUNT(DISTINCT c.target_id) target_identities,
              SUM(b.identity_status='match') identity_checked_rows
       FROM bindingdb_row b JOIN assay_context c ON c.id=b.context_id GROUP BY c.patent_id),
mc AS (SELECT c.patent_id,COUNT(DISTINCT s.molecule_id) exact_numeric_route_targets,
              COUNT(DISTINCT c.target_id||':'||o.endpoint_id) matched_target_endpoint_groups
       FROM bindingdb_row b JOIN assay_context c ON c.id=b.context_id JOIN structure s ON s.id=b.structure_id
       JOIN route_target rt ON rt.patent_id=c.patent_id AND rt.molecule_id=s.molecule_id
       JOIN measurement o ON o.row_id=b.id JOIN endpoint e ON e.id=o.endpoint_id
       WHERE b.identity_status='match' AND o.is_positive_exact=1 AND e.unit='nM' GROUP BY c.patent_id)
SELECT p.id patent_id,p.patent_key,COALESCE(rc.route_trees,0) route_trees,COALESCE(tc.route_targets,0) route_targets,
       COALESCE(bc.assay_rows,0) assay_rows,COALESCE(bc.target_identities,0) target_identities,
       COALESCE(bc.identity_checked_rows,0) identity_checked_rows,
       COALESCE(mc.exact_numeric_route_targets,0) exact_numeric_route_targets,
       COALESCE(mc.matched_target_endpoint_groups,0) matched_target_endpoint_groups,
       EXISTS(SELECT 1 FROM cohort cc WHERE cc.patent_id=p.id AND cc.name='legacy103') legacy103
FROM patent p LEFT JOIN rc ON rc.patent_id=p.id LEFT JOIN tc ON tc.patent_id=p.id
 LEFT JOIN bc ON bc.patent_id=p.id LEFT JOIN mc ON mc.patent_id=p.id;
CREATE UNIQUE INDEX coverage_patent ON patent_coverage(patent_id);
''')
        self.setmeta('counts',dict(self.counts));self.setmeta('status','complete')
        self.setmeta('analysis_boundaries',{
            'assay_context':'Preserves target name, organism, chain sequence hashes and UniProt IDs, patent, data source/DOIs, PubChem AID, pH and temperature. Equal metadata does not prove equal experimental protocol.',
            'raw_values':'All endpoints and qualifiers retained. No censor imputation. Positive exact values are flagged, never substituted for censored observations.',
            'aggregation':'Context summary stores count/min/max and repeat spread. It does not pool targets, endpoints or contexts, and does not assume an activity mean or a median.',
            'routes':'Full source trees retained through source archive hash plus source array index, route membership and reaction IO. Source leaves are recorded boundaries, not verified commercial availability.',
            'future_derivatives':'R-group mappings, matched squares, commitment classification and cost policies are versioned analyses, not inferred facts in this base database.'})
        self.db.commit()
        self.db.execute('ANALYZE');self.db.commit()
        self.checkpoint('complete',self.counts['bindingdb_rows'])
        receipt=dict(version=VERSION,database=str(self.path.resolve()),counts=dict(self.counts),elapsed_seconds=round(time.monotonic()-self.started,1),database_bytes=self.path.stat().st_size,
            coverage=dict(zip(['patents','route_patents','assay_patents','both_sources','exact_numeric_overlap_patents','legacy103'],self.db.execute('SELECT COUNT(*),SUM(route_trees>0),SUM(assay_rows>0),SUM(route_trees>0 AND assay_rows>0),SUM(exact_numeric_route_targets>0),SUM(legacy103) FROM patent_coverage').fetchone())))
        self.db.close()
        self.args.receipt.write_text(json.dumps(receipt,indent=2)+'\n');log('build_complete',**receipt)

def main():
    p=argparse.ArgumentParser();p.add_argument('--routes',type=Path,required=True);p.add_argument('--bindingdb',type=Path,required=True)
    p.add_argument('--legacy-graphs',type=Path,help='optional historical cohort annotation');p.add_argument('--database',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True)
    a=p.parse_args();b=Builder(a)
    try:b.ingest_routes();b.ingest_bindingdb();b.finish()
    except BaseException as e:
        try:b.setmeta('status','failed');b.setmeta('failure',repr(e));b.db.commit();b.db.close()
        except Exception:pass
        raise

if __name__=='__main__':main()
