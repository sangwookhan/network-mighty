# 디컴파일 결과에 CP949 한글 문자열을 주석으로 붙인다.
# 사용: python3 annotate_cp949.py <exe/dll> <ghidra.c> <out_strings.txt> <out_annotated.c>
import sys, re, struct
exe, cfile, outtbl, outc = sys.argv[1:5]
b = open(exe,'rb').read()
pe = struct.unpack_from('<I', b, 0x3c)[0]
nsec = struct.unpack_from('<H', b, pe+6)[0]; opt = struct.unpack_from('<H', b, pe+20)[0]
base = struct.unpack_from('<I', b, pe+24+28)[0]
secs=[]
for i in range(nsec):
    o = pe+24+opt+40*i
    name=b[o:o+8].rstrip(b'\0').decode(); vs,va,rs,ro = struct.unpack_from('<IIII', b, o+8)
    secs.append((name,va,rs,ro))
tbl={}
for name,va,rs,ro in secs:
    if name not in ('.rdata','.data'): continue
    data=b[ro:ro+rs]
    for m in re.finditer(rb'[\x09\x0a\x0d\x20-\x7e\x81-\xfe]{2,}\x00', data):
        s=m.group()[:-1]
        if not any(c>=0x80 for c in s): continue
        try: t=s.decode('cp949')
        except: continue
        if not re.search('[가-힣]', t): continue
        tbl[base+va+m.start()]=t
with open(outtbl,'w') as f:
    for a,t in sorted(tbl.items()): f.write('%08x\t%s\n'%(a,t.replace('\n','\\n')))
src=open(cfile,encoding='utf-8',errors='replace').read()
def rep(m):
    a=int(m.group(2),16)
    return m.group(0)+('/*"%s"*/'%tbl[a].replace('\n','\\n').replace('*/','* /')) if a in tbl else m.group(0)
src=re.sub(r'(?:DAT_|_|0x)(?:00)?([0-9a-f]{6})\b', lambda m: m.group(0)+('/*"%s"*/'%tbl[int(m.group(1),16)].replace('\n','\\n').replace('*/','* /') if int(m.group(1),16) in tbl else ''), src)
open(outc,'w').write(src)
print(len(tbl),'strings')
