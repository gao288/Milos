"""Prevent expression work from replacing the source Girl artwork.

Geometry, path ids, shapes and skin bindings must stay byte-identical to the
source snapshot. Colour components may differ only where scripts/girl_palette.py
documents a deliberate recalibration toward the approved concept sheet.
"""
from pathlib import Path
import sys
import xml.etree.ElementTree as E

sys.path.insert(0, str(Path(__file__).resolve().parent))
from girl_palette import PALETTE

root = Path(__file__).resolve().parents[1]
source = E.parse(root / 'rive-girl/source/original.xml').getroot()
result = E.parse(root / 'rive-girl/scene.rml').getroot()
original = {e.get('id'): e for e in source.iter()}
current = {e.get('id'): e for e in result.iter()}
shapes = {e.get('id') for e in source.iter('Shape')}
assert shapes == {e.get('id') for e in result.iter('Shape')}, 'Original shapes were replaced or new artwork was added'
paths = {(e.get('id'), e.tag) for e in source.iter() if e.tag.endswith('Vertex') or e.tag == 'PointsPath'}
assert paths <= {(e.get('id'), e.tag) for e in result.iter()}, 'Original path geometry was replaced'
geometry = recolored = 0
for id, element in original.items():
    if element.tag.endswith('Vertex') or element.tag in ['PointsPath', 'Fill', 'Stroke', 'Skin', 'Tendon', 'Weight', 'CubicWeight']:
        assert id in current and current[id].tag == element.tag, f'Missing source artwork {id}'
        assert element.attrib == current[id].attrib, f'Changed source artwork geometry/style {id}'
        geometry += 1
    elif element.tag in ['SolidColor', 'LinearGradient', 'GradientStop']:
        assert id in current and current[id].tag == element.tag, f'Missing source paint {id}'
        expected = dict(element.attrib)
        if id in PALETTE:
            was, now, _ = PALETTE[id]
            assert expected.get('colorValue') == was, f'Palette entry {id} no longer matches the source colour'
            expected['colorValue'] = now
            recolored += 1
        assert expected == current[id].attrib, f'Undocumented paint change on {id}; add it to scripts/girl_palette.py'
        geometry += 1
unused = set(PALETTE) - set(original)
assert not unused, f'Palette references components that are not in the source: {sorted(unused)}'
print(f'Girl artwork intact: {len(shapes)} original shapes, {geometry} geometry/style/skin components, '
      f'{recolored} documented palette calibrations')
