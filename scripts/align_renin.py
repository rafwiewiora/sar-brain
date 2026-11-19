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

# Example 1, step 5 of US8580813B2. Hold each reactant in the product's pose.
i5 = molecules["m_3ce6dce6f7fc"]
acid = Chem.MolFromSmiles("O=C(O)c1c(Cl)n(-c2ccccc2)c2cccnc12")
amine = Chem.MolFromSmiles("CC(C)(C)OC(=O)N1CCNCC1")
for reagent, pattern in [(acid, Chem.MolFromSmarts("O=Cc1c(Cl)n(-c2ccccc2)c2cccnc12")), (amine, amine)]:
    product_atoms = i5.GetSubstructMatch(pattern)
    reagent_atoms = reagent.GetSubstructMatch(pattern)
    assert product_atoms and reagent_atoms
    rdDepictor.GenerateDepictionMatching2DStructure(reagent, i5, list(zip(product_atoms, reagent_atoms)))

# Trace the retained fragment on both sides. A second color identifies the joining bond.
added = (.68, .91, .83)
removed = (.99, .84, .77)
formed = (.70, .55, .93)
def draw_change(drawer, mol, colors, new_bond=None):
    bond_colors = {bond.GetIdx(): colors[bond.GetBeginAtomIdx()] for bond in mol.GetBonds()
                   if bond.GetBeginAtomIdx() in colors and colors.get(bond.GetEndAtomIdx()) == colors[bond.GetBeginAtomIdx()]}
    if new_bond is not None:
        bond_colors[new_bond] = formed
    drawer.DrawMolecule(mol, highlightAtoms=list(colors), highlightBonds=list(bond_colors),
                        highlightAtomColors=colors, highlightBondColors=bond_colors)

def joining_bond(mol, fragment):
    crossing = [b.GetIdx() for b in mol.GetBonds()
                if (b.GetBeginAtomIdx() in fragment) != (b.GetEndAtomIdx() in fragment)]
    assert len(crossing) == 1
    return crossing[0]

species = []
for mol, center, available in [(acid,115,210),(amine,337,175),(i5,787,346)]:
    drawer = rdMolDraw2D.MolDraw2DSVG(width,height)
    drawer.drawOptions().clearBackground = False
    drawer.SetScale(width,height,lo,hi)
    fragment = set(mol.GetSubstructMatch(amine)) if mol is not acid else set()
    if mol is not acid:
        assert len(fragment) == amine.GetNumAtoms()
    bond = joining_bond(mol, fragment) if mol is i5 else None
    draw_change(drawer, mol, dict.fromkeys(fragment, added), bond)
    drawer.FinishDrawing()
    points = [drawer.GetDrawCoords(i) for i in range(mol.GetNumAtoms())]
    x,y = min(p.x for p in points)-15,min(p.y for p in points)-15
    w,h = max(p.x for p in points)+15-x,max(p.y for p in points)+15-y
    paths = drawer.GetDrawingText().split("<!-- END OF HEADER -->")[1].split("</svg>")[0]
    species.append((center,available,x,y,w,h,paths))
scale = min(min(available/w,166/h) for _,available,_,_,w,h,_ in species)
scheme = ['<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Azaindole acid and Boc-piperazine couple to form I5" viewBox="0 0 968 216">']
for center,_,x,y,w,h,paths in species:
    scheme.append(f'<svg x="{center-w*scale/2:.2f}" y="{89-h*scale/2:.2f}" width="{w*scale:.2f}" height="{h*scale:.2f}" viewBox="{x} {y} {w} {h}">{paths}</svg>')
scheme.append('<g font-family="system-ui,sans-serif" text-anchor="middle" fill="#20364d"><text x="231" y="95" font-size="25">+</text><path d="M437 88H597l-9 -6m9 6-9 6" fill="none" stroke="#6743ae" stroke-width="2.5"/>')
for y,text in [(51,"1. TOTU, NMM"),(73,"DMF, rt, 30 min"),(120,"2. Add Boc-piperazine"),(141,"stir overnight")]:
    scheme.append(f'<text x="517" y="{y}" font-size="15">{text}</text>')
for x,text in [(115,"Azaindole acid"),(337,"Boc-piperazine"),(787,"I5 · azaindole chloride")]:
    scheme.append(f'<text x="{x}" y="194" font-weight="650" font-size="19">{text}</text>')
scheme.append('</g></svg>')
(ROOT/"src"/"renin-i5-step.svg").write_text("".join(scheme))

# The following slide compares the two endpoints of the recorded two-operation route.
analog = next(molecules[key] for key,p in board["products"].items() if p["name"]=="CPD 121")
comparison_mols = [i5]+[molecules[k] for k,p in board["products"].items() if p["name"] in ("CPD 121","CPD 239","CPD 270")]
extent = [p for mol in comparison_mols for p in mol.GetConformer().GetPositions()]
def comparison_svg(drawer):
    first = drawer.GetDrawCoords(Point2D(min(p[0] for p in extent)-.65, max(p[1] for p in extent)+.6))
    last = drawer.GetDrawCoords(Point2D(max(p[0] for p in extent)+.65, min(p[1] for p in extent)-.6))
    box = f"{first.x:.2f} {first.y:.2f} {last.x-first.x:.2f} {last.y-first.y:.2f}"
    svg = "<svg"+drawer.GetDrawingText().split("<svg",1)[1]
    return svg.replace(f"viewBox='0 0 {width} {height}'", f"viewBox='{box}'")
for label, mol, pattern, color in [
    ("i5-before-reuse", i5, "CC(C)(C)OC(=O)", removed),
    ("121-after-reuse", analog, "Cc1ccccc1[CH2]", added),
]:
    atoms = set(mol.GetSubstructMatch(Chem.MolFromSmarts(pattern)))
    assert atoms
    if mol is i5:
        chlorine, = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum()==17]
        atoms.add(chlorine)
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().clearBackground = False
    drawer.SetScale(width,height,lo,hi)
    draw_change(drawer, mol, dict.fromkeys(atoms,color), joining_bond(mol,atoms) if mol is analog else None)
    drawer.FinishDrawing()
    (ROOT/"src"/("renin-"+label+".svg")).write_text(comparison_svg(drawer))

# Compare the FEP pair in the same phenoxy-ring orientation. Only the
# substituents that differ are highlighted; the shared methyl stays plain.
for number, pattern, color in [
    (239, "Oc1c([Cl:1])cccc1C", removed),
    (270, "Oc1c([CH3:1])c([F:2])ccc1C", added),
]:
    compound = next(molecules[key] for key,p in board["products"].items() if p["name"]==f"CPD {number}")
    query = Chem.MolFromSmarts(pattern)
    match, = compound.GetSubstructMatches(query)
    atoms = {match[a.GetIdx()] for a in query.GetAtoms() if a.GetAtomMapNum()}
    drawer = rdMolDraw2D.MolDraw2DSVG(width,height)
    drawer.drawOptions().clearBackground = False
    drawer.SetScale(width,height,lo,hi)
    draw_change(drawer, compound, dict.fromkeys(atoms,color))
    drawer.FinishDrawing()
    (ROOT/"src"/f"renin-fep-{number}.svg").write_text(comparison_svg(drawer))
