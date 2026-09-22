import zlib, struct, sys, os
def readpng(p):
    d=open(p,'rb').read(); pos=8; w=h=None; idat=b''
    while pos<len(d):
        ln=struct.unpack('>I',d[pos:pos+4])[0]; typ=d[pos+4:pos+8]; data=d[pos+8:pos+8+ln]
        if typ==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',data[:10])
        elif typ==b'IDAT': idat+=data
        pos+=12+ln
    raw=zlib.decompress(idat); bpp=3 if ct==2 else 4
    stride=w*bpp; out=bytearray(h*stride); prev=bytearray(stride); i=0
    for y in range(h):
        f=raw[i]; i+=1; line=bytearray(raw[i:i+stride]); i+=stride
        for x in range(stride):
            a=line[x-bpp] if x>=bpp else 0; b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+((a+b)>>1))&255
            elif f==4:
                pp=a+b-c; pa=abs(pp-a); pb=abs(pp-b); pc=abs(pp-c)
                pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[x]=(line[x]+pr)&255
        out[y*stride:(y+1)*stride]=line; prev=line
    return w,h,bpp,bytes(out)
def region(p, x0,y0,x1,y1):
    w,h,bpp,px=readpng(p); n=0; R=G=B=0
    for y in range(y0,min(y1,h)):
        for x in range(x0,min(x1,w)):
            o=y*w*bpp+x*bpp; R+=px[o]; G+=px[o+1]; B+=px[o+2]; n+=1
    return (R/n, G/n, B/n)
def lum(c): return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
# Regions are per CAMERA ANGLE. Reusing one set across two angles put both
# samples on the same wall and reported a contrast of ~0 for every build.
SETS={
 'default':{'wallA':(330,280,420,430),'wallB':(480,310,650,450),
            'roof':(430,200,650,300),'grass':(120,560,330,610),'sky':(60,30,300,90)},
 'turned' :{'wallA':(350,300,590,450),'wallB':(628,300,668,440),
            'roof':(330,190,620,280),'grass':(120,560,330,610),'sky':(60,30,300,90)},
}
import sys as _s
REGIONS=SETS['turned' if '--turned' in _s.argv else 'default']
print(f"{'shot':<22}"+''.join(f"{k.split(' ')[0]:>11}" for k in REGIONS)+f"{'contrast':>10}")
for tag in [a for a in sys.argv[1:] if not a.startswith('--')]:
    p=f"/tmp/claude-0/shot/out/{tag}.png"
    if not os.path.exists(p): continue
    vals={k:lum(region(p,*v)) for k,v in REGIONS.items()}
    c=vals['wallA']-vals['wallB']
    print(f"{tag:<22}"+''.join(f"{vals[k]:>11.1f}" for k in REGIONS)+f"{c:>10.1f}")
