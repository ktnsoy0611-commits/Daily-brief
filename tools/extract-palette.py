import sys, math, random
from PIL import Image
random.seed(7)
U="/root/.claude/uploads/6085550b-b4f7-58d5-8298-74c108ced330/"

def srgb2lin(c):
    c=c/255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def rgb2lab(r,g,b):
    R,G,B=srgb2lin(r),srgb2lin(g),srgb2lin(b)
    X=R*0.4124+G*0.3576+B*0.1805; Y=R*0.2126+G*0.7152+B*0.0722; Z=R*0.0193+G*0.1192+B*0.9505
    Xn,Yn,Zn=0.95047,1.0,1.08883
    def f(t): return t**(1/3) if t>0.008856 else (7.787*t+16/116)
    fx,fy,fz=f(X/Xn),f(Y/Yn),f(Z/Zn)
    return (116*fy-16, 500*(fx-fy), 200*(fy-fz))
def hexs(c): return "#%02X%02X%02X"%tuple(int(round(v)) for v in c)

def kmeans(pts, k, iters=40):
    # k-means++ init
    cents=[random.choice(pts)]
    for _ in range(k-1):
        d=[min(sum((p[i]-c[i])**2 for i in range(3)) for c in cents) for p in pts]
        tot=sum(d) or 1
        r=random.random()*tot; acc=0
        for p,dd in zip(pts,d):
            acc+=dd
            if acc>=r: cents.append(p); break
        else: cents.append(random.choice(pts))
    for _ in range(iters):
        buck=[[] for _ in cents]
        for p in pts:
            bi=min(range(len(cents)), key=lambda i: sum((p[j]-cents[i][j])**2 for j in range(3)))
            buck[bi].append(p)
        new=[]
        for i,b in enumerate(buck):
            if b: new.append(tuple(sum(x[j] for x in b)/len(b) for j in range(3)))
            else: new.append(cents[i])
        if all(sum((new[i][j]-cents[i][j])**2 for j in range(3))<0.5 for i in range(len(cents))): 
            cents=new; break
        cents=new
    buck=[[] for _ in cents]
    for p in pts:
        bi=min(range(len(cents)), key=lambda i: sum((p[j]-cents[i][j])**2 for j in range(3)))
        buck[bi].append(p)
    return [(cents[i], len(buck[i])/len(pts)) for i in range(len(cents))]

def rep(rgbs, lab_center):
    # pick the actual pixel colour closest to the cluster centre (in Lab)
    best=None; bd=1e9
    for c in rgbs:
        L=rgb2lab(*c); d=sum((L[i]-lab_center[i])**2 for i in range(3))
        if d<bd: bd=d; best=c
    return best

def run(fn, name, k=8, crop=None):
    im=Image.open(U+fn).convert("RGB")
    if crop: im=im.crop(crop)
    im.thumbnail((260,260))
    px=list(im.getdata())
    labs=[rgb2lab(*p) for p in px]
    cl=kmeans(labs, k)
    cl.sort(key=lambda x:-x[1])
    out=[]
    for c,w in cl:
        if w<0.012: continue
        col=rep(px, c)
        L,a,bb=rgb2lab(*col)
        chroma=math.hypot(a,bb)
        out.append((hexs(col), round(w*100,1), round(L,1), round(chroma,1)))
    print("\n== %s  (%s)"%(name, fn))
    for h,w,L,C in out:
        print("   %s  %5.1f%%   L*%5.1f  C*%5.1f"%(h,w,L,C))

if __name__=="__main__":
    for a in sys.argv[1:]:
        f,n,k=a.split("|")
        run(f,n,int(k))
