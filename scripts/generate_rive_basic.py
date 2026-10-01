from pathlib import Path
import xml.etree.ElementTree as E
root=E.Element('Rive',version='1',kind='fragment'); serial=100

def el(parent,tag,**attrs):
 global serial
 attrs={k:str(v) for k,v in attrs.items()}; serial+=1;attrs.setdefault('id',f'0:{serial}')
 return E.SubElement(parent,tag,attrs)
def bind(parent,prop,key):el(parent,'DataBindContext',sourcePathIds=f'0:40-{props[prop]}',propertyKey=key)
props={};vm=el(root,'ViewModel',id='0:40',name='Avatar',defaultInstanceId='0:41')
defaults={'emotion':0,'intensity':.8,'gazeX':0,'gazeY':0,'headTilt':0,'breath':0,'eyeOpen':1,'mouthWidth':35,'mouthHeight':3,'mouthCurve':3}
for name,val in defaults.items():props[name]=el(vm,'ViewModelPropertyNumber',name=name).get('id')
instance=el(vm,'ViewModelInstance',id='0:41',name='Default',exports='true')
for name,val in defaults.items():el(instance,'ViewModelInstanceNumber',viewModelPropertyId=props[name],propertyValue=val)
ab=el(root,'Artboard',id='0:2',name='Milo',width=500,height=500,x=0,y=0,defaultStateMachineId='0:7',viewModelId='0:40',viewModelInstanceId='0:41')
style=el(ab,'LayoutComponentStyle',name='Artboard Style');ab.set('styleId',style.get('id'))
sm=el(ab,'StateMachine',id='0:7',name='ExpressionMachine');layer=el(sm,'StateMachineLayer',name='Expression')
el(layer,'AnyState',x=0,y=-200);el(layer,'ExitState',x=250,y=-200);entry=el(layer,'EntryState',x=-250,y=0)
names=['neutral','happy','sad','curious','surprised','angry'];states={};anims={}
for i,name in enumerate(names):
 state=el(layer,'BlendState1DViewModel',x=(i%3)*260,y=(i//3)*320);states[name]=state
 b=el(state,'BindablePropertyNumber');bind(b,'intensity',636)
 anims[name]=el(ab,'LinearAnimation',name=name.title(),duration=60,fps=60)
base=anims['neutral']
for i,name in enumerate(names):
 state=states[name]
 el(state,'BlendAnimation1D',animationId=base.get('id'),value=0)
 el(state,'BlendAnimation1D',animationId=anims[name].get('id'),value=1)
 for j,other in enumerate(names):
  if name==other:continue
  trans=el(state,'BlendStateTransition',stateToId=states[other].get('id'),duration=280)
  condition=el(trans,'TransitionViewModelCondition',opValue='equal')
  comparator=el(condition,'TransitionPropertyViewModelComparator');b=el(comparator,'BindablePropertyNumber');bind(b,'emotion',636)
  el(condition,'TransitionValueNumberComparator',value=j)
el(entry,'StateTransition',stateToId=states['neutral'].get('id'))
# Helpers author shapes in painter order; reverse their order per node before export.
def paint(shape,color):
 f=el(shape,'Fill',name='Fill')
 if isinstance(color,list):
  g=el(f,'LinearGradient',name='Shading',startX=-60,startY=-90,endX=60,endY=100)
  for pos,c in color:el(g,'GradientStop',position=pos,colorValue='FF'+c)
 else:el(f,'SolidColor',name='Color',colorValue='FF'+color)
def ellipse(parent,name,x,y,w,h,color,**attrs):
 s=el(parent,'Shape',name=name,x=x,y=y,**attrs);g=el(s,'Ellipse',name='Path',width=w,height=h,originX=.5,originY=.5)
 if color:paint(s,color)
 return s,g
def path(parent,name,points,color,stroke=None,**attrs):
 s=el(parent,'Shape',name=name,**attrs);p=el(s,'PointsPath',name='Path',isClosed='true' if color else 'false')
 for point in points:
  x,y,*rest=point
  if rest:el(p,'CubicMirroredVertex',x=x,y=y,rotation=rest[0],distance=rest[1])
  else:el(p,'StraightVertex',x=x,y=y)
 if color:paint(s,color)
 if stroke:
  st=el(s,'Stroke',name='Outline',thickness=stroke[1],cap='round',join='round');el(st,'SolidColor',name='Color',colorValue='FF'+stroke[0])
 return s,p
ellipse(ab,'Ground shadow',250,452,225,25,'A6B49A',opacity=.3)
body=el(ab,'Node',name='Body',x=250,y=375);bind(body,'breath',14)
# Body coordinates are global because breath is a direct y offset.
body.set('x','0');body.set('y','0')
path(body,'Sweater',[(145,449),(150,384,.1,32),(190,355,-.5,22),(250,349,0,35),(310,355,.5,22),(350,384,1.5,32),(355,449)],[(0,'8DB797'),(1,'4E7E67')])
path(body,'Left seam',[(177,399),(183,446)],None,('6E9779',2))
path(body,'Right seam',[(323,399),(317,446)],None,('426C58',2))
ellipse(body,'Collar shadow',250,365,89,44,'426D57')
ellipse(body,'Collar',250,361,76,36,'B7C6A1')
ellipse(body,'Neck',250,342,59,64,[(0,'C78C6B'),(1,'E5AF87')])
ellipse(body,'Pendant',250,407,16,16,'D4E4B7');ellipse(body,'Pendant inset',250,407,6,6,'6F906D')
head=el(ab,'Node',name='Head',x=250,y=240);bind(head,'headTilt',15)
ellipse(head,'Hair silhouette',0,-23,229,263,[(0,'354D42'),(1,'1D352E')])
for x in [-105,105]:
 ellipse(head,'Ear',x,12,39,58,'DDA57F');ellipse(head,'Ear inner',x,14,20,34,'BC7F65')
ellipse(head,'Face',0,4,211,235,[(0,'F4D6AA'),(.55,'EFC59A'),(1,'DDA17C')])
ellipse(head,'Chin light',0,87,72,28,'ECC099',opacity=.5)
blush=[]
for x in [-68,68]:
 s,_=ellipse(head,'Cheek',x,46,45,23,'DE8E7F',opacity=.22);blush.append(s)
path(head,'Nose ridge',[(0,15),(-7,39,1.5,5),(5,42,0,4)],None,('C79070',2.5))
ellipse(head,'Nose light',-3,30,8,15,'F8D9AE',opacity=.65)
# Eye expression nodes are keyed separately from blink nodes.
eyes=[];brows=[]
for side,x in enumerate([-45,45]):
 eye=el(head,'Node',name=f'Eye expression {side}',x=x,y=4);eyes.append(eye)
 blink=el(eye,'Node',name=f'Blink {side}');bind(blink,'eyeOpen',17)
 ellipse(blink,'Eye rim',0,0,53,36,'AC8164')
 ellipse(blink,'Eye white',0,1,49,31,'FFF7DC')
 pupil=el(blink,'Node',name='Gaze');bind(pupil,'gazeX',13);bind(pupil,'gazeY',14)
 ellipse(pupil,'Iris',0,1,25,28,[(0,'658875'),(1,'28493F')]);ellipse(pupil,'Pupil',0,1,12,18,'19332C');ellipse(pupil,'Glint',-5,-6,7,7,'FFFFFF');ellipse(pupil,'Small glint',5,7,3,3,'B9DBBF')
 path(blink,'Upper eyelid',[(-25,-1),(-12,-15,0,9),(12,-15,0,9),(25,-1)],None,('4D4A38',3))
 brow=el(head,'Node',name=f'Brow {side}',x=x,y=-31);brows.append(brow)
 path(brow,'Brow hair',[(-23,2),(-7,-3,0,10),(14,-2,0,8),(23,2)],None,('354B3C',7))
# Smile curve and vowel aperture coexist independently from expression timelines.
mouth=el(head,'Node',name='Mouth',x=0,y=73)
s,g=ellipse(mouth,'Mouth cavity',0,0,35,3,'633C32');bind(g,'mouthWidth',20);bind(g,'mouthHeight',21)
s,p=path(mouth,'Lip curve',[(-17,0),(0,3,0,11),(17,0)],None,('945E4E',2.5));bind(list(p)[1],'mouthCurve',25)
# Asymmetric sculpted hair fringe.
path(head,'Fringe',[(-107,-18),(-117,-75,1.7,21),(-80,-125,-.65,32),(-20,-147,0,38),(64,-137,.4,32),(108,-92,1.3,25),(107,-25),(87,-39,1.4,17),(68,-83), (32,-65,-.35,25),(-20,-64,0,28),(-60,-48,-.4,17),(-83,-12)],[(0,'3C5544'),(1,'213C30')])
path(head,'Hair highlight',[(-86,-86),(-44,-116,-.2,30),(25,-120,.05,30),(65,-107)],None,('58715A',5),opacity=.4)
# Keyed expression properties, all keyed in every state to prevent stale poses.
poses={'neutral':[0,0,-31,-31,1,1,.22],'happy':[-.10,.10,-34,-34,.73,.73,.6],'sad':[-.26,.26,-28,-28,.82,.82,.13],'curious':[-.16,-.08,-44,-29,1.12,.8,.23],'surprised':[-.12,.12,-48,-48,1.27,1.27,.32],'angry':[.30,-.30,-22,-22,.66,.66,.45]}
for name,values in poses.items():
 assignments=[(brows[0],15,values[0]),(brows[1],15,values[1]),(brows[0],14,values[2]),(brows[1],14,values[3]),(eyes[0],17,values[4]),(eyes[1],17,values[5])]+[(s,18,values[6]) for s in blush]
 for obj,key,value in assignments:
  ko=el(anims[name],'KeyedObject',objectId=obj.get('id'));kp=el(ko,'KeyedProperty',propertyKey=key);el(kp,'KeyFrameDouble',value=value,frame=0,interpolationType='linear')
for parent in list(root.iter()):
 children=list(parent);draw=[c for c in children if c.tag in ['Node','Shape']]
 if draw:
  ordered=iter(reversed(draw));parent[:]=[next(ordered) if c in draw else c for c in children]
E.indent(root);Path('rive/scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n')
