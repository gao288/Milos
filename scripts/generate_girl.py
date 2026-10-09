"""Animate marvin.te's original Girl artwork through native controller keyframes.

All source paths, vertices, fills, gradients and skin bindings stay intact.
Expression poses and continuous speech add offsets to the existing controllers.
"""
from pathlib import Path
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
ab=find('1:2');ab.set('name','Girl');ab.set('width','1080');ab.set('height','1080')
vm=find('1:8619');vm.set('name','GirlFace');instance=find('1:8620');instance.set('name','Default')
mouth_contract=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import { FOLLOW_MOUTH_DEFAULTS, LIP_POINTS } from './src/characters/follow-mouth.js'; import { GIRL_MOUTH_DEFAULTS } from './src/characters/girl-mouth.js'; console.log(JSON.stringify({defaults:{...FOLLOW_MOUTH_DEFAULTS,...GIRL_MOUTH_DEFAULTS},points:LIP_POINTS}));"],cwd=project.parent,text=True))
defaults=dict(nativeBlink=-.56,emotion=0,intensity=1,eyeOpen=1,leftEyeScale=1,rightEyeScale=1,
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
    if e.get('viewModelPropertyId')=='1:8624':e.set('propertyValue','1100')
    if e.get('viewModelPropertyId')=='1:8621':e.set('propertyValue','540')
# Preserve bones and their world-space bind poses by leaving all original
# transforms untouched; head tilt uses an extra parent around the character.
character=find('1:16685');idx=list(ab).index(character);ab.remove(character)
base=el(ab,'Node',name='Milos character pivot',x=550,y=830)
ab.remove(base);ab.insert(idx,base)
emotional=el(base,'Node',name='Expression posture')
manual=el(emotional,'Node',name='Head tilt and breath');bind(manual,'headTilt',15);bind(manual,'breath',14)
restore=el(manual,'Node',x=-640,y=-830);restore.append(character)



# Keep every source Shape, PointsPath, vertex, fill and gradient. Only controller
# transforms / timelines are added. Imported DrawRules hid the nested irises;
# make the original pupil/iris ordering explicit without redrawing either.
for parent in list(r.iter()):
    for c in list(parent):
        if c.tag=='DrawRules':parent.remove(c)
for id,x,y in [('1:75',-3,-36),('1:175',-17,-17),('1:94',0,-2),('1:187',0,-2)]:
    obj=find(id);obj.set('x',str(x));obj.set('y',str(y))
    for c in obj:
        if c.tag=='FollowPathConstraint':c.set('strength','0')
iris_poses=[]
for irisid,pupilid,parentid,clipid in [('1:75','1:94','1:163','1:1909'),('1:175','1:187','1:225','1:3557')]:
    iris=find(irisid);pupil=find(pupilid);parent=find(parentid)
    iris.remove(pupil);parent.remove(iris)
    gaze=el(parent,'Node',name='Original iris gaze');parent.remove(gaze);parent.insert(1,gaze)
    bind(gaze,'gazeX',13);bind(gaze,'gazeY',14)
    pose=el(gaze,'Node',name='Original iris expression',x=iris.get('x'),y=iris.get('y'));iris_poses.append(pose)
    pupil.set('x','0');pupil.set('y','-2');iris.set('x','0');iris.set('y','0')
    pose.append(pupil);pose.append(iris)
    el(pupil,'ClippingShape',sourceId=clipid)
bind(find('1:1025'),'nativeBlink',299)

def wrap(id,name,**attrs):
    obj=find(id)
    parent=next(p for p in r.iter() if obj in list(p))
    index=list(parent).index(obj);parent.remove(obj)
    node=el(parent,'Node',name=name,**attrs);parent.remove(node);parent.insert(index,node);node.append(obj)
    return node

brows={};eyes={};brow_points={}
for side,browid,eyeid in [('Left','1:5583','1:225'),('Right','1:5264','1:163')]:
    brows[side]=wrap(browid,side+' original brow expression')
    bind(wrap(browid,side+' manual brow'),'browRaise'+side,14)
    eyes[side]=wrap(eyeid,side+' original eyelid expression')
    bind(wrap(eyeid,side+' manual eyelid'),side.lower()+'EyeScale',17)
for side,groupid in [('Right','1:5240'),('Left','1:5582')]:
    controls=[c for c in find(groupid) if c.tag=='Node']
    xs=[float(c.get('x','0')) for c in controls];mid=(min(xs)+max(xs))/2;span=(max(xs)-min(xs))/2
    brow_points[side]=[(wrap(c.get('id'),side+' original brow key'),(x-mid)/span) for c,x in zip(controls,xs)]
manual_lips=wrap('1:5960','Original lips manual pose');bind(manual_lips,'mouthLift',14);bind(manual_lips,'mouthStretch',16)
# Each control retains its original skinned vertices and Bezier handles. The
# expression timeline and speech deltas have separate, additive parent nodes.
stations={
 'cornerLeft':['1:5807','1:5853','1:5916'],
 'upperLeft':['1:5806','1:5915','1:8501','1:8502'],
 'upperCenter':['1:5808'],
 'upperRight':['1:5920','1:8503'],
 'cornerRight':['1:5809','1:5855','1:5919'],
 'lowerRight':['1:5918','1:8698'],
 'lowerCenter':['1:5852','1:5854','1:8697'],
 'lowerLeft':['1:5917','1:8699'],
}
lip_poses={}
for station,ids in stations.items():
    lip_poses[station]=[]
    for id in ids:
        pose=wrap(id,'Original lip pose '+station);lip_poses[station].append(pose)
        speech=wrap(id,'Speech delta '+station)
        for axis,key in [('X',13),('Y',14)]:bind(speech,'girl'+station[0].upper()+station[1:]+axis,key)
for id,lip in [('1:5813','Upper'),('1:5860','Lower')]:
    tangent=wrap(id,'Original '+lip+' right lip tangent')
    for axis,key in [('X',13),('Y',14)]:bind(tangent,'girl'+lip+'RightHandle'+axis,key)
jaws=[]
for id in ['1:6813','1:6814','1:6815','1:6816']:
    jaws.append(wrap(id,'Original jaw expression'))
    jaw=wrap(id,'Continuous jaw');bind(jaw,'jawX',13);bind(jaw,'jawY',14)
for id in ['1:8376','1:8412']:
    bind(wrap(id,'Original cheek lift'),'cheekRaise',14)

# Source happy is a 162-object authored timeline, accessed by its original
# joystick. Other poses key the original feature controllers around that base.
# happy amount, eyelid scale L/R, brow Y L/R, brow roll L/R, corner lift,
# upper lip lift, lower lip drop, lip width delta, head roll, head Y.
poses={
 'neutral':(0,1,1,0,0,0,0,0,0,0,0,0,0),
 'warm':(.25,.95,.95,0,0,0,0,-1,0,1,0,-.025,0),
 'happy':(1,.75,.75,0,0,0,0,-4,-2,13,3,.025,-6),
 'empathy':(0,.9,.9,-3,-3,-.14,.14,2,-3,-3,-1,-.025,4),
 'sad':(0,.72,.72,-3,-3,-.26,.26,5,-14,-14,-3,-.05,9),
 'curious':(0,.85,1.16,2,-12,0,.05,0,-1,2,-5,.055,0),
 'surprise':(0,1.3,1.3,-14,-14,-.03,.03,2,-6,14,-12,0,-3),
 'surprised':(.15,1.25,1.25,-12,-12,0,0,-2,-3,13,2,.02,-4),
 'uneasy':(0,1.08,1.08,-5,-5,-.18,.18,4,-8,-6,-1,-.025,-2),
 'fear':(0,1.35,1.35,-9,-9,-.26,.26,12,-12,10,5,-.03,-7),
 'annoyed':(0,.7,.7,3,3,.13,-.13,3,-7,-7,-1,.02,1),
 'angry':(0,.7,.7,6,6,.24,-.24,10,-12,-3,2,0,5),
}
names=['neutral','happy','sad','curious','surprised','angry','fear']
layer=el(sm,'StateMachineLayer',name='Original artwork expressions')
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
for name,values in poses.items():
    a=anims[name];happy,eyeL,eyeR,browL,browR,rollL,rollR,corner,upper,lower,width,roll,hy=values
    static(a,find('1:3052'),299,-1+2*happy)
    for side,ey,brow,rot in [('Left',eyeL,browL,rollL),('Right',eyeR,browR,rollR)]:
        static(a,eyes[side],17,ey);static(a,brows[side],14,brow)
        for obj,t in brow_points[side]:static(a,obj,14,rot*70*t)
    for obj in iris_poses:
        size=.78 if name=='fear' else .85 if name=='surprise' else 1
        static(a,obj,16,size);static(a,obj,17,size)
    for station,nodes in lip_poses.items():
        y=corner if station.startswith('corner') else upper if station.startswith('upper') else lower
        x=(-width if station.endswith('Left') else width if station.endswith('Right') else 0)
        for obj in nodes:static(a,obj,13,x);static(a,obj,14,y)
    for jaw in jaws:static(a,jaw,14,lower*.3)
    static(a,emotional,15,roll);static(a,emotional,14,hy)
E.indent(r,space='    ');E.ElementTree(r).write(project/'scene.rml',encoding='unicode')
print(f'Girl: original artwork, {len(props)} properties, 7 states / 12 keyed poses')
