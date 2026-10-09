"""Prevent expression work from replacing the source Girl artwork."""
from pathlib import Path
import xml.etree.ElementTree as E

root = Path(__file__).resolve().parents[1]
source = E.parse(root / 'rive-girl/source/original.xml').getroot()
result = E.parse(root / 'rive-girl/scene.rml').getroot()
original = {e.get('id'): e for e in source.iter()}
current = {e.get('id'): e for e in result.iter()}
shapes = {e.get('id') for e in source.iter('Shape')}
assert shapes == {e.get('id') for e in result.iter('Shape')}, 'Original shapes were replaced or new artwork was added'
checked = 0
for id, element in original.items():
    if element.tag.endswith('Vertex') or element.tag in ['PointsPath', 'Fill', 'Stroke', 'SolidColor', 'LinearGradient', 'GradientStop', 'Skin', 'Tendon', 'Weight', 'CubicWeight']:
        assert id in current and current[id].tag == element.tag, f'Missing source artwork {id}'
        assert element.attrib == current[id].attrib, f'Changed source artwork geometry/style {id}'
        checked += 1
print(f'Girl artwork intact: {len(shapes)} original shapes, {checked} geometry/style/skin components')
