import {test,expect} from '@playwright/test';
import {LIVE_VOICES,ENGINE_VOICES} from '../../src/voice/voices.js';
async function setup(page,{closeDelay=0,liveVoice="meridian"}={}){
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=new AudioContext({sampleRate:16000});return c.createMediaStreamDestination().stream;};});
 await page.route('**/api/voice/health',r=>r.fulfill({json:{openaiConfigured:true,jevConfigured:true,token:'fixture',liveModel:'gpt-live-1',liveVoices:LIVE_VOICES,liveVoice,speechEngineConfigured:true,engineVoices:ENGINE_VOICES,engineVoice:'chris'}}));
 await page.route('**/api/model/health',r=>r.fulfill({json:{loaded:false}}));
 const choices=[];
 await page.route('**/api/voice/speech-engine?*',r=>{choices.push(new URL(r.request().url()).searchParams.get('voice'));return r.fulfill({json:{signedUrl:'wss://api.elevenlabs.io/voice-fixture'}});});
 await page.routeWebSocket('**/api/voice/live?*',ws=>{choices.push(new URL(ws.url()).searchParams.get('voice'));ws.send(JSON.stringify({type:'session.started'}));ws.onMessage(data=>{if(JSON.parse(data).type==='session.close'){setTimeout(()=>{ws.send(JSON.stringify({type:'session.closed'}));ws.close();},closeDelay);}});});
 await page.routeWebSocket('wss://api.elevenlabs.io/voice-fixture',ws=>ws.onMessage(data=>{if(JSON.parse(data).type==='conversation_initiation_client_data')ws.send(JSON.stringify({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{agent_output_audio_format:'pcm_16000',user_input_audio_format:'pcm_16000'}}));}));
 await page.goto('/?character=orb');await page.waitForFunction(()=>window.avatar?.getState().ready);
 return choices;
}
test('voice buttons persist independent choices, translate, and send selected voices at startup',async({page})=>{
 const choices=await setup(page);
 await expect(page.locator('#voice-choices button')).toHaveCount(4);
 await page.locator('[data-voice="gleam"]').click();
 await expect(page.locator('[data-voice="gleam"]')).toContainText('Female');
 await page.locator('#voice-output-engine').click();await page.locator('[data-voice="sarah"]').click();
 await page.locator('#voice-output-live').click();await expect(page.locator('[data-voice="gleam"]')).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(page.locator('[data-voice="gleam"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#voice-start').click();await expect.poll(()=>choices.at(-1)).toBe('gleam');
 await expect(page.locator('[data-voice="vesper"]')).toBeDisabled();
 await page.locator('#voice-stop').click();await expect(page.locator('[data-voice="vesper"]')).toBeEnabled();
 await page.locator('#voice-output-engine').click();await expect(page.locator('[data-voice="sarah"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#ui-language').click();await expect(page.locator('[data-voice="sarah"]')).toContainText('女声');
 await page.locator('#voice-start').click();await expect.poll(()=>choices.at(-1)).toBe('sarah');
 await expect(page.locator('[data-voice="brian"]')).toBeDisabled();
 await page.locator('#voice-stop').click();await page.locator('[data-voice="brian"]').click();
 await page.locator('#voice-start').click();await expect.poll(()=>choices.at(-1)).toBe('brian');
 await page.locator('#voice-stop').click();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('stale saved voices recover to defaults and blocked storage does not break selection',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('realpet.voices','{"live":"removed","engine":"removed"}');Storage.prototype.setItem=()=>{throw Error('disabled');};});
 await setup(page);await expect(page.locator('[data-voice="meridian"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-voice="willow"]').click();await expect(page.locator('[data-voice="willow"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#voice-output-engine').click();await expect(page.locator('[data-voice="chris"]')).toHaveAttribute('aria-pressed','true');
});

test('rapid voice restart waits for final close and respects the server default',async({page})=>{
 const choices=await setup(page,{closeDelay:600,liveVoice:'vesper'});
 await expect(page.locator('[data-voice="vesper"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#voice-start').click();await expect.poll(()=>choices.at(-1)).toBe('vesper');
 await page.locator('#voice-stop').click();await page.locator('[data-voice="gleam"]').click();await page.locator('#voice-start').click();
 await page.waitForTimeout(150);expect(choices).toEqual(['vesper']);
 await expect.poll(()=>choices).toEqual(['vesper','gleam']);
 await page.locator('#voice-stop').click();await page.waitForTimeout(650);
});
