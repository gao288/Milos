"""Adapt marvin.te's Girl source; never write to the user's original cloud file.

Original gaze/pose bones remain intact. Native expression state transitions own
brows, lids and emotional lips; independently bound vertices own articulation.
"""
from pathlib import Path
import math
import json
import subprocess
import xml.etree.ElementTree as E

project = Path(__file__).resolve().parents[1] / 'rive-girl'
r = E.parse(project / 'source/original.xml').getroot()
serial = 30000
by_id = {e.get('id'): e for e in r.iter()}
def find(id): return by_id[id]
def el(parent, tag, **attrs):
    global serial
    serial += 1
    return E.SubElement(parent, tag, {**{k:str(v) for k,v in attrs.items()}, 'id':f'8:{serial}'})
def bind(obj, name, prop): el(obj, 'DataBindContext', sourcePathIds=f'1:8619-{props[name]}', propertyKey=prop)
def static(a, obj, prop, value):
    ko=el(a,'KeyedObject',objectId=obj.get('id'))
    kp=el(ko,'KeyedProperty',propertyKey=prop)
    el(kp,'KeyFrameDouble',frame=0,value=value,interpolationType='linear')
def fill(shape,color): el(el(shape,'Fill'),'SolidColor',colorValue=color)
def stroke(shape,color,thickness):
    el(el(shape,'Stroke',thickness=thickness,cap='round',join='round'),'SolidColor',colorValue=color)
def ellipse(parent,name,x,y,w,h,color):
    s=el(parent,'Shape',name=name,x=x,y=y)
    g=el(s,'Ellipse',width=w,height=h,originX=.5,originY=.5);fill(s,color)
    return s,g

def geometry(points,closed):
    for i,(x,y) in enumerate(points):
        prev=points[(i-1)%len(points)] if closed or i else points[i]
        nxt=points[(i+1)%len(points)] if closed or i+1<len(points) else points[i]
        dx=(nxt[0]-prev[0])/6;dy=(nxt[1]-prev[1])/6
        yield dict(x=x,y=y,inRotation=math.atan2(-dy,-dx),outRotation=math.atan2(dy,dx),inDistance=math.hypot(dx,dy),outDistance=math.hypot(dx,dy))
def path(parent,name,points,closed=False,color=None,line=None,thickness=3):
    s=el(parent,'Shape',name=name);p=el(s,'PointsPath',isClosed=str(closed).lower())
    vs=[el(p,'CubicDetachedVertex',**v) for v in geometry(points,closed)]
    if color:fill(s,color)
    if line:stroke(s,line,thickness)
    return s,vs
keys={'x':24,'y':25,'inRotation':84,'inDistance':85,'outRotation':86,'outDistance':87}
def pose_path(a,vs,points,closed=False,handle_scale=1):
    for v,values in zip(vs,geometry(points,closed)):
        for prop,value in values.items():static(a,v,keys[prop],value * handle_scale if prop.endswith('Distance') else value)

ab=find('1:2');ab.set('name','Girl');ab.set('width','1080');ab.set('height','1080')
vm=find('1:8619');vm.set('name','GirlFace');instance=find('1:8620');instance.set('name','Default')
mouth_contract=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import { FOLLOW_MOUTH_DEFAULTS, LIP_POINTS } from './src/characters/follow-mouth.js'; console.log(JSON.stringify({defaults:FOLLOW_MOUTH_DEFAULTS,points:LIP_POINTS}));"],cwd=project.parent,text=True))
defaults=dict(emotion=0,intensity=1,eyeOpen=1,leftEyeScale=1,rightEyeScale=1,
    browRaiseLeft=0,browRaiseRight=0,gazeX=0,gazeY=0,headTilt=0,breath=0,
    restWeight=1,speechWeight=0,mouthLift=0,mouthStretch=1,cheekRaise=0,noseWrinkle=0,
    **mouth_contract['defaults'])
props={name:el(vm,'ViewModelPropertyNumber',name=name).get('id') for name in defaults}
for name,value in defaults.items():el(instance,'ViewModelInstanceNumber',viewModelPropertyId=props[name],propertyValue=value)
# Remove a source editor draw rule with no drawable target.
for parent in list(r.iter()):
    for child in list(parent):
        if child.tag=='DrawTarget' and not child.get('drawableId'):parent.remove(child)
# The source is a wide cursor demo. Keep its authored coordinate system but
# frame the character in a square, without the presentation background/effects.
for id in ['1:18866','1:17698','1:6611']:find(id).set('opacity','0')
sm=find('1:7');sm.set('name','Girl State Machine')
# Existing blink/delight timelines stay editable, but the new expression layer
# and framework blinking are their only live owners.
for child in list(sm):sm.remove(child)
# Drive the same damped controllers via view model data; no real mouse listener
# may override normalized gaze received from JEV/the runtime.
for c in list(find('1:533')):
    if c.tag=='DataBindContext':find('1:533').remove(c)
for e in instance:
    if e.get('viewModelPropertyId')=='1:8624':e.set('propertyValue','650')
    if e.get('viewModelPropertyId')=='1:8621':e.set('propertyValue','540')
# Preserve bones and their world-space bind poses by leaving all original
# transforms untouched; head tilt uses an extra parent around the character.
character=find('1:16685');idx=list(ab).index(character);ab.remove(character)
base=el(ab,'Node',name='Milos character pivot',x=550,y=830)
ab.remove(base);ab.insert(idx,base)
emotional=el(base,'Node',name='Expression posture')
manual=el(emotional,'Node',name='Head tilt and breath');bind(manual,'headTilt',15);bind(manual,'breath',14)
restore=el(manual,'Node',x=-640,y=-830);restore.append(character)

# Retain old artwork and controllers for reference, behind opacity gates.
for id in ['1:163','1:225','1:5264','1:5583','1:5960']:find(id).set('opacity','0')
# Canvas runtimes without feather support otherwise show opaque cheek disks.
# Keep the original blush shape subtle in both native and web renderers.
for id in ['1:5706','1:8407']:find(id).set('colorValue','40FBBEFD')
INK='FF3522A8';LIP='FFC878E8';LIP_LIGHT='FFE8ABF8'
eyes=[];brows=[]
# Names follow screen-side conventions, as does the shared face protocol.
for side,parent_id,x,y,sx,sy,rot in [('Right','1:7692',9,-2,1,1,-.12),('Left','1:8249',-4,-5,.70,.72,.32)]:
    origin=el(find(parent_id),'Node',name=side+' eye anchor',x=x,y=y,scaleX=sx,scaleY=sy,rotation=rot)
    manual_eye=el(origin,'Node',name=side+' manual eyelid');bind(manual_eye,side.lower()+'EyeScale',17)
    blink=el(manual_eye,'Node',name=side+' blink');bind(blink,'eyeOpen',17)
    # Child order is front-to-back. Whites are bounded by the actual opening;
    # pupil, glint and iris share its clipping boundary during every blink.
    upper,uv=path(blink,side+' upper liner',[(-35,2),(0,-22),(35,-4)],line=INK,thickness=5)
    lower,lv=path(blink,side+' lower liner',[(-35,2),(0,19),(35,-4)],line=INK,thickness=1.5)
    iris_pose=el(blink,'Node',name=side+' expressive pupil')
    gaze=el(iris_pose,'Node',name=side+' gaze');bind(gaze,'gazeX',13);bind(gaze,'gazeY',14)
    glint,_=ellipse(gaze,side+' glint',5,-8,7,7,'FFFFFFFF')
    pupil,_=ellipse(gaze,side+' pupil',0,-2,18,22,INK)
    iris,_=ellipse(gaze,side+' iris',0,-2,31,39,'FF8253EA')
    aperture,av=path(blink,side+' white opening',[(-35,2),(0,-22),(35,-4),(0,19)],True,'FFFFFFFF')
    for s in [iris,pupil,glint]:el(s,'ClippingShape',sourceId=aperture.get('id'))
    eyes.append((side,upper,uv,lower,lv,iris_pose,av))
    # New brows follow their existing turn/vertical controllers.
    brow_parent=find('1:7846' if side=='Right' else '1:7872')
    origin=el(brow_parent,'Node',name=side+' brow anchor',x=46 if side=='Right' else 30,y=24,scaleX=1 if side=='Right' else .7)
    pose=el(origin,'Node',name=side+' brow expression')
    manual_brow=el(pose,'Node',name=side+' brow overlay');bind(manual_brow,'browRaise'+side,14)
    _,bv=path(manual_brow,side+' eyebrow',[(-38,4),(0,-9),(37,-7),(9,-17),(-21,-7)],True,INK)
    brows.append((side,pose,bv))

# Mouth follows the original perspective/turn controller. Colored lip edges
# maintain the source's visual identity; the shared solver supplies vertices.
anchor=el(find('1:7764'),'Node',name='Milos lips',x=-4,y=4,rotation=-.12,scaleX=1.25,scaleY=1.15)
overlay=el(anchor,'Node',name='Manual lip pose');bind(overlay,'mouthLift',14);bind(overlay,'mouthStretch',16)
rest=el(overlay,'Node',name='Emotional lips');bind(rest,'restWeight',18)
rest_teeth,rtg=ellipse(rest,'Emotional teeth',0,1,48,10,'FFFFF7FF')
rest_open,rv=path(rest,'Emotional aperture',[(-28,0),(0,-3),(28,0),(0,5)],True,'FF572B91',LIP,5)
el(rest_teeth,'ClippingShape',sourceId=rest_open.get('id'))
rest_upper,ruv=path(rest,'Upper lip',[(-28,0),(0,-2),(28,0)],line=LIP,thickness=6)
rest_lower,rlv=path(rest,'Lower lip',[(-28,0),(0,6),(28,0)],line=LIP_LIGHT,thickness=7)
# Move the lip strokes in front of teeth and cavity.
for s in [rest_lower,rest_upper]:rest.remove(s);rest.insert(0,s)
speech=el(overlay,'Node',name='Continuous speech');bind(speech,'speechWeight',18)
teeth,tg=ellipse(speech,'Upper teeth',0,-4,46,8,'FFFFF7FF');bind(teeth,'teethX',13);bind(tg,'teethWidth',20);bind(teeth,'teethVisible',18)
lower_teeth,_=ellipse(speech,'Lower teeth',0,9,43,5,'FFE2CDEB');bind(lower_teeth,'lowerTeethX',13);bind(lower_teeth,'lowerTeethY',14);bind(lower_teeth,'teethVisible',18)
tongue,_=ellipse(speech,'Tongue',0,12,30,14,'FFE390C8');bind(tongue,'tongueX',13);bind(tongue,'tongueY',14)
cavity=el(speech,'Shape',name='Eight-point speech lips');contour=el(cavity,'PointsPath',isClosed='true')
for prefix in mouth_contract['points']:
    v=el(contour,'CubicDetachedVertex',name=prefix,**{k:defaults[prefix+k[0].upper()+k[1:]] for k in keys})
    for k,prop in keys.items():bind(v,prefix+k[0].upper()+k[1:],prop)
fill(cavity,'FF572B91');stroke(cavity,LIP,5)
for s in [teeth,lower_teeth,tongue]:el(s,'ClippingShape',sourceId=cavity.get('id'))
# Lower face follows jaw without scaling the whole head or moving the upper lip.
# The original head is skinned to controller nodes; add translations to the chin
# controllers, preserving the other perspective keys and bind poses.
# Reparent lower-face controller groups under zero-offset overlays. Their
# existing perspective animation and skin bind transforms stay intact.
parents={child:parent for parent in r.iter() for child in parent}
for id in ['1:6813','1:6814','1:6815','1:6816']:
    controller=find(id);parent=parents[controller];index=list(parent).index(controller)
    parent.remove(controller)
    jaw=el(parent,'Node',name='Continuous jaw '+id)
    parent.remove(jaw);parent.insert(index,jaw);jaw.append(controller)
    bind(jaw,'jawX',13);bind(jaw,'jawY',14)
# Subtle cheek lift follows the same manual/model face protocol.
for id in ['1:8376','1:8412']:
    controller=find(id);parent=parents[controller];index=list(parent).index(controller)
    parent.remove(controller)
    cheek=el(parent,'Node',name='Cheek lift '+id)
    parent.remove(cheek);parent.insert(index,cheek);cheek.append(controller)
    bind(cheek,'cheekRaise',14)


names=['neutral','happy','sad','curious','surprised','angry','fear']
# width, smile curve, aperture, eye top L/R, bottom, pupil size, gaze Y,
# brow rise L/R, brow rotation L/R, roll, head Y
poses={
 'neutral': (55,5,0,-21,-22,18,1,0, 0,0,0,0,0,0),
 'warm': (65,12,0,-10,-10,13,1,0, -3,-3,-.08,.08,-.025,0),
 'happy': (72,15,35,-7,-7,-3,0,0, -11,-11,-.08,.08,.025,-6),
 'empathy': (52,2,0,-16,-17,15,1,4, -4,-4,-.30,.30,-.025,4),
 'sad': (51,-9,0,-7,-7,12,.9,8, -5,-5,-.48,.48,-.05,9),
 'curious': (32,0,6,-29,-8,17,1,0, -16,5,-.18,-.08,.055,0),
 'surprise': (27,0,27,-34,-34,27,.8,0, -18,-18,-.08,.08,0,-3),
 'surprised': (52,10,30,-29,-29,23,1.1,0, -17,-17,-.10,.10,.02,-4),
 'uneasy': (53,-6,2,-27,-24,18,.85,0, -7,-6,-.32,.30,-.025,-2),
 'fear': (65,-9,31,-39,-39,28,.65,0, -12,-12,-.48,.48,-.03,-7),
 'annoyed': (51,-4,0,-5,-5,16,1,3, 4,4,.16,-.16,.02,1),
 'angry': (63,-8,14,-6,-6,16,.85,2, 2,2,.38,-.38,0,5),
}
layer=el(sm,'StateMachineLayer',name='Expressions')
el(layer,'AnyState',x=-260,y=-160);el(layer,'ExitState',x=600,y=-160);entry=el(layer,'EntryState',x=-260,y=0)
anims={name:el(ab,'LinearAnimation',name='Expression · '+name,duration=60,fps=60) for name in poses}
states={};mid={'happy':'warm','sad':'empathy','surprised':'surprise','angry':'annoyed','fear':'uneasy'}
for i,name in enumerate(names):
    state=el(layer,'BlendState1DViewModel',x=i%3*260,y=i//3*200);states[name]=state
    bind(el(state,'BindablePropertyNumber'),'intensity',636)
    el(state,'BlendAnimation1D',animationId=anims['neutral'].get('id'),value=0)
    if name in mid:el(state,'BlendAnimation1D',animationId=anims[mid[name]].get('id'),value=.5)
    el(state,'BlendAnimation1D',animationId=anims[name].get('id'),value=1)
for name,state in states.items():
    for i,other in enumerate(names):
        if name==other:continue
        t=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=320)
        c=el(t,'TransitionViewModelCondition',opValue='equal')
        bind(el(el(c,'TransitionPropertyViewModelComparator'),'BindablePropertyNumber'),'emotion',636)
        el(c,'TransitionValueNumberComparator',value=i)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))
for name,p in poses.items():
    a=anims[name];w,smile,gap,tl,tr,bottom,pupil,py,bl,br,rl,rr,roll,hy=p
    for side,upper,uv,lower,lv,pp,av in eyes:
        top=tl if side=='Left' else tr
        slant=(8 if side=='Left' else -8) if name in ['angry','annoyed'] else 0
        # Each lid deforms with the same aperture; no white can escape a blink.
        up=[(-35,2-slant),(0,top),(35,-4+slant)]
        down=[(-35,2-slant),(0,bottom),(35,-4+slant)]
        if name=='happy':up=[(-35,2),(0,-13),(35,-4)];down=up
        pose_path(a,uv,up,handle_scale=2);pose_path(a,lv,down,handle_scale=2)
        pose_path(a,av,[up[0],up[1],up[2],down[1]],True,handle_scale=1.65)
        static(a,pp,16,max(.01,pupil));static(a,pp,17,max(.01,pupil));static(a,pp,18,1 if pupil else 0);static(a,pp,14,py)
    for side,pose,bv in brows:
        static(a,pose,14,bl if side=='Left' else br);static(a,pose,15,rl if side=='Left' else rr)
        pose_path(a,bv,[(-38,4),(0,-9),(37,-7),(9,-17),(-21,-7)],True)
    # Lips follow the expressive seam when closed and frame the opening otherwise.
    up=[(-w/2,0),(0,smile if gap else smile-2),(w/2,0)]
    down=[(-w/2,0),(0,smile+gap if gap else smile+4),(w/2,0)]
    if name in ['fear','angry']:
        up=[(-w/2,5),(0,-gap*.5),(w/2,5)];down=[(-w/2,5),(0,gap*.6),(w/2,5)]
    if name in ['surprise','curious']:
        up=[(-w/2,0),(0,-gap*.5),(w/2,0)];down=[(-w/2,0),(0,gap*.5),(w/2,0)]
    pose_path(a,ruv,up);pose_path(a,rlv,down)
    pose_path(a,rv,[up[0],up[1],up[2],down[1]],True)
    static(a,rest_open,18,1 if gap else 0)
    static(a,rest_teeth,18,1 if name in ['happy','surprised','angry','fear'] else 0)
    static(a,rest_teeth,14,up[1][1]+5);static(a,rtg,20,w*.85)
    static(a,emotional,15,roll);static(a,emotional,14,hy)

E.indent(r,space='    ');E.ElementTree(r).write(project/'scene.rml',encoding='unicode')
print(f'Girl: {len(props)} properties, 7 states / 12 poses, independent continuous mouth')
