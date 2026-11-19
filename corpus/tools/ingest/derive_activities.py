#!/usr/bin/env python3
"""Create a context-specific numeric activity cache without cohort selection.

The two middle nM measurements are arithmetic-averaged for an even sample.
Every activity retains the raw-row count, range and repeat-quality flag.
Positive exact measurements with a checked reported/derived identity only.
"""
import argparse,json,sqlite3,time,shutil
from pathlib import Path

SQL='''
CREATE TABLE compound_activity AS
WITH ranked AS (
 SELECT c.patent_id,c.target_id,c.id context_id,o.endpoint_id,s.molecule_id,o.value,
        ROW_NUMBER() OVER(PARTITION BY c.id,o.endpoint_id,s.molecule_id ORDER BY o.value,b.id) rn,
        COUNT(*) OVER(PARTITION BY c.id,o.endpoint_id,s.molecule_id) n
 FROM measurement o JOIN bindingdb_row b ON b.id=o.row_id JOIN assay_context c ON c.id=b.context_id
 JOIN structure s ON s.id=b.structure_id JOIN endpoint e ON e.id=o.endpoint_id
 WHERE b.identity_status='match' AND o.is_positive_exact=1 AND e.unit='nM'
 AND NOT EXISTS(SELECT 1 FROM bindingdb_row_qc q WHERE q.row_id=b.id)
)
SELECT patent_id,target_id,context_id,endpoint_id,molecule_id,COUNT(*) numeric_count,
       AVG(CASE WHEN rn IN ((n+1)/2,(n+2)/2) THEN value END) median_nM,
       MIN(value) minimum_nM,MAX(value) maximum_nM,MAX(value)/MIN(value) repeat_spread,
       CASE WHEN MAX(value)/MIN(value)<=10 THEN 1 ELSE 0 END repeat_quality_pass
FROM ranked GROUP BY context_id,endpoint_id,molecule_id;
CREATE UNIQUE INDEX compound_activity_key ON compound_activity(context_id,endpoint_id,molecule_id);
CREATE INDEX compound_activity_patent ON compound_activity(patent_id,target_id,endpoint_id);
CREATE VIEW v_usable_activity AS
 SELECT a.*,p.patent_key,t.name target_name,t.organism,e.name endpoint,m.inchikey,m.canonical_smiles,
        EXISTS(SELECT 1 FROM route_target rt WHERE rt.patent_id=a.patent_id AND rt.molecule_id=a.molecule_id) route_terminal_match
 FROM compound_activity a JOIN patent p ON p.id=a.patent_id JOIN target t ON t.id=a.target_id
 JOIN endpoint e ON e.id=a.endpoint_id JOIN molecule m ON m.id=a.molecule_id
 WHERE a.repeat_quality_pass=1;
'''

def main():
    p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);a=p.parse_args()
    db=sqlite3.connect(a.database);db.execute('PRAGMA temp_store=MEMORY');db.execute('PRAGMA journal_mode=MEMORY')
    if db.execute("SELECT 1 FROM sqlite_master WHERE name='compound_activity'").fetchone():raise SystemExit('Activity cache already exists; use a versioned new derivation instead of overwriting')
    start=time.monotonic();db.executescript(SQL)
    counts=dict(zip(['activity_groups','repeat_quality_pass','repeat_quality_fail'],db.execute('SELECT COUNT(*),SUM(repeat_quality_pass),SUM(NOT repeat_quality_pass) FROM compound_activity').fetchone()))
    db.execute('INSERT INTO metadata VALUES(?,?)',('activity_derivation',json.dumps(dict(version='context-median-1.0',positive_exact_only=True,checked_identity_only=True,repeat_spread_cutoff=10,aggregation='median of numeric nM within exact metadata context',counts=counts))))
    db.commit();db.close();receipt=dict(**counts,elapsed_seconds=round(time.monotonic()-start,2))
    a.receipt.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)

if __name__=='__main__':main()
