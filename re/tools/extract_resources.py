# 원작 PE 의 .rsrc 에서 비트맵(PNG 로 변환)과 다이얼로그(raw)를 꺼낸다. Pillow 필요.
# 사용: python3 extract_resources.py <Mighty.exe> <out_dir>
import sys, struct, io, os
from PIL import Image
exe, out = sys.argv[1], sys.argv[2]
b = open(exe,'rb').read()
pe = struct.unpack_from('<I', b, 0x3c)[0]
nsec = struct.unpack_from('<H', b, pe+6)[0]; opt = struct.unpack_from('<H', b, pe+20)[0]
secs=[]
for i in range(nsec):
    o=pe+24+opt+40*i; name=b[o:o+8].rstrip(b'\0').decode(); vs,va,rs,ro=struct.unpack_from('<IIII',b,o+8); secs.append((name,va,vs,ro))
rsrc=[s for s in secs if s[0]=='.rsrc'][0]; rva0, off0 = rsrc[1], rsrc[3]
def rva2off(r):
    for n,va,vs,ro in secs:
        if va<=r<va+max(vs,1): return r-va+ro
def readdir(o):
    _,_,_,_,nn,ni = struct.unpack_from('<IIHHHH', b, off0+o)
    ents=[]
    for k in range(nn+ni):
        name,data = struct.unpack_from('<II', b, off0+o+16+8*k)
        if name & 0x80000000:
            so = off0 + (name & 0x7fffffff); ln = struct.unpack_from('<H', b, so)[0]; name = b[so+2:so+2+ln*2].decode('utf-16le')
        ents.append((name,data))
    return ents
TYPES={1:'CURSOR',2:'BITMAP',3:'ICON',4:'MENU',5:'DIALOG',6:'STRING',10:'RCDATA',12:'GROUP_CURSOR',14:'GROUP_ICON',16:'VERSION',23:'HTML',240:'DLGINIT',241:'TOOLBAR'}
summary={}
for tname,tdata in readdir(0):
    tn = TYPES.get(tname, str(tname))
    for iname,idata in readdir(tdata & 0x7fffffff):
        for lname,ldata in readdir(idata & 0x7fffffff):
            drva,size,_,_ = struct.unpack_from('<IIII', b, off0+ldata)
            data = b[rva2off(drva):rva2off(drva)+size]
            summary.setdefault(tn,[]).append((iname,size))
            if tn=='BITMAP':
                hdrsize = struct.unpack_from('<I', data, 0)[0]
                bpp = struct.unpack_from('<H', data, 14)[0]; clr = struct.unpack_from('<I', data, 32)[0]
                ncol = clr if clr else (1<<bpp if bpp<=8 else 0)
                offbits = 14 + hdrsize + ncol*4
                bmp = b'BM' + struct.pack('<IHHI', 14+len(data), 0, 0, offbits) + data
                try:
                    im = Image.open(io.BytesIO(bmp)); im.save(os.path.join(out, f'bitmap_{iname}.png'))
                except Exception as e: print('fail', iname, e)
            if tn=='DIALOG':
                open(os.path.join(out, f'dialog_{iname}.bin'),'wb').write(data)
for k,v in summary.items(): print(k, len(v), sum(s for _,s in v), [n for n,_ in v][:30])
