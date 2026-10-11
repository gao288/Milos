import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createVoiceServer} from '../server/voice.mjs';
import {createEngineService} from '../server/speech-engine.mjs';
import {liveVoices,engineVoices} from '../server/voices.mjs';

test('voice catalogs retain configured defaults and expose only provisioned engines',()=>{
 assert.equal(liveVoices({}).length,4);
 assert.ok(liveVoices({GPT_LIVE_VOICE:'marin'}).some(v=>v.id==='marin'));
 const {entries,defaultId}=engineVoices({ELEVENLABS_VOICE_ID:'iP95p4xoKVk53GoZ742B',SPEECH_ENGINE_ID:'base',SPEECH_ENGINE_VOICE_IDS:'{"sarah":"female"}'});
 assert.equal(defaultId,'chris');assert.deepEqual(entries.map(v=>v.id),['chris','sarah']);
});
test('GPT Live starts with the selected voice and rejects arbitrary IDs before upstream connection',async t=>{
 const provider=new WebSocketServer({port:0});await once(provider,'listening');const received=[];
 provider.on('connection',ws=>ws.on('message',data=>{
  const e=JSON.parse(data);
  if(e.type==='session.start'){received.push(e.session.audio.output.voice);ws.send(JSON.stringify({type:'session.started'}));}
  if(e.type==='session.close'){ws.send(JSON.stringify({type:'session.closed'}));}
 }));
 const server=createVoiceServer({env:{OPENAI_API_KEY:'fixture'},connect:()=>{
  const ws=new WebSocket(`ws://127.0.0.1:${provider.address().port}`),close=ws.close.bind(ws);
  // A finalized session must release its slot before slow transport teardown.
  ws.close=()=>setTimeout(close,150);return ws;
 }});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{for(const ws of provider.clients)ws.terminate();provider.close();server.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const health=await(await fetch(base+'/api/voice/health')).json();
 for(const voice of ['gleam','vesper']){
  const ws=new WebSocket(base.replace('http','ws')+'/api/voice/live?token='+health.token+'&voice='+voice);
  await once(ws,'message');const ended=once(ws,'close');ws.send(JSON.stringify({type:'session.close'}));await ended;
 }
 assert.deepEqual(received,['gleam','vesper']);
 const bad=new WebSocket(base.replace('http','ws')+'/api/voice/live?token='+health.token+'&voice=invalid');
 await once(bad,'error');assert.equal(received.length,2);
});
test('Speech Engine voice chooses its own saved engine without mutating shared configuration',async t=>{
 const calls=[];
 const service=createEngineService({env:{SPEECH_ENGINE_ID:'base',ELEVENLABS_VOICE_ID:'iP95p4xoKVk53GoZ742B',SPEECH_ENGINE_VOICE_IDS:'{"sarah":"female-engine"}'},
  eleven:{conversationalAi:{conversations:{getSignedUrl:async input=>{calls.push(input.agentId);return {signedUrl:'wss://api.elevenlabs.io/test'};}}}}});
 service.ready=true;
 const server=createVoiceServer({env:{},engine:service});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`,health=await(await fetch(base+'/api/voice/health')).json();
 assert.deepEqual(health.engineVoices.map(v=>v.id),['chris','sarah']);assert.ok(!JSON.stringify(health).includes('female-engine'));
 const options={method:'POST',headers:{'X-Realpet-Token':health.token}};
 assert.equal((await fetch(base+'/api/voice/speech-engine?voice=sarah',options)).status,200);
 assert.equal((await fetch(base+'/api/voice/speech-engine?voice=chris',options)).status,200);
 assert.equal((await fetch(base+'/api/voice/speech-engine?voice=arbitrary',options)).status,400);
 assert.deepEqual(calls,['female-engine','base']);
});
