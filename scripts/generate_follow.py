"""Extend alinazari's editable Follow source, preserving its original pose animations.
The pristine imported source is kept separately so rebuilding is deterministic.
"""
from pathlib import Path
import math
import xml.etree.ElementTree as E

project = Path(__file__).resolve().parents[1] / 'rive-follow'
r = E.parse(project / 'source/original.xml').getroot()
serial = 20000

def find(id): return r.find(f'.//*[@id="{id}"]')
def el(parent, tag, **attrs):
    global serial
    serial += 1
    return E.SubElement(parent, tag, {**{k:str(v) for k,v in attrs.items()}, 'id':f'9:{serial}'})
def bind(parent, prop, key):
    el(parent, 'DataBindContext', sourcePathIds=f'1:5406-{props[prop]}', propertyKey=key)
def key(animation, obj, prop, values):
    ko=el(animation,'KeyedObject',objectId=obj.get('id'))
    kp=el(ko,'KeyedProperty',propertyKey=prop)
    for frame,value in values: el(kp,'KeyFrameDouble',frame=frame,value=value,interpolationType='linear')
def static(animation,obj,prop,value): key(animation,obj,prop,[(0,value)])
def stroke(shape, thickness=6):
    s=el(shape,'Stroke',thickness=thickness,cap='round',join='round')
    el(s,'SolidColor',colorValue='FF111111')
def fill(shape,color): el(el(shape,'Fill'),'SolidColor',colorValue=color)
def ellipse(parent,name,x,y,width,height,color):
    s=el(parent,'Shape',name=name,x=x,y=y)
    g=el(s,'Ellipse',width=width,height=height,originX=.5,originY=.5)
    fill(s,color)
    return s,g

def path(parent,name,points,closed=False,color=None,thickness=6):
    s=el(parent,'Shape',name=name)
    p=el(s,'PointsPath',isClosed=str(closed).lower())
    # Smooth cubic tangents from neighboring vertices.
    vs=[]
    for i,(x,y) in enumerate(points):
        prev=points[(i-1)%len(points)] if closed or i else points[i]
        nxt=points[(i+1)%len(points)] if closed or i+1<len(points) else points[i]
        dx=(nxt[0]-prev[0])/6;dy=(nxt[1]-prev[1])/6
        vs.append(el(p,'CubicDetachedVertex',x=x,y=y,inRotation=math.atan2(-dy,-dx),outRotation=math.atan2(dy,dx),inDistance=math.hypot(dx,dy),outDistance=math.hypot(dx,dy)))
    if color:fill(s,color)
    if thickness:stroke(s,thickness)
    return s,vs

vm=find('1:5406');vm.set('name','FollowFace')
instance=find('1:5407');instance.set('name','Default')
defaults=dict(emotion=0,intensity=.8,eyeOpen=1,leftEyeScale=1,rightEyeScale=1,
    browRaiseLeft=0,browRaiseRight=0,mouthWidth=58,mouthHeight=4,
    restWeight=1,speechWeight=0,mouthLift=0,mouthStretch=1,cheekRaise=0,
    noseWrinkle=0,headTilt=0,breath=0,teethVisible=0,nativeBlink=1)
props={name:el(vm,'ViewModelPropertyNumber',name=name).get('id') for name in defaults}
for name,value in defaults.items():el(instance,'ViewModelInstanceNumber',viewModelPropertyId=props[name],propertyValue=value)
ab=find('1:5394');ab.set('name','Follow');ab.set('includeInExport','true')
# A direct artboard gives each renderer its own facial view-model instance.
# The original Main artboard is retained in the editable file.
find('1:12427').set('includeInExport','true')
face=find('1:5591');sm=find('1:5399')
# Repair imported hover listeners targeting a non-drawable grouping node.
for listener in sm.findall('StateMachineListener'):
    if listener.get('targetId')=='1:5612':listener.set('targetId','1:5516')
# The original export includes two orphaned editor easing bindings.
for parent in r.iter():
    for child in list(parent):
        if child.tag=='DataBindContext' and child.get('sourcePathIds','').startswith('1:14-'):parent.remove(child)


# Keep the original blink animation available in the editor. The web framework
# can mute this layer when it owns auto/manual blinking itself.
blink_state=find('1:11318');blink_state.tag='BlendState1DViewModel';blink_state.attrib.pop('animationId',None)
bp=el(blink_state,'BindablePropertyNumber');bind(bp,'nativeBlink',636)
blink_off=el(ab,'LinearAnimation',name='Blink · External control',duration=60)
el(blink_state,'BlendAnimation1D',animationId=blink_off.get('id'),value=0)
el(blink_state,'BlendAnimation1D',animationId='1:11261',value=1)
# Retain all original animated objects/IDs; hide the old mouths behind the new rig.
mouth=find('1:12401');mouth.tag='Node';mouth.attrib.pop('activeComponentId',None)
for old in list(mouth):old.set('opacity','0');old.set('hidden','true')
anchor=el(mouth,'Node',name='Speech and expression anchor',x=0,y=-4)
for id,frames in [('1:9707',[(1,30),(11,0)]),('1:8533',[(0,0),(10,30)])]:key(find(id),anchor,13,frames)
overlay=el(anchor,'Node',name='JEV mouth overlay');bind(overlay,'mouthLift',14);bind(overlay,'mouthStretch',16)
rest=el(overlay,'Node',name='Emotional mouth');bind(rest,'restWeight',18)
rest_line,vertices=path(rest,'Rest lip contour',[(-28,0),(0,7),(28,0)],thickness=7)
rest_teeth,_=ellipse(rest,'Emotional teeth',0,1,60,13,'FFFFFFFF')
rest_open,rest_vertices=path(rest,'Emotional aperture',[(-28,0),(0,3),(28,0),(0,20)],closed=True,color='FF111111',thickness=0)
rest_open.set('opacity','0')
el(rest_teeth,'ClippingShape',sourceId=rest_open.get('id'))
# Front-to-back order follows the imported file: teeth before cavity.
speech=el(overlay,'Node',name='Continuous speech');bind(speech,'speechWeight',18)
teeth,tg=ellipse(speech,'Upper teeth',0,-12,45,17,'FFFFFFFF');bind(teeth,'teethVisible',18)
tongue,_=ellipse(speech,'Tongue',0,18,31,15,'FF858585')
cavity,geo=ellipse(speech,'Speech aperture',0,0,58,4,'FF111111')
bind(geo,'mouthWidth',20);bind(geo,'mouthHeight',21)
for shape in [teeth,tongue]:el(shape,'ClippingShape',sourceId=cavity.get('id'))
# Ellipse dimensions are bound directly, avoiding stretched outlines.

brows=[];eye_poses=[];cheeks=[]
for index,(eye_id,x) in enumerate([('1:5477',-47.596497),('1:5480',50.093506)]):
    side='Left' if index==0 else 'Right'
    eye=find(eye_id);face.remove(eye)
    origin=el(face,'Node',name=side+' eye anchor',x=x,y=-20.958832)
    pose=el(origin,'Node',name=side+' emotional eyelid');eye_poses.append(pose)
    manual=el(pose,'Node',name=side+' manual eyelid');bind(manual,'leftEyeScale' if index==0 else 'rightEyeScale',17)
    blink=el(manual,'Node',name='External blink');bind(blink,'eyeOpen',17)
    blink.append(eye);eye.set('x','0');eye.set('y','0')
    for ko in r.findall(f'.//KeyedObject[@objectId="{eye_id}"]'):
        for kp in ko.findall('KeyedProperty'):
            offset=x if kp.get('propertyKey')=='13' else -20.958832 if kp.get('propertyKey')=='14' else None
            if offset is not None:
                for k in kp.findall('KeyFrameDouble'):k.set('value',str(float(k.get('value','0'))-offset))
    brow_origin=el(face,'Node',name=side+' brow anchor',x=x,y=-80)
    brow=el(brow_origin,'Node',name=side+' emotional brow');brows.append(brow)
    manual_brow=el(brow,'Node',name=side+' JEV brow');bind(manual_brow,'browRaise'+side,14)
    path(manual_brow,side+' eyebrow',[(-16,2),(0,-3),(16,1)],thickness=6)
    cheek=el(face,'Node',name=side+' cheek',x=x,y=49)
    manual_cheek=el(cheek,'Node',name='Cheek lift');bind(manual_cheek,'cheekRaise',14)
    s,_=path(manual_cheek,'Smile crease',[(-10,0),(0,3),(9,1)],thickness=3)
    cheeks.append(s)
# Nose tension stays subtle and inherits the original facial perspective.
nose=el(face,'Node',name='Nose tension',x=3,y=19);bind(nose,'noseWrinkle',18)
path(nose,'Nose crease',[(-6,-1),(0,-4),(6,-1)],thickness=2)
# Dedicated wrapper lets gestures coexist with original IK and head animations.
head=find('1:5612');parent=find('1:11986');parent.remove(head)
head_overlay=el(parent,'Node',name='JEV head gesture');bind(head_overlay,'headTilt',15);bind(head_overlay,'breath',14);head_overlay.append(head)

names=['neutral','happy','sad','curious','surprised','angry']
layer=el(sm,'StateMachineLayer',name='Expressions · JEV')
el(layer,'AnyState',x=-300,y=-200);el(layer,'ExitState',x=800,y=-200)
entry=el(layer,'EntryState',x=-250,y=0)
states={};anims={}
for i,name in enumerate(names):
    state=el(layer,'BlendState1DViewModel',x=(i%3)*260,y=(i//3)*240)
    bp=el(state,'BindablePropertyNumber');bind(bp,'intensity',636)
    states[name]=state;anims[name]=el(ab,'LinearAnimation',name='Expression · '+name,duration=60,fps=60)
for name,state in states.items():
    el(state,'BlendAnimation1D',animationId=anims['neutral'].get('id'),value=0)
    el(state,'BlendAnimation1D',animationId=anims[name].get('id'),value=1)
    for i,other in enumerate(names):
        if name==other:continue
        t=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=280)
        cond=el(t,'TransitionViewModelCondition',opValue='equal')
        comp=el(cond,'TransitionPropertyViewModelComparator')
        bp=el(comp,'BindablePropertyNumber');bind(bp,'emotion',636)
        el(cond,'TransitionValueNumberComparator',value=i)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))
# Mouth curvature, aperture, asymmetric brows and eyelids form each native pose.
#           width curve opening browL/R rotations eyeL/R cheek
poses=[(56,7,0,0,0,0,0,1,1,0),
       (68,13,20,-5,-5,-.08,.08,.65,.65,.8),
       (48,-8,0,-3,-3,-.32,.32,.8,.8,0),
       (45,3,0,-13,1,-.2,-.13,1.15,.65,0),
       (32,0,38,-16,-16,-.1,.1,1.5,1.5,0),
       (56,-5,0,5,5,.33,-.33,.58,.58,.2)]
for name,pose in zip(names,poses):
    a=anims[name];w,curve,opening,bl,br,rl,rr,le,re,cheek=pose
    for vertex,x,y in zip(vertices,[-w/2,0,w/2],[0,curve,0]):static(a,vertex,24,x);static(a,vertex,25,y)
    static(a,rest_line,18,0 if opening else 1)
    static(a,rest_open,18,1 if opening else 0)
    static(a,rest_teeth,18,1 if name=='happy' else 0)
    aperture_points=[(-w/2,0),(0,3),(w/2,0),(0,opening)] if name=='happy' else [(-w/2,0),(0,-opening/2),(w/2,0),(0,opening/2)]
    for v,(x,y) in zip(rest_vertices,aperture_points):static(a,v,24,x);static(a,v,25,y)
    for b,y,rot in zip(brows,[bl,br],[rl,rr]):static(a,b,14,y);static(a,b,15,rot)
    for eye,scale in zip(eye_poses,[le,re]):static(a,eye,17,scale)
    for c in cheeks:static(a,c,18,cheek)

E.indent(r,space='    ')
E.ElementTree(r).write(project/'scene.rml',encoding='unicode')
print(f'Follow: {len(props)} numeric properties, 6 native expressions, continuous speech geometry')
