import test from 'node:test';
import assert from 'node:assert/strict';
import { emotionWindow, rememberSpeech } from '../src/voice/emotion-context.js';
const f = (text,startMs,endMs,role='assistant')=>({text,startMs,endMs,role});

test('tiny deltas retain the compassionate phrase and user turn, without replaying old cue times',()=>{
 const history=[], fragments=[];
 rememberSpeech(history,f('我的狗去世了。',0,1000,'user'));
 const chunks=['听到','这个','消息，','我很','难过。','我','在','这里','陪','着','你，','你','可以','慢慢','说。'];
 chunks.forEach((text,i)=>{const fragment=f(text,1200+i*200,1400+i*200);rememberSpeech(history,fragment);fragments.push(fragment);});
 const result=emotionWindow(fragments,history,4000);
 assert.equal(result.text,chunks.join(''));
 assert.equal(result.currentText,'说。');
 assert.equal(result.startMs,4000); assert.equal(result.endMs,4200);
 assert.deepEqual(result.context,[{role:'user',text:'我的狗去世了。'}]);
 assert.equal(history.length,2);
 assert.equal(emotionWindow(fragments,history,4200),null);
});

test('a new user turn or long pause prevents a sad phrase from leaking into a new topic',()=>{
 const fragments=[f('I am sorry for your loss.',0,1000),f('Congratulations!',1600,2100)];
 const turns=[fragments[0],f('Actually, I got the job!',1100,1500,'user'),fragments[1]];
 assert.equal(emotionWindow(fragments,turns,1000).text,'Congratulations!');
 assert.equal(emotionWindow([fragments[0],f('Here is the weather.',4000,4500)],[],1000).text,'Here is the weather.');
});

test('conversation storage keeps complete turns bounded and current windows stay recent',()=>{
 const turns=[];
 for(let i=0;i<30;i++)rememberSpeech(turns,f('x'.repeat(2500),i*3000,i*3000+200,i%2?'user':'assistant'));
 assert.equal(turns.length,12); assert.ok(turns.every(t=>t.text.length<=2000));
 const fragments=Array.from({length:100},(_,i)=>f('a',i*200,i*200+200));
 const result=emotionWindow(fragments,[],19800);
 assert.equal(result.text.length,40); assert.equal(result.currentText,'a');
});
