import math, random, json
from PIL import Image
random.seed(11)
U="/root/.claude/uploads/6085550b-b4f7-58d5-8298-74c108ced330/"

def srgb2lin(c):
    c=c/255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def rgb2lab(r,g,b):
    R,G,B=srgb2lin(r),srgb2lin(g),srgb2lin(b)
    X=R*.4124+G*.3576+B*.1805; Y=R*.2126+G*.7152+B*.0722; Z=R*.0193+G*.1192+B*.9505
    def f(t): return t**(1/3) if t>0.008856 else (7.787*t+16/116)
    fx,fy,fz=f(X/.95047),f(Y),f(Z/1.08883)
    return (116*fy-16, 500*(fx-fy), 200*(fy-fz))
def hexs(c): return "#%02X%02X%02X"%tuple(int(round(v)) for v in c)

def kmeans(pts,k,iters=45):
    cents=[random.choice(pts)]
    for _ in range(k-1):
        d=[min(sum((p[i]-c[i])**2 for i in range(3)) for c in cents) for p in pts]
        tot=sum(d) or 1; r=random.random()*tot; acc=0
        for p,dd in zip(pts,d):
            acc+=dd
            if acc>=r: cents.append(p); break
        else: cents.append(random.choice(pts))
    for _ in range(iters):
        b=[[] for _ in cents]
        for p in pts:
            i=min(range(len(cents)),key=lambda i: sum((p[j]-cents[i][j])**2 for j in range(3)))
            b[i].append(p)
        new=[tuple(sum(x[j] for x in bb)/len(bb) for j in range(3)) if bb else cents[i]
             for i,bb in enumerate(b)]
        if all(sum((new[i][j]-cents[i][j])**2 for j in range(3))<0.4 for i in range(len(cents))):
            cents=new; break
        cents=new
    b=[[] for _ in cents]
    for p in pts:
        i=min(range(len(cents)),key=lambda i: sum((p[j]-cents[i][j])**2 for j in range(3)))
        b[i].append(p)
    return [(cents[i],len(b[i])/len(pts)) for i in range(len(cents))]

def analyse(fn,name,k=10,crop=None):
    im=Image.open(U+fn).convert("RGB")
    if crop: im=im.crop(crop)
    im.thumbnail((300,300))
    px=list(im.getdata()); labs=[rgb2lab(*p) for p in px]
    cl=[c for c in kmeans(labs,k) if c[1]>=0.012]
    rows=[]
    for c,w in cl:
        best=None;bd=1e9
        for q in px:
            L=rgb2lab(*q); d=sum((L[i]-c[i])**2 for i in range(3))
            if d<bd: bd=d;best=q
        L,a,b=rgb2lab(*best)
        rows.append({"hex":hexs(best),"pct":round(w*100,1),"L":round(L,1),
                     "C":round(math.hypot(a,b),1)})
    rows.sort(key=lambda r:-r["pct"])
    # 役割の割り当て（規則で決める）
    ground=rows[0]
    ink=min(rows,key=lambda r:r["L"])
    neutrals=[r for r in rows if r["C"]<20 and r is not ground and r is not ink]
    paper=max(neutrals,key=lambda r:r["L"]) if neutrals else None
    used={id(ground),id(ink)}|({id(paper)} if paper else set())
    acc=[r for r in rows if r["C"]>=25 and id(r) not in used]
    acc.sort(key=lambda r:-r["pct"])
    print("\n=== %s  (%s)"%(name,fn))
    print("  all:", " ".join("%s %.1f%%(L%.0f C%.0f)"%(r["hex"],r["pct"],r["L"],r["C"]) for r in rows))
    print("  ground %s %.1f%%  ink %s L%.0f  paper %s"%(
        ground["hex"],ground["pct"],ink["hex"],ink["L"],paper["hex"] if paper else "—(導出)"))
    print("  accents:", " ".join("%s(%.1f%% C%.0f)"%(r["hex"],r["pct"],r["C"]) for r in acc[:4]))

analyse("d2315c89-image.jpg","01 EPA 1970",10,(24,140,1170,1000))
analyse("144ceff6-image.jpg","02 Make More of Every Space",10)
analyse("aadbe818-image.jpg","03 Strelka",10)
analyse("d0f4899d-image.jpg","04 色名のパレット",10)
analyse("7f56555e-image.jpg","05 黒地のグラフ",10)
