"""Prepare aligned candidate structures and highlightable substituents for the offline replay."""
import gzip
import json
import math
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import rdCoordGen, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Geometry import Point2D

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
# The first and last atom in the orientation pair define the horizontal direction.
SERIES = {
    'RENIN': ('O=C(N1CCNCC1)c1c([O,C,S]c2ccccc2)n(-c2ccccc2)c2cccnc12', (2, 11)),
    'S1P1': ('O=C(Na1aaaaa1)c1cc([N,O])ncn1', (12, 3)),
    'ABL1': ('O=C(Nc1ccccc1)c1c[c,n]c(N)c(-a2aaaaa2)c1', (13, 6)),
}

def groups(mol, match):
    """Each external connected fragment belongs to its attachment site(s) on the core."""
    index = {atom: slot for slot, atom in enumerate(match)}
    remaining = set(range(mol.GetNumAtoms())) - index.keys()
    result = {}
    while remaining:
        todo = [remaining.pop()]
        fragment, anchors = [], set()
        while todo:
            atom = todo.pop()
            fragment.append(atom)
            for neighbor in mol.GetAtomWithIdx(atom).GetNeighbors():
                n = neighbor.GetIdx()
                if n in index:
                    anchors.add(index[n])
                elif n in remaining:
                    remaining.remove(n)
                    todo.append(n)
        sites = tuple(sorted(anchors))
        result.setdefault(sites, []).append(fragment)
    return result

def describe(mol, match):
    entries = {}
    for sites, parts in groups(mol, match).items():
        atoms = [atom for part in parts for atom in part]
        connected = atoms + [match[i] for i in sites]
        sig = Chem.MolFragmentToSmiles(mol, atomsToUse=connected, isomericSmiles=True)
        fragment = Chem.MolFragmentToSmiles(mol, atomsToUse=atoms)
        entries[sites] = (sig, atoms, fragment)
    return entries

def assign(mol, query):
    # Prefer the lowest locants, then a consistent orientation for equivalent ring positions.
    choices = []
    for match in mol.GetSubstructMatches(query, uniquify=False):
        entries = describe(mol, match)
        key = (sorted(entries), [entries[k][0] for k in sorted(entries)],
               [mol.GetAtomWithIdx(i).GetAtomicNum() for i in match])
        choices.append((key, match, entries))
    if not choices:
        raise ValueError(Chem.MolToSmiles(mol))
    return min(choices,key=lambda x:x[0])[1:]

def label(series, sites, fragment, signature):
    names = {
        'cCO':'CH₂OH','cOC':'OMe','cCCO':'CH₂CH₂OH','cS(N)(=O)=O':'SO₂NH₂',
        'cS(=O)(=O)NC':'SO₂NHMe','cS(=O)(=O)N(C)C':'SO₂NMe₂','cNS(C)(=O)=O':'NHSO₂Me',
        'cOC(F)(F)F':'OCF₃','cOC(F)(F)Cl':'OCF₂Cl','cSC(F)(F)F':'SCF₃',
        'cSC(F)F':'SCF₂H','cS(F)(F)(F)(F)F':'SF₅','cC(F)(F)C(F)(F)F':'CF₂CF₃',
        'cSC(F)(F)Cl':'SCF₂Cl','cOC(C)(C)C':'O-tert-butyl','cOC(C)(F)F':'OCF₂Me',
        'cOC(F)(F)C(F)(F)F':'OCF₂CF₃','cS(=O)C(F)(F)F':'S(O)CF₃',
        'NC1CCCCC1':'cyclohexyl','NC1CCCC1':'cyclopentyl','NC1CCCCCC1':'cycloheptyl',
        'NCC1CC1':'cyclopropylmethyl','CCCN':'n-propyl','CCN':'ethyl','CN':'methyl','CC(C)N':'isopropyl',
        'COCCN':'2-methoxyethyl','CC(C)CN':'isobutyl','CCC(C)O':'sec-butoxy',
        'OC1CCNC1':'pyrrolidinol','O[C@@H]1CCNC1':'chiral pyrrolidinol','O[C@H]1CCNC1':'chiral pyrrolidinol',
        'OC[C@H]1CCNC1':'hydroxymethylpyrrolidine','OCC1CNC1':'hydroxymethylazetidine',
        'CC1(O)CNC1':'methylazetidinol','C1COCCN1':'morpholine',
    }
    if signature in names:
        return names[signature]
    short = {'C':'Me','F':'F','Cl':'Cl','Br':'Br','O':'OH','C#N':'CN','N':'NH₂'}
    i = sites[0]
    if series == 'RENIN':
        if 12 <= i <= 16:
            return f'{i-10}-{short.get(fragment,fragment)}'
        if i == 10:
            return 'branched linker'
    if series == 'S1P1':
        if i == 12:
            return 'tail substituents'
        return 'head '+short[fragment] if fragment in short else 'head substituent'
    if i == 13:
        return 'amine side chain'
    if 15 <= i <= 20:
        return 'heteroaryl '+short.get(fragment,'substituent')
    return 'anilide '+short.get(fragment,'substituent')

def simple_amine_ring(mol, anchor, part):
    rings=[list(r) for r in mol.GetRingInfo().AtomRings() if anchor in r]
    if len(rings)!=1 or len(rings[0]) not in (4,5,6):
        return None
    ring=rings[0]
    if not set(ring)-{anchor} <= set(part):
        return None
    if any(mol.GetAtomWithIdx(i).GetAtomicNum()!=6 for i in ring if i!=anchor):
        return None
    if any(mol.GetBondBetweenAtoms(i,ring[j-1]).GetBondType()!=Chem.BondType.SINGLE for j,i in enumerate(ring)):
        return None
    # Keep the N at position 1 and give ring substituents the lowest locants.
    idx=ring.index(anchor)
    ring=ring[idx:]+ring[:idx]
    candidates=[]
    for order in [ring,ring[:1]+ring[:0:-1]]:
        subs={}
        for pos,i in enumerate(order[1:],2):
            atoms=[]
            for neighbor in mol.GetAtomWithIdx(i).GetNeighbors():
                n=neighbor.GetIdx()
                if n in order or n in atoms:
                    continue
                todo=[n]
                while todo:
                    x=todo.pop()
                    if x in atoms or x in order:
                        continue
                    atoms.append(x)
                    todo.extend(a.GetIdx() for a in mol.GetAtomWithIdx(x).GetNeighbors())
            if atoms:
                sig=Chem.MolFragmentToSmiles(mol,atomsToUse=atoms+[i],rootedAtAtom=i)
                subs[pos]=(i,atoms,sig)
        candidates.append(((list(subs),[v[2] for v in subs.values()]),order,subs))
    _,order,subs=min(candidates,key=lambda c:c[0])
    return order,subs

def build_series(series):
    board = json.loads(gzip.decompress((DATA / (series+'.json.gz')).read_bytes()))['boards']
    smiles = json.loads((DATA / (series+'.structures.json')).read_text())
    ids = [n for n in board['order'] if series!='RENIN' or n not in board['stock']]
    query = Chem.MolFromSmarts(SERIES[series][0])
    mols = {n:Chem.MolFromSmiles(smiles[n]) for n in ids}
    assignments = {n:assign(mol,query) for n,mol in mols.items()}

    ref_id = next((n for n in ids if series=='RENIN' and board['products'][n]['name']=='CPD 270'),ids[0])
    ref = Chem.Mol(mols[ref_id])
    match = assignments[ref_id][0]
    if series=='RENIN':
        # Use the same winning compound, orientation and bond length as the story slides.
        rdCoordGen.AddCoords(ref)
        conf=ref.GetConformer()
        span=(conf.GetAtomPosition(match[8])-conf.GetAtomPosition(match[9])).Length()
        for i in range(ref.GetNumAtoms()):
            conf.SetAtomPosition(i,conf.GetAtomPosition(i)*(1.5/span))
        def center(slots):
            coords=[conf.GetAtomPosition(match[i]) for i in slots]
            return Point2D(sum(p.x for p in coords)/len(coords),sum(p.y for p in coords)/len(coords))
        left,right=center(range(2,8)),center(range(11,17))
    else:
        rdDepictor.Compute2DCoords(ref)
        conf = ref.GetConformer()
        left,right = [conf.GetAtomPosition(match[k]) for k in SERIES[series][1]]
    angle = math.atan2(right.y-left.y,right.x-left.x)
    for i in range(ref.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        conf.SetAtomPosition(i,(p.x*math.cos(angle)+p.y*math.sin(angle),-p.x*math.sin(angle)+p.y*math.cos(angle),0))
    for n,mol in mols.items():
        rdDepictor.GenerateDepictionMatching2DStructure(mol,ref,list(zip(match,assignments[n][0])))
    points = [p for m in mols.values() for p in m.GetConformer().GetPositions()]
    lo,hi = [Point2D(fn(p[0] for p in points)+pad,fn(p[1] for p in points)+pad) for fn,pad in [(min,-.7),(max,.7)]]
    width=400
    height=round(width*(hi.y-lo.y)/(hi.x-lo.x))
    result={}
    for n,mol in mols.items():
        drawer=rdMolDraw2D.MolDraw2DSVG(width,height)
        drawer.drawOptions().updateAtomPalette({9: (0.04, 0.22, 0.20)})
        drawer.drawOptions().clearBackground=False
        drawer.SetScale(width,height,lo,hi)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        svg='<svg'+drawer.GetDrawingText().split('<svg',1)[1]
        match,entries=assignments[n]
        sites={}
        def add(key,sig,title,atoms,attachments=()):
            area=''
            for bond in mol.GetBonds():
                a,b=bond.GetBeginAtomIdx(),bond.GetEndAtomIdx()
                if (a in atoms and b in [*atoms,*attachments]) or (b in atoms and a in attachments):
                    p,q=drawer.GetDrawCoords(a),drawer.GetDrawCoords(b)
                    area+=f'<path d="M{p.x:.1f} {p.y:.1f}L{q.x:.1f} {q.y:.1f}" stroke-width="9" stroke-linecap="round"/>'
            for atom in atoms:
                p=drawer.GetDrawCoords(atom)
                area+=f'<circle cx="{p.x:.1f}" cy="{p.y:.1f}" r="5.4"/>'
            sites[key]=[sig,title,area]
        for slots,(sig,atoms,frag) in entries.items():
            key='s'+'.'.join(map(str,slots))
            attach=[match[i] for i in slots]
            if (series,slots) in {('S1P1',(12,)),('ABL1',(13,))}:
                seen={}
                for part in groups(mol,match)[slots]:
                    ring=simple_amine_ring(mol,attach[0],part) if series=='ABL1' else None
                    if ring:
                        order,subs=ring
                        ring_name={4:'azetidine',5:'pyrrolidine',6:'piperidine'}[len(order)]
                        add('amineRing',ring_name,ring_name,order)
                        for pos,(atom,side,value) in subs.items():
                            stereo=mol.GetAtomWithIdx(atom)
                            config=stereo.GetProp('_CIPCode') if stereo.HasProp('_CIPCode') else ''
                            group={'CO':'OH','CCO':'CH₂OH','COC':'OMe','CN':'NH₂','CCN':'CH₂NH₂','C(F)F':'F₂'}.get(value,'substituent')
                            add('amineSub'+str(pos),value+'|'+config,f'{pos}-{group}'+(f' ({config})' if config else ''),side,[atom])
                        continue
                    value=Chem.MolFragmentToSmiles(mol,atomsToUse=part+attach)
                    seen[value]=seen.get(value,0)+1
                    add(key+'|'+value+'|'+str(seen[value]),value,label(series,slots,frag,value),part,attach)
            else:
                add(key,sig,label(series,slots,frag,sig),atoms,attach)
        for slot,atom in enumerate(match):
            env=mol.GetAtomWithIdx(atom)
            symbol=env.GetSymbol()
            if series=='RENIN' and slot==10:
                symbol={'C':'CH₂' if env.GetTotalNumHs()==2 else 'CH','O':'O','S':'S'}[symbol]
                title=symbol+' linker'
            else:
                title=('tail ' if series=='S1P1' and slot==12 else 'head ring ' if series=='S1P1' else 'ring ')+symbol
            add('a'+str(slot),symbol,title,[atom])
        result[n]={'svg':svg,'sites':sites}
    # Persist only features which actually vary in this series.
    keys=set().union(*(r['sites'] for r in result.values()))
    fixed={k for k in keys if len({r['sites'].get(k,[''])[0] for r in result.values()})==1}
    for r in result.values():
        for k in fixed:
            r['sites'].pop(k,None)
    return result

if __name__=='__main__':
    out=DATA/'rank-comparison'
    out.mkdir(exist_ok=True)
    for series in SERIES:
        records=build_series(series)
        (out/(series+'.json.gz')).write_bytes(gzip.compress(json.dumps(records,separators=(',',':')).encode(),mtime=0))
        print(series,len(records))
