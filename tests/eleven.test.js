import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { synthesizeEleven } from '../server/eleven.mjs';
import { createVoiceServer } from '../server/voice.mjs';

const env={ELEVENLABS_API_KEY:'eleven-fixture-secret',ELEVENLABS_VOICE_ID:'voice_fixture',JEV_API_KEY:'jev-fixture'};
test('ElevenLabs uses the server-selected voice/model and only confident semantic delivery tags',async()=>{
 let request;
 const prediction={emotion:'sad',confidence:.98,intensity:.4};
 const result=await synthesizeEleven({text:'我陪着你。'},{env,emotion:async()=>prediction,fetchFn:async(url,options)=>{request={url,options};return new Response(new Uint8Array([1,2,3]));}});
 assert.equal(request.url,'https://api.elevenlabs.io/v1/text-to-speech/voice_fixture?output_format=mp3_44100_128');
 assert.equal(request.options.headers['xi-api-key'],env.ELEVENLABS_API_KEY);
 assert.equal(request.options.redirect,'error');
 assert.deepEqual(JSON.parse(request.options.body),{text:'[sympathetic] 我陪着你。',model_id:'eleven_v4_turbo'});
 assert.equal(result.audio,'AQID');assert.equal(result.emotion,prediction);
 assert.ok(!JSON.stringify(result).includes(env.ELEVENLABS_API_KEY));
});

test('missing credentials and oversized text never call providers; JEV failure can still produce untagged speech',async()=>{
 let called=false;
 const fetchFn=async()=>{called=true;return new Response(new Uint8Array([1]));};
 await assert.rejects(synthesizeEleven({text:'Hi'},{env:{},fetchFn}),/ELEVENLABS_API_KEY/);
 await assert.rejects(synthesizeEleven({text:'x'.repeat(401)},{env,fetchFn}),/Invalid/);
 assert.equal(called,false);
 let body;
 const result=await synthesizeEleven({text:'Hello [world]'},{env,emotion:async()=>{throw Error('timeout');},fetchFn:async(_,opts)=>{body=JSON.parse(opts.body);return new Response(new Uint8Array([1]));}});
 assert.equal(body.text,'Hello world');assert.equal(result.emotion,null);assert.ok(result.warning);
});

test('TTS bridge requires its local token, reports config only, and aborts disconnected requests',async t=>{
 let signal, started;
 const ready=new Promise(resolve=>{started=resolve;});
 const server=createVoiceServer({env,tts:async(input,options)=>{
  signal=options.signal;started();
  await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
  throw Error('aborted');
 }});
 server.listen(0,'127.0.0.1'); await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 const health=await(await fetch(base+'/api/voice/health')).json();
 assert.equal(health.elevenConfigured,true);assert.ok(!JSON.stringify(health).includes(env.ELEVENLABS_API_KEY));
 assert.equal((await fetch(base+'/api/voice/eleven',{method:'POST',body:'{}'})).status,403);
 const abort=new AbortController();
 const request=fetch(base+'/api/voice/eleven',{method:'POST',headers:{'Content-Type':'application/json','X-Realpet-Token':health.token},body:JSON.stringify({text:'Hello'}),signal:abort.signal}).catch(()=>{});
 await ready;abort.abort();await request;
 if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
 assert.equal(signal.aborted,true);
});
