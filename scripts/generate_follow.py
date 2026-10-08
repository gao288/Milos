"""Extend alinazari's editable Follow source, preserving its original pose animations.
The pristine imported source is kept separately so rebuilding is deterministic.
"""
from pathlib import Path
import math
import json
import subprocess
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
    browRaiseLeft=0,browRaiseRight=0,
    restWeight=1,speechWeight=0,mouthLift=0,mouthStretch=1,cheekRaise=0,
    noseWrinkle=0,headTilt=0,breath=0,teethVisible=0,nativeBlink=1)
mouth_contract=json.loads(subprocess.check_output([
    'node','--input-type=module','-e',
    "import { FOLLOW_MOUTH_DEFAULTS, LIP_POINTS } from './src/characters/follow-mouth.js'; console.log(JSON.stringify({defaults:FOLLOW_MOUTH_DEFAULTS,points:LIP_POINTS}));"
],cwd=project.parent,text=True))
defaults.update(mouth_contract['defaults'])
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
rest_teeth,rest_teeth_geometry=ellipse(rest,'Emotional teeth',0,1,60,13,'FFFFFFFF')
rest_open,rest_vertices=path(rest,'Emotional aperture',[(-28,0),(-20,-4),(0,-5),(20,-4),(28,0),(20,14),(0,20),(-20,14)],closed=True,color='FF111111',thickness=3)
rest_open.set('opacity','0')
el(rest_teeth,'ClippingShape',sourceId=rest_open.get('id'))
# Front-to-back order follows the imported file: teeth before cavity.
speech=el(overlay,'Node',name='Continuous speech');bind(speech,'speechWeight',18)
teeth,tg=ellipse(speech,'Upper teeth',0,-4,46,8,'FFFFFFFF')
bind(teeth,'teethVisible',18);bind(teeth,'teethX',13);bind(tg,'teethWidth',20)
lower_teeth,ltg=ellipse(speech,'Lower teeth',0,9,43,5,'FFE4E4E4')
bind(lower_teeth,'teethVisible',18);bind(lower_teeth,'lowerTeethX',13);bind(lower_teeth,'lowerTeethY',14)
tongue,_=ellipse(speech,'Tongue',0,12,30,14,'FF858585')
bind(tongue,'tongueX',13);bind(tongue,'tongueY',14)
cavity=el(speech,'Shape',name='Articulated lip contour')
contour=el(cavity,'PointsPath',name='Eight lip control points',isClosed='true')
for prefix in mouth_contract['points']:
    attrs={name:defaults[prefix+suffix] for name,suffix in [
        ('x','X'),('y','Y'),('inRotation','InRotation'),('inDistance','InDistance'),
        ('outRotation','OutRotation'),('outDistance','OutDistance')]}
    vertex=el(contour,'CubicDetachedVertex',name=prefix,**attrs)
    for suffix,property_key in [('X',24),('Y',25),('InRotation',84),('InDistance',85),('OutRotation',86),('OutDistance',87)]:
        bind(vertex,prefix+suffix,property_key)
fill(cavity,'FF111111');stroke(cavity,3)
for shape in [teeth,lower_teeth,tongue]:el(shape,'ClippingShape',sourceId=cavity.get('id'))

brows=[];eye_poses=[];cheeks=[];eye_rigs=[];brow_vertices=[]
for index,(eye_id,x) in enumerate([('1:5477',-47.596497),('1:5480',50.093506)]):
    side='Left' if index==0 else 'Right'
    eye=find(eye_id);face.remove(eye)
    # A grouping node preserves the original animated transform/IDs, with the
    # highlight drawn in front of its pupil fill rather than behind that shape.
    ink_children=list(eye);eye.tag='Node'
    for child in ink_children:eye.remove(child)
    pupil_ink=el(eye,'Shape',name=side+' pupil ink')
    for child in ink_children:pupil_ink.append(child)
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
    # Actual eyelids, not scaled pupil dots. The invisible aperture clips the
    # original gaze-animated pupil, while both lids deform independently.
    pupil_pose=el(blink,'Node',name=side+' pupil expression')
    blink.remove(eye);pupil_pose.append(eye)
    upper,uv=path(blink,side+' upper eyelid',[(-29,0),(0,-3),(29,0)],thickness=6)
    lower,lv=path(blink,side+' lower eyelid',[(-27,14),(0,21),(27,14)],thickness=4)
    aperture,av=path(blink,side+' eye opening',[(-33,0),(0,-3),(33,0),(33,30),(0,34),(-33,30)],closed=True,thickness=0)
    serial += 2  # Retire the old Fill/SolidColor IDs; keep subsequent rig IDs stable.
    # A clipping source must have no paint. ClippingShape.isVisible does not
    # suppress its Fill; a painted source would flash across the face outline.
    el(pupil_ink,'ClippingShape',sourceId=aperture.get('id'))
    # Preserve the face silhouette at extreme turns.
    for lid in [upper,lower]:el(lid,'ClippingShape',sourceId='1:5516')
    glint,_=ellipse(eye,side+' pupil highlight',-2,-3,5,5,'FFFFFFFF')
    eye.remove(glint);eye.insert(0,glint)
    el(glint,'ClippingShape',sourceId=aperture.get('id'))
    eye_rigs.append((pupil_pose,upper,uv,lower,lv,av,glint))
    brow_origin=el(face,'Node',name=side+' brow anchor',x=x,y=-80)
    brow=el(brow_origin,'Node',name=side+' emotional brow');brows.append(brow)
    manual_brow=el(brow,'Node',name=side+' JEV brow');bind(manual_brow,'browRaise'+side,14)
    _,bv=path(manual_brow,side+' eyebrow',[(-21,2),(0,-5),(21,1)],thickness=7)
    brow_vertices.append(bv)
    cheek=el(face,'Node',name=side+' cheek',x=x,y=49)
    manual_cheek=el(cheek,'Node',name='Cheek lift');bind(manual_cheek,'cheekRaise',14)
    s,_=path(manual_cheek,'Smile crease',[(-10,0),(0,3),(9,1)],thickness=3)
    cheeks.append(s)
# Nose tension stays subtle and inherits the original facial perspective.
nose=el(face,'Node',name='Nose tension',x=3,y=19);bind(nose,'noseWrinkle',18)
path(nose,'Nose crease',[(-6,-1),(0,-4),(6,-1)],thickness=2)
# Dedicated wrapper lets gestures coexist with original IK and head animations.
head=find('1:5612');parent=find('1:11986');parent.remove(head)
head_overlay=el(parent,'Node',name='JEV head gesture');bind(head_overlay,'headTilt',15);bind(head_overlay,'breath',14);
expression_head=el(head_overlay,'Node',name='Expression head posture');expression_head.append(head)

# Skin the existing jaw contour and its neck shadow. Original turn animations
# still animate these vertices; two bones add jaw movement on top of that pose.
# The bind matrices use path-local coordinates. Both bones inherit the shape's
# current world transform, so the original IK/turn/gesture transforms remain live.
for shape_id in ['1:5516','1:11821']:
    shape=find(shape_id);face_path=shape.find('PointsPath')
    face_vertices=list(face_path)
    fixed=el(shape,'RootBone',name='Fixed upper face',length=35)
    pivot=el(shape,'Node',name='Mandible pivot',x=49.344177,y=100)
    jaw_bone=el(pivot,'RootBone',name='Continuous jaw',length=60)
    bind(jaw_bone,'jawX',90);bind(jaw_bone,'jawY',91);bind(jaw_bone,'jawScale',16)
    skin=el(face_path,'Skin',name='Additive jaw deformation')
    el(skin,'Tendon',boneId=fixed.get('id'))
    el(skin,'Tendon',boneId=jaw_bone.get('id'),tx=49.344177,ty=100)
    for vertex,amount in zip(face_vertices,[0,.1,.6,1,.85,.2,0,0]):
        moving=round(amount*255);packed=(255-moving)+(moving<<8)
        el(vertex,'CubicWeight',values=packed,indices=513,inValues=packed,inIndices=513,outValues=packed,outIndices=513)

# Seven semantic states; intensity follows authored intermediate poses instead
# of merely scaling one drawing. Values 0..5 retain the original public indices.
names=['neutral','happy','sad','curious','surprised','angry','fear']
layer=el(sm,'StateMachineLayer',name='Expressions · JEV')
el(layer,'AnyState',x=-300,y=-200);el(layer,'ExitState',x=800,y=-200)
entry=el(layer,'EntryState',x=-250,y=0)
states={};anims={}
# w, curve, opening, brow Y L/R, brow rotation L/R, top Y L/R,
# lid arch L/R (negative=crescent), pupil size L/R, pupil Y, lower tension,
# cheek, head roll, head Y. All coordinates are local authored geometry.
poses={
 'neutral': (56,7,0, 0,0,0,0, -4,-6,-2,-2, 1,1,4,0,0,0,0),
 'warm': (65,15,0, -6,-6,-.08,.08, 5,5,-12,-12, 0,0,0,0,.6,-.035,0),
 'happy': (78,17,42, -14,-14,-.10,.10, 4,4,-19,-19, 0,0,0,0,1,.025,-7),
 'empathy': (50,5,0, -4,-4,-.38,.38, -1,-1,3,3, .95,.95,7,.45,0,-.03,3),
 'sad': (50,-13,0, -5,-5,-.53,.53, 5,5,5,5, .8,.8,12,.6,0,-.055,9),
 'curious': (27,0,13, -19,5,-.18,-.14, -28,1,-3,-2, 1.25,.8,2,.1,0,.06,0),
 'surprise': (27,0,28, -20,-20,-.12,.12, -29,-29,-7,-7, .68,.68,0,.15,0,0,-4),
 'surprised': (54,12,33, -18,-18,-.10,.10, -29,-29,-9,-9, 1.8,1.8,0,.15,.4,.035,-6),
 'annoyed': (48,-4,0, 4,4,.22,-.22, 1,1,-1,-1, .9,.9,6,.12,0,.025,1),
 'angry': (68,-8,24, -3,-3,.48,-.48, -2,-2,0,0, .85,.85,5,.7,.4,0,5),
 'uneasy': (48,-7,0, -9,-6,-.42,.3, -19,-15,-3,-3, .8,.8,2,.8,0,-.035,-2),
 'fear': (73,-8,37, -16,-16,-.52,.52, -33,-33,-7,-7, .48,.48,0,1,0,-.02,-9),
}
for name in poses:
    anims[name]=el(ab,'LinearAnimation',name='Expression · '+name,duration=60,fps=60)
midpoints={'happy':'warm','sad':'empathy','surprised':'surprise','angry':'annoyed','fear':'uneasy'}
for i,name in enumerate(names):
    state=el(layer,'BlendState1DViewModel',x=(i%3)*260,y=(i//3)*240)
    bp=el(state,'BindablePropertyNumber');bind(bp,'intensity',636)
    states[name]=state
    el(state,'BlendAnimation1D',animationId=anims['neutral'].get('id'),value=0)
    if name in midpoints:el(state,'BlendAnimation1D',animationId=anims[midpoints[name]].get('id'),value=.5)
    el(state,'BlendAnimation1D',animationId=anims[name].get('id'),value=1)
for name,state in states.items():
    for i,other in enumerate(names):
        if name==other:continue
        t=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=320)
        cond=el(t,'TransitionViewModelCondition',opValue='equal')
        comp=el(cond,'TransitionPropertyViewModelComparator')
        bp=el(comp,'BindablePropertyNumber');bind(bp,'emotion',636)
        el(cond,'TransitionValueNumberComparator',value=i)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))

def pose_path(a,vs,points,closed=False):
    # Animate handles together with vertices so every intensity stays smooth.
    for i,(v,(x,y)) in enumerate(zip(vs,points)):
        prev=points[(i-1)%len(points)] if closed or i else points[i]
        nxt=points[(i+1)%len(points)] if closed or i+1<len(points) else points[i]
        dx=(nxt[0]-prev[0])/6;dy=(nxt[1]-prev[1])/6
        for prop,val in [(24,x),(25,y),(84,math.atan2(-dy,-dx)),(85,math.hypot(dx,dy)),(86,math.atan2(dy,dx)),(87,math.hypot(dx,dy))]:static(a,v,prop,val)

for name,pose in poses.items():
    a=anims[name]
    w,curve,opening,bl,br,rl,rr,tl,tr,al,ar,pl,pr,py,tension,cheek,roll,hy=pose
    pose_path(a,vertices,[(-w/2,0),(0,curve),(w/2,0)])
    static(a,rest_line,18,0 if opening else 1)
    static(a,rest_open,18,1 if opening else 0)
    static(a,rest_teeth,18,1 if name in ['happy','surprised','angry','fear'] else 0)
    static(a,rest_teeth,14,-3 if name in ['fear','angry'] else 1)
    static(a,rest_teeth_geometry,21,7 if name in ['fear','angry'] else 13)
    static(a,rest_teeth_geometry,20,w*.82)
    if name in ['happy','surprised']:
        aperture_points=[(-w/2,0),(-w*.3,3),(0,4),(w*.3,3),(w/2,0),(w*.3,opening*.7),(0,opening),(-w*.3,opening*.7)]
    elif name in ['fear','angry']:
        aperture_points=[(-w/2,8),(-w*.35,-opening*.35),(0,-opening*.5),(w*.35,-opening*.35),(w/2,8),(w*.35,opening*.4),(0,opening*.22),(-w*.35,opening*.4)]
    else:
        aperture_points=[(-w/2,0),(-w*.35,-opening*.4),(0,-opening/2),(w*.35,-opening*.4),(w/2,0),(w*.35,opening*.4),(0,opening/2),(-w*.35,opening*.4)]
    pose_path(a,rest_vertices,aperture_points,True)
    for b,bv,y,rot in zip(brows,brow_vertices,[bl,br],[rl,rr]):
        static(a,b,14,y);static(a,b,15,rot)
        pose_path(a,bv,[(-21,2),(0,-6 if name not in ['angry','fear'] else -2),(21,1)])
    for eye in eye_poses:static(a,eye,17,1)
    for index,(rig,top,arch,pupil) in enumerate(zip(eye_rigs,[tl,tr],[al,ar],[pl,pr])):
        pp,upper,uv,lower,lv,av,glint=rig
        slant=(10 if index==0 else -10) if name=='angry' else 0
        static(a,glint,18,1 if name=='surprised' else 0)
        static(a,pp,16,max(.01,pupil));static(a,pp,17,max(.01,pupil));static(a,pp,18,1 if pupil else 0);static(a,pp,14,py)
        pose_path(a,uv,[(-29,top-slant),(0,top+arch),(29,top+slant)])
        static(a,upper,18,1 if top>-20 or name=='fear' else .25)
        pose_path(a,lv,[(-26,19),(0,23-7*tension),(26,19)])
        static(a,lower,18,tension)
        pose_path(a,av,[(-36,top-slant),(0,top+arch),(36,top+slant),(36,36),(0,39),(-36,36)],True)
    for c in cheeks:static(a,c,18,cheek)
    static(a,expression_head,15,roll);static(a,expression_head,14,hy)

E.indent(r,space='    ')
E.ElementTree(r).write(project/'scene.rml',encoding='unicode')
print(f'Follow: {len(props)} numeric properties, 7 native expressions / 12 authored poses, continuous speech geometry')
