from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
source = project / 'assets' / 'images' / 'coastal-airport-scene.jpg'
target = project / 'assets' / 'images' / 'coastal-airport-scene-optimized.jpg'

image = Image.open(source).convert('RGB')
max_edge = 900
scale = min(1, max_edge / max(image.size))
size = (round(image.width * scale), round(image.height * scale))
resized = image.resize(size, Image.Resampling.LANCZOS) if size != image.size else image
resized.save(target, format='JPEG', quality=74, optimize=True, progressive=True)
print(f'{source.name}: {image.size} -> {size}; {source.stat().st_size} -> {target.stat().st_size} bytes')
