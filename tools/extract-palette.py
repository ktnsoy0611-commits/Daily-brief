"""参照画像から「デザインされた面」だけの配色を採る。

写真が背景にあると、面積で地を決める規則は破綻する（夜景が地に採られる）。
2つの条件で写真を落とす:
  1. 局所の分散が小さい画素だけ残す（写真の肌理が落ちる）
  2. 群の中のばらつき（Lab の標準偏差）が小さく、横に長く連なる群だけ残す
     ―― 刷られた面は「まったく同じ値」が広く続く。空はゆるやかに変わるので残らない。
墨（文字の色）は線が細く上の条件を通らないので、ふるいにかけない画素から別に採る。
"""
import math, random, sys
from PIL import Image, ImageFilter
random.seed(11)

def srgb2lin(c):
    c=c/255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def rgb2lab(r,g,b):
    R,G,B=srgb2lin(r),srgb2lin(g),srgb2lin(b)
    X=R*.4124+G*.3576+B*.1805;Y=R*.2126+G*.7152+B*.0722;Z=R*.0193+G*.1192+B*.9505
    def f(t): return t**(1/3) if t>0.008856 else (7.787*t+16/116)
    fx,fy,fz=f(X/.95047),f(Y),f(Z/1.08883)
    return (116*fy-16,500*(fx-fy),200*(fy-fz))
def hexs(c): return "#%02X%02X%02X"%tuple(int(round(v)) for v in c)

def kmeans(pts,k,it=40):
    cents=[random.choice(pts)]
    for _ in range(k-1):
        d=[min(sum((p[i]-c[i])**2 for i in range(3)) for c in cents) for p in pts]
        t=sum(d) or 1; r=random.random()*t; a=0
        for p,dd in zip(pts,d):
            a+=dd
            if a>=r: cents.append(p); break
        else: cents.append(random.choice(pts))
    for _ in range(it):
        b=[[] for _ in cents]
        for p in pts:
            i=min(range(len(cents)),key=lambda i:sum((p[j]-cents[i][j])**2 for j in range(3)))
            b[i].append(p)
        cents=[tuple(sum(x[j] for x in bb)/len(bb) for j in range(3)) if bb else cents[i]
               for i,bb in enumerate(b)]
    return cents

def palette(path,k=16,crop=None,spread=2.2,minrun=0.08,size=300):
    im=Image.open(path).convert("RGB")
    if crop: im=im.crop(crop)
    im.thumbnail((size,size)); W,H=im.size; px=im.load()
    g=im.convert("L"); m=g.filter(ImageFilter.BoxBlur(2)).load()
    s=Image.eval(g,lambda v:(v*v)//255).filter(ImageFilter.BoxBlur(2)).load()
    kept=[(x,y) for y in range(H) for x in range(W) if s[x,y]*255-m[x,y]*m[x,y] < 9]
    labs=[rgb2lab(*px[p]) for p in kept]
    cents=kmeans(labs,k)
    idx=[min(range(k),key=lambda i:sum((L[j]-cents[i][j])**2 for j in range(3))) for L in labs]
    grp=[[] for _ in range(k)]
    for L,i in zip(labs,idx): grp[i].append(L)
    A={p:i for p,i in zip(kept,idx)}
    mr=[0]*k
    for y in range(H):
        c=-1;n=0
        for x in range(W):
            a=A.get((x,y),-2)
            if a==c: n+=1
            else:
                if c>=0: mr[c]=max(mr[c],n)
                c=a;n=1
        if c>=0: mr[c]=max(mr[c],n)
    tot=len(kept); rows=[]
    for i in range(k):
        n=len(grp[i])
        if n/tot<0.008: continue
        mu=[sum(x[j] for x in grp[i])/n for j in range(3)]
        sd=math.sqrt(sum(sum((x[j]-mu[j])**2 for j in range(3)) for x in grp[i])/n)
        if sd>spread or mr[i]/W<minrun: continue
        best=None;bd=1e9
        for p in kept:
            L=rgb2lab(*px[p]);d=sum((L[j]-cents[i][j])**2 for j in range(3))
            if d<bd: bd=d;best=px[p]
        L,a,b=rgb2lab(*best)
        rows.append({"hex":hexs(best),"n":n,"L":L,"C":math.hypot(a,b)})
    t=sum(r["n"] for r in rows) or 1
    for r in rows: r["pct"]=r["n"]/t*100
    rows.sort(key=lambda r:-r["pct"])
    # 墨 ── 面のふるいを通らない細い線から採る
    ink=min((px[(x,y)] for y in range(H) for x in range(W)),
            key=lambda c: rgb2lab(*c)[0])
    return rows, hexs(ink)

if __name__=="__main__":
    U="/root/.claude/uploads/6085550b-b4f7-58d5-8298-74c108ced330/"
    JOBS=[("d2315c89-image.jpg","01 EPA 1970",20,(24,140,1170,1000)),
          ("144ceff6-image.jpg","02 Make More of Every Space",16,None),
          ("aadbe818-image.jpg","03 Strelka",12,None),
          ("d0f4899d-image.jpg","04 色名のパレット",12,None),
          ("7f56555e-image.jpg","05 黒地のグラフ",10,None)]
    for fn,name,k,crop in JOBS:
        rows,ink=palette(U+fn,k,crop)
        print("\n=== %s"%name)
        print("   墨（細い線から）%s"%ink)
        for r in rows:
            print("   %s %5.1f%%  L*%5.1f  C*%5.1f"%(r["hex"],r["pct"],r["L"],r["C"]))
