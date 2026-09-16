from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
source_names = ('crosswind-coast.jpg', 'peak-rush-hour.jpg', 'superstorm-radar.jpg')
public_scenery = project / 'public' / 'scenery'
public_scenery.mkdir(parents=True, exist_ok=True)

for source_name in source_names:
    source = project / 'assets' / 'images' / source_name
    image = Image.open(source).convert('RGB')
    image.thumbnail((820, 1160), Image.Resampling.LANCZOS)
    destination = public_scenery / source_name
    image.save(destination, 'JPEG', quality=76, optimize=True, progressive=True)
    print(f'{destination.name}: {image.size[0]}x{image.size[1]}')
