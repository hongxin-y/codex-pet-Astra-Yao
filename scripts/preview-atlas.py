#!/usr/bin/env python3
"""Render native-cell review evidence from the exact encoded production atlas."""
import base64
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['idle','running-right','running-left','waving','jumping','failed','waiting','running','review']
COUNTS = [6,8,8,4,5,8,6,6,6]
INTERVALS = [160,120,120,200,140,140,150,120,360]
REGIONS = {'head':(61,12,142,92),'torso':(63,86,140,148),'legs':(74,137,123,205),'staff':(33,4,74,195)}


def render():
    source = ROOT / 'spritesheet.webp'
    atlas = Image.open(source).convert('RGBA')
    out = ROOT / 'docs/atlas-qa'
    out.mkdir(exist_ok=True)
    frames = out / 'frames'
    def cell(r,c):
        return atlas.crop((c*192,r*208,(c+1)*192,(r+1)*208))
    def panel(r,c,label):
        image=Image.new('RGB',(192,234),'#e8e8ed')
        sprite=cell(r,c); image.paste(sprite,(0,24),sprite)
        ImageDraw.Draw(image).text((5,5),label,fill='#20212a')
        return image
    def gif(items,intervals,path):
        items[0].save(path,save_all=True,append_images=items[1:],duration=intervals,loop=0,optimize=False,disposal=2)
    allframes=[]; alldurations=[]
    for r,(name,count,interval) in enumerate(zip(NAMES,COUNTS,INTERVALS)):
        directory=frames/name; directory.mkdir(parents=True,exist_ok=True)
        sequence=[]
        for c in range(count):
            cell(r,c).save(directory/f'{c:02}.png')
            sequence.append(panel(r,c,f'{name} [{r},{c}]'))
        gif(sequence,[interval]*count,out/f'{name}.gif')
        allframes+=sequence; alldurations+=[interval]*count
    gif(allframes,alldurations,out/'all-states.gif')
    look=[panel(9+i//8,i%8,f'{i*22.5:g} degrees') for i in range(16)]
    gif(look,[180]*16,out/'look-loop.gif')
    jumpseq=[(0,0)]*4+[(4,c) for c in range(5)]+[(0,0)]*4
    waveseq=[(0,0)]*3+[(3,c) for c in range(4)]+[(0,0)]*3
    for name,seq in [('idle-jump-idle',jumpseq),('idle-wave-idle',waveseq)]:
        gif([panel(r,c,f'[{r},{c}]') for r,c in seq],[160]*len(seq),out/f'{name}.gif')
    for label,r,c in [('idle',0,0),('waving',3,1),('jumping',4,2),('waiting',6,1)]:
        cell(r,c).save(out/f'still-{label}.png')
    # All 73 frames, in unchanged master-coordinate windows, no per-frame fitting.
    for name,box in REGIONS.items():
        width=box[2]-box[0]; height=box[3]-box[1]
        sheet=Image.new('RGB',((width+8)*9,(height+24)*11),'#e8e8ed'); draw=ImageDraw.Draw(sheet)
        for r,count in enumerate(COUNTS+[8,8]):
            for c in range(-1,count):
                sprite=cell(0,0) if c==-1 else cell(r,c)
                crop=sprite.crop(box);x=(c+1)*(width+8);y=r*(height+24)
                draw.text((x+3,y+3),'master' if c==-1 else f'{r},{c}',fill='#20212a')
                sheet.paste(crop,(x+3,y+20),crop)
        sheet.save(out/f'fixed-{name}.png')
    # Side-by-side native-size comparisons most relevant to clicking and gaze.
    sequence=[]
    for r,c in [(3,c) for c in range(4)]+[(9+i//8,i%8) for i in range(16)]:
        image=Image.new('RGB',(384,234),'#e8e8ed');image.paste(panel(0,0,'idle master'),(0,0));image.paste(panel(r,c,f'candidate [{r},{c}]'),(192,0));sequence.append(image)
    gif(sequence,[240]*len(sequence),out/'master-comparison.gif')
    metadata={'atlasSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cropCoordinates':REGIONS,'frameSize':[192,208],'fitting':'none','intervalsMs':dict(zip(NAMES,INTERVALS))}
    (out/'preview.json').write_text(json.dumps(metadata,indent=2)+'\n')
    # Optional video export; preview rendering works with Pillow alone.
    try:
        import cv2, numpy as np
        video=cv2.VideoWriter(str(out/'all-states.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),50,(192,234))
        if not video.isOpened(): raise RuntimeError('MP4 encoder unavailable')
        for frame,duration in zip(allframes,alldurations):
            bgr=cv2.cvtColor(np.asarray(frame),cv2.COLOR_RGB2BGR)
            for _ in range(round(duration/20)):video.write(bgr)
        video.release()
    except ImportError:
        print('MP4 skipped: optional opencv-python/numpy unavailable')
    encoded=base64.b64encode(source.read_bytes()).decode('ascii')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>耀嘉音素材逐帧检查</title>
<style>body{font:16px system-ui;background:#17191e;color:#eee;margin:32px;max-width:1000px}button,select,input{font:inherit;margin:6px;padding:7px}canvas{background:#e8e8ed;image-rendering:pixelated}#stage{display:flex;gap:32px;padding:24px;width:max-content}label{display:inline-block}p{line-height:1.6}small{color:#bfc5ce}</style>
<h1>固定比例逐帧检查</h1><p>左侧始终是待机母版，右侧是当前帧。两侧都按原生 192 × 208 显示。将鼠标绕右侧人物移动可检查 360° 注视；点击人物播放挥手。</p>
<select id="state"></select><button id="pause">暂停</button><button id="prev">上一帧</button><button id="next">下一帧</button><label><input id="overlay" type="checkbox">叠加母版</label>
<div id="stage"><div>待机母版<br><canvas id="master" width="192" height="208"></canvas></div><div><span id="caption"></span><br><canvas id="current" width="192" height="208"></canvas></div></div>
<p id="info"></p><p><a href="fixed-head.png">头部固定裁块</a> · <a href="fixed-torso.png">躯干固定裁块</a> · <a href="fixed-legs.png">腿脚固定裁块</a> · <a href="fixed-staff.png">法杖固定裁块</a></p>
<small>固定窗口裁切，不做逐格包围盒拟合。头部转动会改变投影；重点比较固定的裙摆、腿脚、法杖及动作切换。</small>
<script>
const image=new Image();image.src='data:image/webp;base64,ATLAS';
const names=['待机','向右跑','向左跑','挥手','跳跃','失败','等待','工作','检查','16 向注视'];
const counts=[6,8,8,4,5,8,6,6,6,16], intervals=[160,120,120,200,140,140,150,120,360,180];
const select=document.querySelector('#state'),canvas=document.querySelector('#current'),ctx=canvas.getContext('2d');
let row=0,index=0,playing=true,last=0,clickUntil=0;names.forEach((name,i)=>select.add(new Option(name,i)));
function sprite(context,r,c,alpha=1){context.globalAlpha=alpha;context.drawImage(image,c*192,r*208,192,208,0,0,192,208);context.globalAlpha=1}
function draw(){ctx.clearRect(0,0,192,208);const r=row===9?9+Math.floor(index/8):row,c=row===9?index%8:index;sprite(ctx,r,c);if(document.querySelector('#overlay').checked)sprite(ctx,0,0,.35);document.querySelector('#caption').textContent=names[row];document.querySelector('#info').textContent=`第 ${r} 行 / 第 ${c} 格`+(row===9?` · ${index*22.5}°`:'')}
image.onload=()=>{sprite(document.querySelector('#master').getContext('2d'),0,0);draw();requestAnimationFrame(tick)};
function tick(t){if(clickUntil&&t>clickUntil){clickUntil=0;row=0;index=0;select.value=0}if(playing&&t-last>=intervals[row]){index=(index+1)%counts[row];last=t;draw()}requestAnimationFrame(tick)}
select.onchange=()=>{row=Number(select.value);index=0;clickUntil=0;draw()};document.querySelector('#pause').onclick=e=>{playing=!playing;e.target.textContent=playing?'暂停':'播放'};
for(const [id,delta] of [['prev',-1],['next',1]])document.querySelector('#'+id).onclick=()=>{playing=false;document.querySelector('#pause').textContent='播放';index=(index+delta+counts[row])%counts[row];draw()};
document.querySelector('#overlay').onchange=draw;
document.querySelector('#stage').onpointermove=e=>{if(clickUntil)return;const rect=canvas.getBoundingClientRect(),dx=e.clientX-rect.left-96,dy=e.clientY-rect.top-100;if(Math.hypot(dx,dy)<24)return;row=9;select.value=9;index=Math.round(((Math.atan2(dx,-dy)*180/Math.PI+360)%360)/22.5)%16;playing=false;document.querySelector('#pause').textContent='播放';draw()};
canvas.onclick=()=>{row=3;select.value=3;index=0;playing=true;last=performance.now();clickUntil=last+800;draw()};
</script></html>'''.replace('ATLAS',encoded)
    (out/'review.html').write_text(html,encoding='utf-8')
    print(f'Rendered exact-atlas previews and fixed-coordinate comparisons in {out}')


if __name__=='__main__':render()
