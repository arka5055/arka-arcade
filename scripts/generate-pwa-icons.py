from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
source = project / 'assets' / 'images' / 'icon.png'
target = project / 'public' / 'icons'
target.mkdir(parents=True, exist_ok=True)

image = Image.open(source).convert('RGBA')
for size in (180, 192, 512):
    rendered = image.resize((size, size), Image.Resampling.LANCZOS)
    rendered.save(target / f'skyline-{size}.png', optimize=True)

print('Generated PWA icons:', ', '.join(str(target / f'skyline-{size}.png') for size in (180, 192, 512)))
