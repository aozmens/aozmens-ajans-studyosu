"""Google Fonts değişken TTF'lerinden statik ağırlık örnekleri üretir.
Kullanım: python3 scripts/build-fonts.py <kaynak-klasör>
Çıktı: assets/fonts/<Aile>-<ağırlık>.ttf ve assets/fonts/fonts.json
resvg değişken yazı tiplerinde ağırlık eksenini desteklemediği için statik örnekler gerekir."""
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
os.makedirs(OUT, exist_ok=True)

# (dosya, aile adı, tarz notu)
FAMILIES = [
    ('Inter.ttf', 'Inter', 'sans · nötr, modern'),
    ('Montserrat.ttf', 'Montserrat', 'sans · geometrik, güçlü başlık'),
    ('PlusJakartaSans.ttf', 'Plus Jakarta Sans', 'sans · yumuşak, çağdaş'),
    ('SpaceGrotesk.ttf', 'Space Grotesk', 'sans · teknik, grotesk'),
    ('Manrope.ttf', 'Manrope', 'sans · sade, okunaklı'),
    ('Outfit.ttf', 'Outfit', 'sans · geometrik, yuvarlak'),
    ('Sora.ttf', 'Sora', 'sans · fütüristik'),
    ('Syne.ttf', 'Syne', 'display · sanatsal, geniş'),
    ('Unbounded.ttf', 'Unbounded', 'display · iri, oyuncu'),
    ('PlayfairDisplay.ttf', 'Playfair Display', 'serif · lüks, editoryal'),
    ('Fraunces.ttf', 'Fraunces', 'serif · sıcak, karakterli'),
    ('DMSerifDisplay.ttf', 'DM Serif Display', 'serif · zarif başlık (yalnız 400)'),
    ('BebasNeue.ttf', 'Bebas Neue', 'display · dar, büyük harf (yalnız 400)'),
    ('ArchivoBlack.ttf', 'Archivo Black', 'display · çok kalın (yalnız 400)'),
]
WEIGHTS = [300, 400, 500, 600, 700, 800, 900]
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x250)) + list(range(0x2000, 0x2070)) + [0x20AC, 0x20BA, 0x2122, 0x2190, 0x2192, 0x2022, 0x25CF]

def set_names(font, family, weight):
    style = 'Regular' if weight == 400 else str(weight)
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f'{family} {style}', 4, 3, 1, 0x409)
    name.setName(f'{family.replace(" ", "")}-{style}', 6, 3, 1, 0x409)
    font['OS/2'].usWeightClass = weight

def do_subset(font):
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(font)

meta = []
for file, family, note in FAMILIES:
    path = os.path.join(SRC, file)
    base = TTFont(path)
    weights = []
    if 'fvar' in base:
        axes = {a.axisTag: a for a in base['fvar'].axes}
        lo, hi = axes['wght'].minValue, axes['wght'].maxValue
        for w in WEIGHTS:
            if w < lo or w > hi:
                continue
            f = TTFont(path)
            loc = {tag: (w if tag == 'wght' else (0 if tag in ('SOFT', 'WONK') else a.defaultValue)) for tag, a in axes.items()}
            f = instancer.instantiateVariableFont(f, loc)
            set_names(f, family, w)
            do_subset(f)
            out = f'{family.replace(" ", "")}-{w}.ttf'
            f.save(os.path.join(OUT, out))
            weights.append({'weight': w, 'file': out})
    else:
        f = TTFont(path)
        set_names(f, family, 400)
        do_subset(f)
        out = f'{family.replace(" ", "")}-400.ttf'
        f.save(os.path.join(OUT, out))
        weights.append({'weight': 400, 'file': out})
    meta.append({'family': family, 'note': note, 'faces': weights})
    print(family, [x['weight'] for x in weights])

with open(os.path.join(OUT, 'fonts.json'), 'w', encoding='utf-8') as fh:
    json.dump(meta, fh, ensure_ascii=False, indent=1)
