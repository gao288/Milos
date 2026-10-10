"""Animate marvin.te's original Girl artwork through native controller keyframes.

All source paths, vertices, skin bindings and shape ids stay intact. Expression
poses and continuous speech add offsets to the existing controllers; the only
style edits are the documented palette calibration in scripts/girl_palette.py.
"""
from pathlib import Path
import json
import subprocess
import xml.etree.ElementTree as E

from girl_palette import PALETTE

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
def track(a, obj, prop, keys):
    """Keyed gesture: ease-out onset, slight overshoot, settle, then hold."""
    ko=el(a,'KeyedObject',objectId=obj.get('id'))
    kp=el(ko,'KeyedProperty',propertyKey=prop)
    for frame,value,ease in keys:
        k=el(kp,'KeyFrameDouble',frame=frame,value=value,interpolationType='cubic')
        el(k,'CubicEaseInterpolator',x1=ease[0],y1=ease[1],x2=ease[2],y2=ease[3])
# Calibrate the source palette to the approved concept sheet. Components are the
# original fills/gradient stops, matched by id and by their authored colour.
for id,(source,target,label) in PALETTE.items():
    component=find(id)
    assert component.get('colorValue')==source, f'palette drift on {id} ({label})'
    component.set('colorValue',target)
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
# The two eye "glow" copies are colour-dodge strokes authored over a pale iris.
# Against the concept's dark indigo iris they clip straight to white and erase
# the pupil, and this renderer draws their feather hard-edged. The crisp
# highlight strokes underneath (1:571 / 1:600) carry the glint on their own.
for id in ['1:1167','1:1517']:find(id).set('opacity','0')
# The cheek blush relies on a 27-strength feather. The web Canvas fallback
# paints flat discs even at reduced opacity. Hide the glow copies while keeping
# their original geometry available for an editor/rendering upgrade.
for id in ['1:5704','1:8400']:find(id).set('opacity','0')
sm=find('1:7');sm.set('name','Girl State Machine')
# Existing blink/delight timelines stay editable, but the new expression layer
# and framework blinking are their only live owners.
for child in list(sm):sm.remove(child)
# Drive the same damped controllers via view model data; no real mouse listener
# may override normalized gaze received from JEV/the runtime.
for c in list(find('1:533')):
    if c.tag=='DataBindContext':find('1:533').remove(c)
for e in instance:
    # Rest calibration: the source default put the head in near profile. This
    # cursor position makes both eyes and the mouth easier to read. Matching
    # the concept's more frontal face still requires further rig tuning.
    if e.get('viewModelPropertyId')=='1:8624':e.set('propertyValue','1060')
    if e.get('viewModelPropertyId')=='1:8621':e.set('propertyValue','730')
# Preserve bones and their world-space bind poses by leaving all original
# transforms untouched; head tilt uses an extra parent around the character.
character=find('1:16685');idx=list(ab).index(character);ab.remove(character)
base=el(ab,'Node',name='Milos character pivot',x=550,y=830,scaleX=.92,scaleY=.92)
ab.remove(base);ab.insert(idx,base)
emotional=el(base,'Node',name='Expression posture')
manual=el(emotional,'Node',name='Head tilt and breath');bind(manual,'headTilt',15);bind(manual,'breath',14)
restore=el(manual,'Node',x=-640,y=-830);restore.append(character)


# Keep every source Shape, PointsPath, vertex, fill and gradient component, with
# the palette edits declared above. Imported DrawRules hid the nested irises;
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
    # Rive draws the first child in front, so the gaze group has to take the
    # iris's own slot: lashes, highlights and the eye shadow stay over it.
    index=list(parent).index(iris)
    iris.remove(pupil);parent.remove(iris)
    gaze=el(parent,'Node',name='Original iris gaze');parent.remove(gaze);parent.insert(index,gaze)
    bind(gaze,'gazeX',13);bind(gaze,'gazeY',14)
    pose=el(gaze,'Node',name='Original iris expression',x=iris.get('x'),y=iris.get('y'))
    iris_poses.append((pose,float(iris.get('x')),float(iris.get('y'))))
    # The concept's pupil fills most of the iris; the source demo used a small
    # dot that reads as a washed highlight once the iris itself goes dark.
    pupil.set('x','0');pupil.set('y','-2');iris.set('x','0');iris.set('y','0')
    pupil.set('scaleX','1.42');pupil.set('scaleY','1.42')
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
# The head sits inside the body, so posing the whole character alone looks
# rigid. This wrapper lets the head lead and overshoot while the shoulders
# below arrive late and smaller — the follow-through the concept sheet implies.
head=wrap('1:7405','Expression head lead')
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
cheeks=[]
for id in ['1:8376','1:8412']:
    cheeks.append(wrap(id,'Original cheek expression'))
    bind(wrap(id,'Original cheek lift'),'cheekRaise',14)

# Source happy is a 162-object authored timeline, accessed by its original
# joystick. Other poses key the original feature controllers around that base.
# Signs follow Rive screen space: +y is down, so a positive corner is a frown.
# 'Left'/'Right' below are the rig's own labels: Left drives the far (small)
# eye and brow, Right the near (large) one.
P=lambda **kw:{**dict(happy=0,eyeL=1,eyeR=1,browL=0,browR=0,rollL=0,rollR=0,
    cornerL=0,cornerR=0,upper=0,lower=0,width=0,iris=1,irisY=0,irisX=0,
    cheek=0,roll=0,hy=0,hx=0),**kw}
poses={
 'neutral':P(),
 # Concept 02: asymmetric lift, one corner further up, cheek just starting.
 'warm':P(happy=.3,eyeL=.93,eyeR=.93,cornerL=-3,cornerR=-5,upper=-1,lower=2,width=2,
    cheek=-2,roll=-.03,hy=-1),
 # Concept 03: open laugh, squeezed lids, head thrown back a touch.
 'happy':P(happy=1,eyeL=.6,eyeR=.6,browL=-3,browR=-3,cornerL=-7,cornerR=-9,
    upper=-5,lower=17,width=5,cheek=-7,roll=.03,hy=-7),
 # Concept 05: inner brows up, soft lids, a small closed-lip sympathy frown.
 'empathy':P(eyeL=.80,eyeR=.80,browL=-5,browR=-6,rollL=-.40,rollR=.40,
    cornerL=6,cornerR=5,upper=-2,lower=-4,width=-4,irisY=2,roll=-.04,hy=6,hx=-1),
 # Concept 06: heavy inner-brow pitch, lids low, mouth pressed down and small.
 'sad':P(eyeL=.62,eyeR=.62,browL=-2,browR=-4,rollL=-.62,rollR=.62,
    cornerL=10,cornerR=8,upper=-4,lower=-9,width=-7,irisY=3,roll=-.07,hy=10,hx=-3),
 # Concept 04: one brow up, one level, slight smirk, head cocked.
 'curious':P(eyeL=.82,eyeR=1.18,browL=3,browR=-13,rollL=.10,rollR=.16,
    cornerL=-1,cornerR=-4,upper=-1,lower=1,width=-4,roll=.06,hy=-1,hx=2),
 # Concept 07: round eyes, high flat brows, small open 'oh'.
 'surprise':P(eyeL=1.34,eyeR=1.34,browL=-17,browR=-17,rollL=-.05,rollR=.05,
    cornerL=2,cornerR=2,upper=-8,lower=15,width=-14,iris=.84,irisY=-1,roll=0,hy=-4),
 # Concept 08: awe keeps the wide eyes but the mouth breaks into delight.
 'surprised':P(happy=.3,eyeL=1.28,eyeR=1.28,browL=-15,browR=-15,
    cornerL=-5,cornerR=-7,upper=-5,lower=15,width=3,cheek=-3,roll=.03,hy=-5),
 # Concept 09: unequal brows, one side of the mouth pulled back, lids tight.
 'uneasy':P(eyeL=1.10,eyeR=.84,browL=-9,browR=3,rollL=-.34,rollR=.40,
    cornerL=8,cornerR=1,upper=-3,lower=-5,width=-7,irisY=2,irisX=-2,roll=-.04,hy=-2,hx=-3),
 # Concept 10: whites all round the iris, brows up hard, jaw dropped open.
 'fear':P(eyeL=1.52,eyeR=1.52,browL=-13,browR=-13,rollL=-.42,rollR=.42,
    cornerL=9,cornerR=7,upper=-12,lower=22,width=-6,iris=.68,irisY=-2,
    roll=-.05,hy=-9,hx=-4),
 # Concept 11: brows down and angled in, lids low, mouth flat and off-centre.
 'annoyed':P(eyeL=.74,eyeR=.68,browL=4,browR=5,rollL=.34,rollR=-.30,
    cornerL=4,cornerR=1,upper=-3,lower=-6,width=-3,irisY=-1,roll=.03,hy=2),
 # Concept 12: hard inner-down brows, slit eyes, an open snarl.
 'angry':P(eyeL=.58,eyeR=.54,browL=8,browR=9,rollL=.62,rollR=-.58,
    cornerL=7,cornerR=4,upper=-7,lower=9,width=-9,irisY=-2,roll=0,hy=6,hx=3),
}
names=['neutral','happy','sad','curious','surprised','angry','fear']
layer=el(sm,'StateMachineLayer',name='Original artwork expressions')
el(layer,'AnyState',x=-260,y=-160);el(layer,'ExitState',x=600,y=-160);entry=el(layer,'EntryState',x=-260,y=0)
anims={name:el(ab,'LinearAnimation',name='Expression · '+name,duration=42,fps=60) for name in poses}
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
        t=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=150)
        c=el(t,'TransitionViewModelCondition',opValue='equal')
        bind(el(el(c,'TransitionPropertyViewModelComparator'),'BindablePropertyNumber'),'emotion',636)
        el(c,'TransitionValueNumberComparator',value=i)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))
# Each pose animation is a gesture, not a still: the crossfade only covers the
# first beat, then the features arrive on their own staggered curves. Faster
# features lead, the head follows through, and everything settles by frame 42.
SNAP=(.12,.9,.3,1);EASE=(.25,.6,.35,1);DRAG=(.3,.3,.4,1)
onsets={
 'brow':  lambda v:[(0,.35*v,SNAP),(7,1.14*v,SNAP),(19,.97*v,EASE),(30,v,EASE)],
 'eye':   lambda v,rest:[(0,rest+.4*(v-rest),SNAP),(6,rest+1.12*(v-rest),SNAP),
                         (18,rest+.98*(v-rest),EASE),(30,v,EASE)],
 'mouth': lambda v:[(0,.25*v,EASE),(11,1.08*v,EASE),(24,v,EASE),(36,v,EASE)],
 'head':  lambda v:[(0,.1*v,DRAG),(16,.82*v,DRAG),(30,1.04*v,EASE),(42,v,EASE)],
}
def gesture(a,obj,prop,value,kind,rest=0,limits=None):
    if abs(value-rest)<1e-6:return static(a,obj,prop,value)
    # Native joy rests at -1, not zero. Animate the delta from its own rest
    # value so a gentle smile doesn't start with a stronger unintended smile.
    keys=(onsets['eye'](value,rest) if kind=='eye' else
          [(f,rest+v,ease) for f,v,ease in onsets[kind](value-rest)])
    if limits:
        keys=[(f,max(limits[0],min(limits[1],v)),ease) for f,v,ease in keys]
    track(a,obj,prop,keys)
for name,p in poses.items():
    a=anims[name]
    gesture(a,find('1:3052'),299,-1+2*p['happy'],'mouth',-1,limits=(-1,1))
    for side in ['Left','Right']:
        gesture(a,eyes[side],17,p['eye'+side[0]],'eye',1)
        gesture(a,brows[side],14,p['brow'+side[0]],'brow')
        for obj,t in brow_points[side]:gesture(a,obj,14,p['roll'+side[0]]*70*t,'brow')
    for obj,restx,resty in iris_poses:
        gesture(a,obj,16,p['iris'],'eye',1);gesture(a,obj,17,p['iris'],'eye',1)
        gesture(a,obj,13,restx+p['irisX'],'eye',restx)
        gesture(a,obj,14,resty+p['irisY'],'eye',resty)
    for station,nodes in lip_poses.items():
        side='Left' if station.endswith('Left') else 'Right' if station.endswith('Right') else None
        y=(p['corner'+side[0]] if station.startswith('corner')
           else p['upper'] if station.startswith('upper') else p['lower'])
        x=(-p['width'] if side=='Left' else p['width'] if side=='Right' else 0)
        for obj in nodes:gesture(a,obj,13,x,'mouth');gesture(a,obj,14,y,'mouth')
    for jaw in jaws:gesture(a,jaw,14,p['lower']*.34,'mouth')
    for cheek in cheeks:gesture(a,cheek,14,p['cheek'],'mouth')
    # The head carries most of the move and gets there first; the shoulders
    # below take the remainder on the slower 'head' curve. Rotation is radians
    # and the head group's pivot sits well below the skull, so the head's own
    # roll stays small and the posture node supplies the rest.
    hx,hy,roll=p['hx'],p['hy'],p['roll']
    rest_x,rest_y=float(head.get('x','0')),float(head.get('y','0'))
    gesture(a,head,13,rest_x+hx*.7,'brow',rest_x)
    gesture(a,head,14,rest_y+hy*.65,'brow',rest_y)
    gesture(a,head,15,roll*.35,'brow')
    gesture(a,emotional,15,roll*.8,'head')
    gesture(a,emotional,14,hy*.5,'head');gesture(a,emotional,13,hx*.5,'head')
E.indent(r,space='    ');E.ElementTree(r).write(project/'scene.rml',encoding='unicode')
print(f'Girl: original artwork, {len(props)} properties, 7 states / 12 keyed poses, '
      f'{len(PALETTE)} calibrated source colours')
