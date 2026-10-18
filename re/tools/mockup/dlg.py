import struct,sys,glob,os
R=os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../resources/")
CLS={0x80:'BUTTON',0x81:'EDIT',0x82:'STATIC',0x83:'LISTBOX',0x84:'SCROLLBAR',0x85:'COMBOBOX'}
def sz(b,o):
    w=struct.unpack_from('<H',b,o)[0]
    if w==0: return '',o+2
    if w==0xffff: return ('#%d'%struct.unpack_from('<H',b,o+2)[0]),o+4
    s=o
    while struct.unpack_from('<H',b,o)[0]: o+=2
    return b[s:o].decode('utf-16le'),o+2
def al(o):return (o+3)&~3
def btype(cls,style):
    if cls!='BUTTON':return cls
    t=style&0xf
    return {0:'PUSH',1:'DEFPUSH',2:'CHECK',3:'AUTOCHECK',4:'RADIO',5:'3STATE',6:'AUTO3',7:'GROUPBOX',9:'AUTORADIO',0xb:'OWNERDRAW'}.get(t,'BTN%x'%t)
def parse(fn):
    b=open(fn,'rb').read()
    ex= struct.unpack_from('<HH',b,0)==(1,0xffff)
    if ex:
        _,_,help,exst,style,n,x,y,cx,cy=struct.unpack_from('<HHIIIHhhhh',b,0);o=26
    else:
        style,exst,n,x,y,cx,cy=struct.unpack_from('<IIHhhhh',b,0);o=18
    menu,o=sz(b,o);cls,o=sz(b,o);title,o=sz(b,o)
    font=''
    if style&0x40:
        if ex:
            pt,wt,it,cs=struct.unpack_from('<HHBB',b,o);o+=6
        else:
            pt=struct.unpack_from('<H',b,o)[0];o+=2
        fname,o=sz(b,o);font='%s %dpt'%(fname,pt)
    print('== %s  title=%r  rect=(%d,%d,%d,%d) DLU style=%08x font=%s n=%d'%(os.path.basename(fn),title,x,y,cx,cy,style,font,n))
    for i in range(n):
        o=al(o)
        if ex:
            hid,cex,cst,x,y,cx,cy,cid=struct.unpack_from('<IIIhhhhI',b,o);o+=24
        else:
            cst,cex,x,y,cx,cy,cid=struct.unpack_from('<IIhhhhH',b,o);o+=18
        if struct.unpack_from('<H',b,o)[0]==0xffff:
            c=CLS.get(struct.unpack_from('<H',b,o+2)[0],'?');o+=4
        else: c,o=sz(b,o)
        t,o=sz(b,o)
        ln=struct.unpack_from('<H',b,o)[0];o+=2+ln
        print('  %-10s id=%-5d (%3d,%3d,%3d,%3d) %r'%(btype(c.upper(),cst),cid if cid<0x8000 else cid-0x10000,x,y,cx,cy,t))
for f in sorted(glob.glob(R+'dialog_*.bin'),key=lambda s:int(s.split('_')[-1][:-4])): parse(f)
