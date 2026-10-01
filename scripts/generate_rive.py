"""Author Milo's layered facial rig as native Rive geometry + state machines.
No Luau scripts: expression, vitality and attention animations remain editor-editable.
"""
from pathlib import Path
import math
import xml.etree.ElementTree as E

root = E.Element('Rive', version='1', kind='fragment')
serial = 100

def el(parent, tag, **attrs):
    global serial
    serial += 1
    attrs = {key: str(value) for key, value in attrs.items()}
    attrs.setdefault('id', f'0:{serial}')
    return E.SubElement(parent, tag, attrs)

def bind(parent, prop, key):
    el(parent, 'DataBindContext', sourcePathIds=f'0:40-{props[prop]}', propertyKey=key)

def key(animation, obj, property_key, values):
    keyed = el(animation, 'KeyedObject', objectId=obj.get('id'))
    prop = el(keyed, 'KeyedProperty', propertyKey=property_key)
    for frame, value in values:
        k = el(prop, 'KeyFrameDouble', frame=frame, value=value, interpolationType='cubic')
        el(k, 'CubicEaseInterpolator', x1=.33, y1=0, x2=.67, y2=1)

def static(animation, obj, property_key, value):
    key(animation, obj, property_key, [(0, value)])

def paint(shape, color):
    fill = el(shape, 'Fill', name='Fill')
    if isinstance(color, list):
        g = el(fill, 'LinearGradient', name='Soft shading', startX=-65, startY=-85, endX=55, endY=110)
        for pos, c in color:
            el(g, 'GradientStop', position=pos, colorValue='FF'+c)
    else:
        el(fill, 'SolidColor', name='Color', colorValue='FF'+color)

def stroke(shape, color, thickness):
    s = el(shape, 'Stroke', name='Contour', thickness=thickness, cap='round', join='round')
    el(s, 'SolidColor', name='Color', colorValue='FF'+color)

def ellipse(parent, name, x, y, width, height, color, **attrs):
    s = el(parent, 'Shape', name=name, x=x, y=y, **attrs)
    g = el(s, 'Ellipse', name='Geometry', width=width, height=height, originX=.5, originY=.5)
    if color:
        paint(s, color)
    return s, g

def haze(parent, name, x, y, width, height, color, opacity=1):
    s, _ = ellipse(parent, name, x, y, width, height, None, opacity=opacity)
    f = el(s, 'Fill', name='Diffused color')
    g = el(f, 'RadialGradient', name='Falloff', startX=0, startY=0, endX=width/2, endY=0)
    el(g, 'GradientStop', position=0, colorValue='AA'+color)
    el(g, 'GradientStop', position=1, colorValue='00'+color)
    return s

def curve(parent, name, start, segments, color=None, outline=None, closed=False, **attrs):
    """Explicit cubic Beziers, with SVG-style control point coordinates."""
    s = el(parent, 'Shape', name=name, **attrs)
    path = el(s, 'PointsPath', name='Contour', isClosed=str(closed).lower())
    points = [list(start)]
    incoming = [None]
    outgoing = []
    for c1x, c1y, c2x, c2y, x, y in segments:
        outgoing.append((c1x, c1y))
        points.append([x, y]); incoming.append((c2x, c2y))
    if closed and points[-1] == points[0]:
        incoming[0] = incoming.pop(); points.pop()
    else:
        outgoing.append(None)
    verts=[]
    for i, (x,y) in enumerate(points):
        kw={}
        for prefix, cp in [('in',incoming[i]),('out',outgoing[i])]:
            dx,dy=(cp[0]-x,cp[1]-y) if cp else (0,0)
            kw[prefix+'Rotation']=math.atan2(dy,dx)
            kw[prefix+'Distance']=math.hypot(dx,dy)
        verts.append(el(path,'CubicDetachedVertex',x=x,y=y,**kw))
    if color: paint(s,color)
    if outline: stroke(s,*outline)
    return s, verts

def smooth_path(parent,name,points,color=None,outline=None,closed=False,**attrs):
    # Catmull-Rom to explicit cubic tangents: avoids guesses at handle directions.
    segments=[]; n=len(points)
    for i in range(n if closed else n-1):
        a=points[(i-1)%n] if closed or i>0 else points[i]
        b=points[i];c=points[(i+1)%n]
        d=points[(i+2)%n] if closed or i+2<n else c
        segments.append((b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,*c))
    return curve(parent,name,points[0],segments,color,outline,closed,**attrs)

def clip(shape, mask):
    el(shape,'ClippingShape',sourceId=mask.get('id'),name='Clip to aperture')

props={}
vm=el(root,'ViewModel',id='0:40',name='Avatar',defaultInstanceId='0:41')
defaults={
    'emotion':0,'intensity':.8,'behavior':0,'liveliness':1,
    'gazeX':0,'gazeY':0,'headTilt':0,'breath':0,'eyeOpen':1,
    'mouthWidth':36,'mouthHeight':4,'jawShift':0,'chinY':121,'teethVisible':0,
    'restWeight':1,'speechWeight':0,'jawScale':1,
    'browRaiseLeft':0,'browRaiseRight':0,'squintLeft':1,'squintRight':1,
    'eyeWide':1,'mouthLift':0,'mouthStretch':1,'cheekRaise':0,'noseWrinkle':0,
}
for name in defaults: props[name]=el(vm,'ViewModelPropertyNumber',name=name).get('id')
instance=el(vm,'ViewModelInstance',id='0:41',name='Default',exports='true')
for name,value in defaults.items():
    el(instance,'ViewModelInstanceNumber',viewModelPropertyId=props[name],propertyValue=value)
ab=el(root,'Artboard',id='0:2',name='Milo',width=500,height=500,x=0,y=0,defaultStateMachineId='0:7',viewModelId='0:40',viewModelInstanceId='0:41')
style=el(ab,'LayoutComponentStyle',name='Artboard Style');ab.set('styleId',style.get('id'))
sm=el(ab,'StateMachine',id='0:7',name='ExpressionMachine')

names=['neutral','happy','sad','curious','surprised','angry']
anims={name:None for name in names}
layer=el(sm,'StateMachineLayer',name='01 · Emotional pose')
el(layer,'AnyState',x=-230,y=-200);el(layer,'ExitState',x=400,y=-200)
entry=el(layer,'EntryState',x=-250,y=0)
states={}
for i,name in enumerate(names):
    angle=2*math.pi*i/len(names)
    state=el(layer,'BlendState1DViewModel',x=350+350*math.cos(angle),y=200+300*math.sin(angle))
    states[name]=state
    bp=el(state,'BindablePropertyNumber');bind(bp,'intensity',636)
    anims[name]=el(ab,'LinearAnimation',name='Emotion · '+name.title(),duration=60,fps=60)
for name,state in states.items():
    el(state,'BlendAnimation1D',animationId=anims['neutral'].get('id'),value=0)
    el(state,'BlendAnimation1D',animationId=anims[name].get('id'),value=1)
    for index,other in enumerate(names):
        if name==other:continue
        trans=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=360,interpolationType='cubic')
        el(trans,'CubicEaseInterpolator',x1=.2,y1=0,x2=.25,y2=1)
        cond=el(trans,'TransitionViewModelCondition',opValue='equal')
        comparator=el(cond,'TransitionPropertyViewModelComparator')
        bp=el(comparator,'BindablePropertyNumber');bind(bp,'emotion',636)
        el(cond,'TransitionValueNumberComparator',value=index)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))

# Separate vitality layer animates dedicated nodes, never overwriting emotion or mouth.
vl=el(sm,'StateMachineLayer',name='02 · Saccades and settling')
el(vl,'AnyState',x=0,y=-150);el(vl,'ExitState',x=300,y=-150)
ve=el(vl,'EntryState',x=-230,y=0);vs=el(vl,'BlendState1DViewModel',x=60,y=0)
bp=el(vs,'BindablePropertyNumber');bind(bp,'liveliness',636)
el(ve,'StateTransition',stateToId=vs.get('id'))
still=el(ab,'LinearAnimation',name='Vitality · Still',duration=360)
live=el(ab,'LinearAnimation',name='Vitality · Saccades',duration=360,loopValue='loop')
el(vs,'BlendAnimation1D',animationId=still.get('id'),value=0)
el(vs,'BlendAnimation1D',animationId=live.get('id'),value=1)

bl=el(sm,'StateMachineLayer',name='03 · Attention')
el(bl,'AnyState',x=0,y=-150);el(bl,'ExitState',x=300,y=-150)
be=el(bl,'EntryState',x=-230,y=0);behavior_states={};behavior_anims={}
for i,name in enumerate(['idle','listening','speaking']):
    a=el(ab,'LinearAnimation',name='Attention · '+name.title(),duration=90)
    behavior_anims[name]=a
    behavior_states[name]=el(bl,'AnimationState',animationId=a.get('id'),x=i*220,y=(i%2)*200)
for name,state in behavior_states.items():
    for i,other in enumerate(behavior_states):
        if name==other:continue
        t=el(state,'StateTransition',stateToId=behavior_states[other].get('id'),duration=450)
        cond=el(t,'TransitionViewModelCondition',opValue='equal')
        cp=el(cond,'TransitionPropertyViewModelComparator');bp=el(cp,'BindablePropertyNumber');bind(bp,'behavior',636)
        el(cond,'TransitionValueNumberComparator',value=i)
el(be,'StateTransition',stateToId=behavior_states['idle'].get('id'))

haze(ab,'Soft ground shadow',250,460,224,28,'70876B',.55)
body=el(ab,'Node',name='Torso breathing');bind(body,'breath',14)
curve(body,'Sage knit silhouette',(137,459),[(133,411,141,376,179,363),(203,351,227,345,250,345),(282,345,308,352,330,366),(359,386,367,417,363,459),(294,468,205,468,137,459)],[(0,'A2B69A'),(1,'587D67')],closed=True)
curve(body,'Shoulder seam left',(163,395),[(175,410,175,431,179,460)],outline=('759580',2))
curve(body,'Shoulder seam right',(337,395),[(325,410,325,431,321,460)],outline=('496C57',2))
ellipse(body,'Collar shadow',250,364,87,41,'466C58')
ellipse(body,'Neck',250,342,58,70,[(0,'BE8269'),(1,'E8B991')])
curve(body,'Ribbed collar',(210,360),[(211,383,289,383,290,360)],outline=('A7B796',7))
curve(body,'Collar inner rim',(214,360),[(222,375,278,375,286,360)],outline=('537660',2))
ellipse(body,'Brass pendant',250,409,15,19,'D6C794')
ellipse(body,'Pendant inset',250,409,5,7,'758769')
life=el(ab,'Node',name='Subtle head settling')
attention=el(life,'Node',name='Attention pose',x=250,y=232)
head=el(attention,'Node',name='User head motion');bind(head,'headTilt',15)
ellipse(head,'Back hair',0,-25,221,253,[(0,'354B40'),(1,'182F29')])
for x in [-102,102]:
    ellipse(head,'Ear silhouette',x,17,32,53,[(0,'EDBD93'),(1,'C98D70')])
    curve(head,'Ear fold',(x-6,2),[(x+11,-5,x+12,29,x,31),(x-6,23,x+8,17,x+2,12)],outline=('B77B62',2))
face,face_vertices=curve(head,'Skin and jaw',(-98,-43),[(-97,-91,-51,-113,0,-113),(55,-113,94,-87,100,-37),(110,14,96, 60,74,85),(52,111,21,121,0,121),(-29,121,-59,107,-79,81),(-101,52,-109,6,-98,-43)],[(0,'F8D9AE'),(.50,'EDBD97'),(1,'CE9276')],closed=True)
bind(face_vertices[4],'chinY',25)
haze(head,'Temple shade left',-87,10,34,124,'B47861',.28)
haze(head,'Temple light',-65,-28,74,98,'FFE8C5',.35)
# Cheek muscles: expression lift + independent manual lift.
cheeks=[];dimples=[]
for i,x in enumerate([-63,63]):
    n=el(head,'Node',name=f'Cheek muscle {i}',x=x,y=39);cheeks.append(n)
    manual=el(n,'Node',name='Manual cheek lift');bind(manual,'cheekRaise',14)
    haze(manual,'Blush',0,0,61,32,'D87978',.58)
    haze(manual,'Cheekbone light',0,-8,48,14,'FFE6BD',.32)
    crease,_=curve(manual,'Smile crease',(-17 if i==0 else 17,3),[(-21 if i==0 else 21,8,-23 if i==0 else 23,14,-22 if i==0 else 22,17)],outline=('B57866',1.2),opacity=.0)
    dimples.append(crease)

# Eye whites are true apertures: moving irises, glints and pupils are clipped to lids.
brows=[];eye_contours=[];eye_bags=[];creases=[];iris_scans=[];pupil_scales=[]
points=[(-25,0),(-13,-12),(0,-15),(14,-11),(25,0),(13,10),(0,12),(-13,9)]
for i,x in enumerate([-45,45]):
    eye=el(head,'Node',name=f'{"Left" if i==0 else "Right"} eye',x=x,y=4)
    wide=el(eye,'Node',name='Eye widen');bind(wide,'eyeWide',17)
    squint=el(wide,'Node',name='Independent squint');bind(squint,'squintLeft' if i==0 else 'squintRight',17)
    blink=el(squint,'Node',name='Blink layer');bind(blink,'eyeOpen',17)
    rim,rv=smooth_path(blink,'Waterline',points,'B88570',closed=True,scaleX=1.065,scaleY=1.1)
    white,wv=smooth_path(blink,'Eye aperture',points,'FFF6E5',closed=True)
    scan=el(blink,'Node',name='Microsaccade');iris_scans.append(scan)
    gaze=el(scan,'Node',name='User gaze');bind(gaze,'gazeX',13);bind(gaze,'gazeY',14)
    for name,dx,dy,w,h,color in [('Iris outer',0,-1,27,29,'456354'),('Iris color',0,-1,22,25,[(0,'769786'),(1,'335446')]),('Iris inner',0,1,15,18,'3C5A46')]:
        s,_=ellipse(gaze,name,dx,dy,w,h,color);clip(s,white)
    pup=el(gaze,'Node',name='Pupil dilation');pupil_scales.append(pup)
    for name,dx,dy,w,h,color in [('Pupil',0,-1,11,17,'162F29'),('Key reflection',-5,-7,6,5,'FFFFFF'),('Bounce reflection',5,5,3,3,'D9E9BC')]:
        s,_=ellipse(pup,name,dx,dy,w,h,color);clip(s,white)
    upper,uv=smooth_path(blink,'Upper lid',points[:5],outline=('544835',2.4))
    lower,lv=smooth_path(blink,'Lower lid',points[4:]+[points[0]],outline=('B17E65',1.3))
    eye_contours.append((rv,wv,uv,lv))
    cr,_=curve(eye,'Lid crease',(-21,-20),[(-8,-28,10,-28,22,-20)],outline=('BE9476',1.3),opacity=.45);creases.append(cr)
    bag,_=curve(eye,'Lower lid tension',(-20,17),[(-8,24,9,24,20,17)],outline=('BF927A',1.1),opacity=.2);eye_bags.append(bag)
    brow=el(head,'Node',name=f'Brow expression {i}',x=x,y=-33);brows.append(brow)
    manual=el(brow,'Node',name='Independent brow raise');bind(manual,'browRaiseLeft' if i==0 else 'browRaiseRight',14)
    curve(manual,'Brow silhouette',(-25,3),[(-18,-3,5,-7,22,-1),(26,0,27,4,23,5),(10,0,-11,-1,-23,6),(-26,7,-28,5,-25,3)],'344A3A',closed=True)
    curve(manual,'Brow highlight',(-17,1),[(-5,-1,5,-2,16,0)],outline=('5B7055',1.1),opacity=.55)

haze(head,'Nose shadow',6,31,26,53,'B87860',.3)
curve(head,'Nose bridge',(0,8),[(-3,21,-8,34,-6,38),(-3,43,6,44,10,39)],outline=('C18B6D',1.7))
curve(head,'Nose highlight',(-2,14),[(-6,25,-8,33,-4,35)],outline=('FFE1B5',2),opacity=.6)
nostrils=[]
for x in [-9,9]:
    nostril,_=ellipse(head,'Nostril',x,40,5,2.5,'B98064',opacity=.6);nostrils.append(nostril)
wrinkles=el(head,'Node',name='Expression nose tension',opacity=0)
manual_wrinkles=el(head,'Node',name='Manual nose tension');bind(manual_wrinkles,'noseWrinkle',18)
for n in [wrinkles,manual_wrinkles]:
    curve(n,'Nose crease L',(-13,24),[(-19,27,-20,32,-18,35)],outline=('B87F66',1.5))
    curve(n,'Nose crease R',(13,24),[(19,27,20,32,18,35)],outline=('B87F66',1.5))
    curve(n,'Glabella',(0,-31),[(-1,-26,-1,-23,0,-20)],outline=('B8876A',1.4))

# Sculpted mouth: outlined aperture, clipped teeth and tongue, expression deformation.
lower_face=el(head,'Node',name='Jaw and lower face');bind(lower_face,'jawShift',14)
haze(lower_face,'Chin reflection',-3,100,55,20,'FFE0B4',.3)
curve(lower_face,'Philtrum',(-4,49),[(-5,53,-5,55,-6,57)],outline=('CA997A',1),opacity=.7)
mouth_position=el(lower_face,'Node',name='Mouth expression position',x=0,y=72)
mouth_manual=el(mouth_position,'Node',name='Smile lift and stretch');bind(mouth_manual,'mouthLift',14);bind(mouth_manual,'mouthStretch',16)
mouth_points=[(-.5,0),(-.24,-.28),(0,-.24),(.24,-.28),(.5,0),(.25,.42),(0,.58),(-.25,.42)]
mouth_contours=[]
for speaking in [False,True]:
    visibility=el(mouth_manual,'Node',name='Speech mouth' if speaking else 'Emotional rest mouth')
    bind(visibility,'speechWeight' if speaking else 'restWeight',18)
    if not speaking:
        jaw=el(visibility,'Node',name='Manual jaw opening');bind(jaw,'jawScale',17)
        mouth=el(jaw,'Node',name='Native emotional mouth size',scaleX=36,scaleY=4)
        rest_mouth=mouth
    else:
        mouth=el(visibility,'Node',name='Viseme aperture scale')
        bind(mouth,'mouthWidth',16);bind(mouth,'mouthHeight',17)
    lip,lipv=smooth_path(mouth,'Lip volume',mouth_points,[(0,'B57768'),(1,'C18C77')],closed=True,scaleX=1.10,scaleY=1.20)
    cavity,cv=smooth_path(mouth,'Oral aperture',mouth_points,'53322F',closed=True)
    mouth_contours.extend([lipv,cv])
    teeth_group=el(mouth,'Node',name='Teeth visibility')
    if speaking:bind(teeth_group,'teethVisible',18)
    else:rest_teeth=teeth_group
    teeth,tv=curve(teeth_group,'Upper teeth',(-.48,-.42),[(-.22,-.5,.22,-.5,.48,-.42),(.48,-.1,.4,.05,.24,.07),(.05,.12,-.27,.1,-.43,0),(-.48,-.1,-.48,-.3,-.48,-.42)],'FFF4DA',closed=True)
    clip(teeth,cavity)
    tongue,_=ellipse(mouth,'Tongue',0,.58,.75,.36,'C87B7F');clip(tongue,cavity)
    for x in [-.08,.08]:
        shape,_=curve(teeth_group,'Tooth detail',(x,-.24),[(x,-.1,x,-.01,x,.065)],outline=('E6D9C0',.009));clip(shape,cavity)
# Corner creases stay in face units, outside the viseme's scale.
corner_creases=[]
for x in [-23,23]:
    n,_=curve(mouth_manual,'Mouth corner',(x,0),[(x*1.1,-2,x*1.14,-4,x*1.1,-5)],outline=('B77F69',1.2),opacity=.25);corner_creases.append(n)

# Layered hair with explicit tangent handles gives a continuous swept silhouette.
curve(head,'Sideburn left',(-101,-38),[(-96,-23,-97,-1,-91,5),(-89,-11,-85,-30,-86,-52),(-96,-59,-102,-55,-101,-38)],'2C4435',closed=True)
curve(head,'Sideburn right',(99,-40),[(100,-20,98,-8,93,2),(89,-14,87,-31,86,-50),(94,-57,101,-56,99,-40)],'213C30',closed=True)
curve(head,'Swept fringe',(-106,-31),[(-117,-67,-112,-106,-83,-121),(-62,-140,-18,-154,21,-147),(62,-145,101,-124,108,-88),(116,-58,111,-43,101,-26),(96,-42,82,-58,74,-72),(59,-66,38,-57,13,-58),(-18,-54,-45,-42,-58,-28),(-47,-47,-27,-61,-5,-71),(-40,-68,-70,-50,-83,-29),(-90,-18,-92,-9,-95,-8),(-96,-22,-99,-28,-106,-31)],[(0,'3E5341'),(.6,'2B4436'),(1,'20382E')],closed=True)
curve(head,'Hair sheen',(-88,-91),[(-62,-122,-7,-134,36,-122),(59,-117,76,-108,86,-96)],outline=('657A57',5),opacity=.3)
curve(head,'Hair strand one',(-80,-80),[(-48,-110,2,-119,47,-106)],outline=('71835B',1.7),opacity=.23)
curve(head,'Hair strand two',(-72,-65),[(-44,-87,-13,-100,26,-99)],outline=('637753',1.6),opacity=.20)

# All deformation channels are keyed in all states to avoid pose leakage.
# brow rotation L/R, lift L/R, upper lid drop L/R, lower lid lift, cheek lift,
# blush, mouth corner rise (normalized), jaw/mouth pose, nose tension, bag, crease.
poses={
 'neutral':dict(br=[0,0],by=[-33,-33],top=[0,0],bottom=0,cheek=0,blush=.55,corner=0,mouthY=72,nose=0,bag=.2,crease=.45),
 'happy':dict(br=[-.08,.08],by=[-37,-37],top=[2,2],bottom=-4,cheek=-6,blush=.9,corner=-.28,mouthY=69,nose=0,bag=.50,crease=.3),
 'sad':dict(br=[-.28,.28],by=[-29,-29],top=[4,4],bottom=1,cheek=2,blush=.32,corner=.30,mouthY=75,nose=0,bag=.65,crease=.6),
 'curious':dict(br=[-.17,-.05],by=[-44,-29],top=[-2,4],bottom=-1,cheek=-1,blush=.52,corner=-.03,mouthY=72,nose=.1,bag=.25,crease=.5),
 'surprised':dict(br=[-.13,.13],by=[-49,-49],top=[-5,-5],bottom=4,cheek=2,blush=.4,corner=0,mouthY=75,nose=0,bag=.15,crease=.6),
 'angry':dict(br=[.29,-.29],by=[-24,-24],top=[5,5],bottom=-3,cheek=-2,blush=.75,corner=.12,mouthY=73,nose=.85,bag=.55,crease=.8),
}
for name,p in poses.items():
    a=anims[name]
    for i in range(2):
        static(a,brows[i],15,p['br'][i]);static(a,brows[i],14,p['by'][i])
        static(a,cheeks[i],14,39+p['cheek']);static(a,cheeks[i],18,p['blush'])
        static(a,dimples[i],18,.65 if name=='happy' else .10 if name=='angry' else 0)
        static(a,eye_bags[i],18,p['bag']);static(a,creases[i],18,p['crease'])
        static(a,nostrils[i],16,1.25 if name=='angry' else 1)
        rv,wv,uv,lv=eye_contours[i]
        for verts in [rv,wv,uv]:
            for j in [1,2,3]:static(a,verts[j],25,points[j][1]+p['top'][i])
        for verts in [rv,wv]:
            for j in [5,6,7]:static(a,verts[j],25,points[j][1]+p['bottom'])
        for j in [1,2,3]:static(a,lv[j],25,points[4+j][1]+p['bottom'])
        static(a,corner_creases[i],18,.65 if name=='happy' else .3)
    rest_shapes={'neutral':(36,4),'happy':(54,19),'sad':(32,4),'curious':(32,5),'surprised':(25,32),'angry':(43,8)}
    rest_width,rest_height=rest_shapes[name]
    static(a,rest_mouth,16,rest_width);static(a,rest_mouth,17,rest_height)
    static(a,rest_teeth,18,max(0,min(1,(rest_height-6)/9)))
    for verts in mouth_contours:
        for j in [0,4]:static(a,verts[j],25,p['corner'])
        # Cupid's bow and lower lip tension also change with emotion.
        static(a,verts[2],25,-.14 if name=='happy' else -.34 if name=='surprised' else -.24)
        static(a,verts[6],25,.72 if name=='happy' else .48 if name=='angry' else .58)
    static(a,mouth_position,14,p['mouthY'])
    static(a,wrinkles,18,p['nose'])
# Genuine Rive timelines for independent involuntary motion.
static(still,life,14,0);static(still,life,15,0)
key(live,life,14,[(0,0),(95,1.3),(205,-.6),(300,.4),(360,0)])
key(live,life,15,[(0,0),(115,.008),(245,-.006),(360,0)])
for i,n in enumerate(iris_scans):
    static(still,n,13,0)
    key(live,n,13,[(0,0),(75,0),(80,1.4),(130,1.4),(136,0),(252,0),(258,-1),(315,-1),(322,0),(360,0)])
for n in pupil_scales:
    static(still,n,16,1);static(still,n,17,1)
    key(live,n,16,[(0,1),(130,1.07),(250,.97),(360,1)])
    key(live,n,17,[(0,1),(130,1.07),(250,.97),(360,1)])
for name,a in behavior_anims.items():
    static(a,attention,15,-.035 if name=='listening' else .008 if name=='speaking' else 0)
    static(a,attention,14,230 if name=='listening' else 232)

# Convert painter order to Rive's first-sibling-on-top order.
for parent in list(root.iter()):
    children=list(parent);draw=[c for c in children if c.tag in ['Node','Shape']]
    if draw:
        ordered=iter(reversed(draw));parent[:]=[next(ordered) if c in draw else c for c in children]
E.indent(root)
Path('rive/scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n')
print(f'Milo expressive rig: {len(list(root.iter("Shape")))} shapes, {len(list(root.iter("KeyedProperty")))} animated channels, {len(list(root.iter("StateMachineLayer")))} layers')
