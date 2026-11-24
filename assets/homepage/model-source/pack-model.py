from pathlib import Path
import array, base64, math, sys

source = Path(sys.argv[1]).read_text().splitlines()
output = Path(sys.argv[2])
points, triangles = [], []
for part in ('portesfermees', 'sr71'):
    start = source.index(f'name "{part}"')
    vline = next(n for n in range(start, len(source)) if source[n].startswith('numvert '))
    count = int(source[vline].split()[1])
    offset = len(points)
    for line in source[vline + 1:vline + 1 + count]:
        x, y, z = map(float,line.split())
        points.append((round(z*1000), round(y*1000), round(-x*1000)))
    end = next(n for n in range(vline, len(source)) if source[n].startswith('kids '))
    cursor = vline + count + 2
    while cursor < end:
        assert source[cursor].startswith('SURF '), source[cursor]
        amount = int(source[cursor + 2].split()[1])
        refs = [offset+int(line.split()[0]) for line in source[cursor + 3:cursor + 3 + amount]]
        for i in range(1,amount - 1):
            a,b,c = refs[0],refs[i],refs[i+1]
            if len({points[a],points[b],points[c]})==3:
                triangles.append((a,b,c))
        cursor += 3 + amount

def triple(a,b,c):
    return a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0])
volume=sum(triple(points[a],points[b],points[c]) for a,b,c in triangles)
if volume<0: triangles=[(a,c,b) for a,b,c in triangles]
def encode(fmt,data):
    words=array.array(fmt,(v for row in data for v in row))
    if sys.byteorder!='little': words.byteswap()
    return base64.b64encode(words).decode('ascii')
output.write_text('/* SR-71 public model: see MODEL.txt. */\nwindow.blackbirdMesh={positions:"'+encode('h',points)+'",indices:"'+encode('H',triangles)+'"};\n')
print(f'{len(points)} vertices, {len(triangles)} triangles. Signed volume {volume/6e9:.1f} m³ before normalization.')
