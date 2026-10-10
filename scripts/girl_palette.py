"""Deliberate palette calibration for the Girl rig, shared by generator and guard.

marvin.te's source was authored for a pale lavender web demo. The approved
concept sheet (design/expression-studies/girl/v1.png) uses the same palette
family but with far more contrast: near-indigo pupils inside a saturated violet
iris, warmer pink skin, and an orchid lip instead of a white-washed gradient.

Every entry recolors an ORIGINAL SolidColor/GradientStop component in place.
No geometry, no path, no new artwork — the guard checks that separately.
"""

# component id -> (source colour, calibrated colour, what it paints)
PALETTE = {
    # Eyes: the concept's dark indigo pupil and saturated iris ring. The source
    # pupil was lighter than its own iris, which read as a washed-out dot.
    '1:77':    ('FFCA8EF6', 'FF5C3BEA', 'near iris'),
    '1:96':    ('FF9558C2', 'FF171A85', 'near pupil'),
    '1:177':   ('FFC398E2', 'FF6B4BEE', 'far iris'),
    '1:189':   ('FF9558C2', 'FF1D208F', 'far pupil'),
    '1:1917':  ('FFEBE1F6', 'FFFBF7FF', 'near sclera'),
    '1:3564':  ('FFEBE1F6', 'FFFBF7FF', 'far sclera'),
    # Lashes and brows carry the concept's ink-navy line weight.
    '1:2008':  ('FF2A2AA8', 'FF1B1B88', 'near lash 1'),
    '1:2068':  ('FF2A2AA8', 'FF1B1B88', 'near lash 2'),
    '1:2193':  ('FF2A2AA8', 'FF1B1B88', 'near lash 3'),
    '1:3774':  ('FF2A2AA8', 'FF1B1B88', 'far lash 1'),
    '1:4358':  ('FF2A2AA8', 'FF1B1B88', 'far lash 2'),
    '1:5175':  ('FF2A2AA8', 'FF23219B', 'near brow'),
    '1:5187':  ('FF2A2AA8', 'FF23219B', 'far brow'),
    # Skin: the concept's warm rose instead of the source's cool magenta white.
    '1:6811':  ('FFFFD9FB', 'FFFDDCF3', 'head'),
    '1:16608': ('FFFFD9FB', 'FFFDDCF3', 'body'),
    '1:16594': ('FFFFD9FB', 'FFFDDCF3', 'neck'),
    '1:5040':  ('FFFFD9FB', 'FFFDDCF3', 'nose'),
    '1:6192':  ('FFFFD9FB', 'FFFDDCF3', 'ear'),
    # Hair matches the concept's electric violet exactly.
    '1:16039': ('FF743BFF', 'FF6D36F9', 'hair back'),
    '1:8783':  ('FF743BFF', 'FF6D36F9', 'hair front 1'),
    '1:8814':  ('FF743BFF', 'FF6D36F9', 'hair front 2'),
    '1:16042': ('FFAC7FFA', 'FF9F6FF6', 'hair lighting'),
    # Lips: orchid body with a soft, not white, rim; darker seam.
    '1:5759':  ('FFC074EF', 'FFB36FE8', 'upper lip gradient body'),
    '1:5758':  ('FFFFD7FB', 'FFE7B2F4', 'upper lip gradient rim'),
    '1:5764':  ('FFC074EF', 'FFB36FE8', 'lower lip gradient body'),
    '1:5763':  ('FFFFD7FB', 'FFE7B2F4', 'lower lip gradient rim'),
    '1:5767':  ('FF985CC1', 'FF8346B4', 'mouth seam'),
}
