"""Rebuild the frozen RENIN drawings from RetroDMTA SMILES and the recorded intermediate."""
import gzip
import itertools
import json
import math
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import rdCoordGen, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Geometry import Point2D

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
archive = DATA / "RENIN.json.gz"
campaign = json.loads(gzip.decompress(archive.read_bytes()))
board = campaign["boards"]
smiles = json.loads((DATA / "RENIN.structures.json").read_text())
assert set(smiles) == set(board["drawings"])
molecules = {key: Chem.MolFromSmiles(value) for key, value in smiles.items()}
reference = Chem.Mol(molecules[next(k for k,p in board["products"].items() if p["name"] == "CPD 270")])
rdCoordGen.AddCoords(reference)

# Left-hand amide, fused core at the origin, variable aryl group to the right.
core = Chem.MolFromSmarts("O=C(N)c1c([*])n([*])c2[c,n][c,n][c,n][c,n]c12")
anchor = reference.GetSubstructMatch(core)
conf = reference.GetConformer()
points = conf.GetPositions().copy()
# Normalize the template to the bond length used for unconstrained substituents.
points *= 1.5 / (conf.GetAtomPosition(anchor[3])-conf.GetAtomPosition(anchor[4])).Length()
center = points[[anchor[i] for i in (3,4,6,8,9,10,11,12,13)]].mean(axis=0)
phenoxy = reference.GetSubstructMatch(Chem.MolFromSmarts("Oc1ccccc1"))[1:]
piperazine = reference.GetSubstructMatch(Chem.MolFromSmarts("N1CCNCC1"))
axis = points[list(phenoxy)].mean(axis=0) - points[list(piperazine)].mean(axis=0)
angle = math.atan2(axis[1], axis[0])
cos, sin = math.cos(angle), math.sin(angle)
def orient(point):
    x, y, _ = point - center
    return x*cos + y*sin, -x*sin + y*cos
vertical = -1 if orient(points[anchor[7]])[1] > 0 else 1
for i, point in enumerate(points):
    x, y = orient(point)
    conf.SetAtomPosition(i, (x, vertical*y, 0))

# Constrain the largest applicable template on each of the three exit vectors.
queries = []
for amide, side, pendant in itertools.product(
    ("N3CCNCC3", "N"), ("[*]~a3aaaaa3","[*]"), ("-c3ccccc3","[*]")
):
    query = Chem.MolFromSmarts(f"O=C({amide})c1c({side})n({pendant})c2[c,n][c,n][c,n][c,n]c12")
    queries.append((query,reference.GetSubstructMatch(query)))
queries.sort(key=lambda pair: pair[0].GetNumAtoms(), reverse=True)

def decorations(mol, match):
    atoms = set(match)
    return [(i,n.GetAtomicNum()) for i,a in enumerate(match) for n in mol.GetAtomWithIdx(a).GetNeighbors() if n.GetIdx() not in atoms]

for key, mol in molecules.items():
    identity = Chem.MolToSmiles(mol)
    for query, ref_match in queries:
        matches = mol.GetSubstructMatches(query, uniquify=False)
        if matches:
            # Resolve symmetric aryl-ring mappings by preserving substituent positions.
            ref_decor = set(decorations(reference,ref_match))
            def match_score(mapping):
                branches = decorations(mol, mapping)
                # Draw a lone ortho substituent on the exposed side when both mappings agree.
                clearance = sum(conf.GetAtomPosition(ref_match[i]).Length() for i,_ in branches)
                return len(ref_decor.intersection(branches)), clearance
            match = max(matches, key=match_score)
            rdDepictor.GenerateDepictionMatching2DStructure(mol, reference, list(zip(ref_match,match)))
            break
    else:
        raise ValueError(f"No fused core found for {key}")
    current = mol.GetConformer()
    for a,b in zip(anchor,mol.GetSubstructMatch(core)):
        assert (current.GetAtomPosition(b)-conf.GetAtomPosition(a)).Length() < 1e-5, key
    assert identity == Chem.MolToSmiles(mol)

# One camera for the entire series preserves both bond scale and scaffold position.
coords = [p for mol in molecules.values() for p in mol.GetConformer().GetPositions()]
lo = Point2D(min(p[0] for p in coords)-.48, min(p[1] for p in coords)-.48)
hi = Point2D(max(p[0] for p in coords)+.48, max(p[1] for p in coords)+.48)
width = 570
height = round(width * (hi.y-lo.y)/(hi.x-lo.x))
core_pixels = None
product_coords = [p for key in board["products"] for p in molecules[key].GetConformer().GetPositions()]
for key, mol in molecules.items():
    drawer = rdMolDraw2D.MolDraw2DSVG(width,height)
    drawer.drawOptions().clearBackground = False
    drawer.SetScale(width,height,lo,hi)
    drawer.DrawMolecule(mol)
    pixels = [drawer.GetDrawCoords(i) for i in mol.GetSubstructMatch(core)]
    if core_pixels is None:
        core_pixels = pixels
    assert max((p-q).Length() for p,q in zip(core_pixels,pixels)) < .01, key
    drawer.FinishDrawing()
    drawing = drawer.GetDrawingText().split("<svg",1)[1]
    svg = '<svg aria-hidden="true"' + drawing
    if key in board["products"]:
        # The Boc-protected intermediate extends further left than every product.
        # Give the whole product series the same tighter view of the common camera.
        top_left = drawer.GetDrawCoords(Point2D(min(p[0] for p in product_coords)-.9, max(p[1] for p in product_coords)+.8))
        bottom_right = drawer.GetDrawCoords(Point2D(max(p[0] for p in product_coords)+.8, min(p[1] for p in product_coords)-.8))
        box = f"{top_left.x:.2f} {top_left.y:.2f} {bottom_right.x-top_left.x:.2f} {bottom_right.y-top_left.y:.2f}"
        svg = svg.replace(f"viewBox='0 0 {width} {height}'", f"viewBox='{box}'")
        assert f"viewBox='{box}'" in svg
    board["drawings"][key] = svg
    campaign["native"]["molecules"][key]["svg"] = svg
archive.write_bytes(gzip.compress(json.dumps(campaign,separators=(",",":")).encode(),mtime=0))
print(f"{len(molecules)} scaffold-aligned drawings, common frame {width} × {height}")
