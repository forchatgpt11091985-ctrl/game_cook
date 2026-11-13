import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
const body = await readFile('release/index.html');
const server = createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(body)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/Downloads/index.html`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=swiftshader']});
const context=await browser.newContext({viewport:{width:960,height:640}});if(process.env.NO_WEBGL) await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(String(kind).startsWith('webgl'))return null;return original.call(this,kind,...args)}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const state=()=>page.evaluate(()=>window.__gameTest.state());
const next=()=>page.locator('.dialog-next').click();
const teleport=async(x,z)=>{await page.evaluate(([x,z])=>window.__gameTest.teleport(x,z),[x,z]);await page.waitForTimeout(100)};
const talk=async(x,z)=>{await teleport(x,z);await page.keyboard.press('KeyE');await page.locator('.dialog').waitFor()};
const start=async()=>{await page.waitForFunction(()=>window.__GAME_READY__);await page.getByRole('button',{name:'▶ НАЧАТЬ ПРИКЛЮЧЕНИЕ'}).click()};
const checks=[];function pass(name){checks.push(name);console.log('PASS '+name)}
try {
 await page.goto(url);await start();if(process.env.NO_WEBGL)assert.equal((await state()).rendererMode,'software');pass('standalone starts at a nested path');
 await page.keyboard.press('Space');await page.waitForTimeout(100);assert.equal((await state()).mode,'world');pass('title key listener removed after clicking Start');
 await page.keyboard.press('KeyP');await page.waitForFunction(()=>window.__gameTest.state().paused===true);assert.equal((await state()).paused,true);await page.keyboard.press('KeyP');await page.waitForTimeout(100);assert.equal((await state()).paused,false);pass('keyboard pause resumes');
 await talk(-10,-5.5);await next();await page.getByRole('button',{name:'🍎 Яблоко',exact:true}).click();await next();await page.getByRole('button',{name:'🍅 Помидор!',exact:true}).click();await next();assert((await state()).ingredients.includes('tomato'));pass('Nonna riddle and retry');
 await teleport(12,-7);await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
 assert((await page.evaluate(()=>window.__gameProbe())).z < -8.2);pass('Luca field reachable by walking');
 await talk(12,-10);await next();await next();
 await teleport(8.4,-9.2);await page.waitForTimeout(1400);await page.reload();await start();assert.equal((await state()).basilCollected,1);pass('partial basil progress persists');
 for(const [x,z] of [[16.5,-10.5],[12.5,-16.5]])await teleport(x,z);
 assert.equal((await state()).basilCollected,3);await talk(12,-10);await next();assert((await state()).ingredients.includes('mozzarella'));pass('Luca basil and cheese');
 await talk(6,6);await next();
 for(const answer of ['Рим','Лимоны 🍋','Спасибо']) {await page.getByRole('button',{name:answer,exact:true}).click();await next()}
 await next();assert.equal((await state()).villainActive,true);assert.match(await page.locator('.quest-text').innerText(),/Догони/);pass('Marco quiz and chase hint');
 await page.waitForTimeout(1400);await page.reload();await start();assert.equal((await state()).villainActive,true);pass('reload during theft resumes chase');
 const villain=(await state()).villainPos;await teleport(villain.x+.2,villain.z+.2);await page.keyboard.press('KeyE');await page.waitForTimeout(150);assert((await state()).ingredients.includes('flour'));assert.equal((await state()).villainActive,false);pass('villain caught, flour restored');
 await talk(6,6);await next();await page.keyboard.press('Space');assert((await state()).ingredients.includes('flour'));pass('completed NPC cannot restart chase');
 await teleport(8,8.4);await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__gameTest.state().orderActive);
 // Deliberately wrong steps cause a loss; retry must start a playable restaurant.
 for(let i=0;i<3;i++)await page.getByRole('button',{name:/Подать гостю/}).click();
 await page.getByRole('button',{name:'🍕 Ещё раз!',exact:true}).click();pass('restaurant loss and retry');
 for(let guest=0;guest<5;guest++) {
  await page.waitForFunction(()=>window.__gameTest.state().orderActive,null,{timeout:20000});
  for(const step of ['Раскатать тесто','Намазать соус','Посыпать сыром','Испечь в печи','Подать гостю'])await page.getByRole('button',{name:new RegExp(step)}).click();
 }
 assert.equal((await state()).restaurantDone,true);pass('five guests served including fast orders');
 await page.getByTitle('Рецепт',{exact:true}).click();await page.getByRole('heading',{name:'РЕАЛЬНАЯ МИССИЯ!'}).waitFor();assert.match(await page.locator('.recipe-card').innerText(),/180 мл/);pass('recipe with quantities and local photo notice');
 await page.getByLabel('Рассказ о приготовлении').fill('Готовили вместе. Потратили 326 рублей. Grazie!');
 await page.getByLabel('Я проверил продукты и бюджет со взрослым').check();
 assert.equal((await state()).paused,false);pass('real cooking diary and checklist');
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7rUAAAAASUVORK5CYII=','base64');
 await page.locator('input[type=file]').setInputFiles({name:'dish.png',mimeType:'image/png',buffer:pixel});
 await page.waitForFunction(()=>window.__gameTest.state().photoDone);await page.getByRole('button',{name:'🗺️ Открыть карту мира',exact:true}).click();await page.locator('.pin-thumb').waitFor();pass('photo, victory and map');
 const saved=await state();await page.reload();await start();const restored=await state();assert.equal(restored.coins,saved.coins);assert.equal(restored.photoDone,true);assert.equal(restored.restaurantDone,true);await page.getByTitle('Рецепт',{exact:true}).click();assert.match(await page.getByLabel('Рассказ о приготовлении').inputValue(),/326/);await page.getByRole('button',{name:'Вернуться в игру',exact:true}).click();pass('progress and diary persist after reload');
 await mkdir('/tmp/kitchen-proof',{recursive:true});await page.screenshot({path:'/tmp/kitchen-proof/world.png'});
 await teleport(-10,-5.5);const action=await page.locator('.prompt').boundingBox();await page.mouse.click(action.x+action.width/2,action.y+action.height/2);await page.locator('.dialog').waitFor();await next();pass('screen action button works');
 await teleport(0,12);
 const before=await page.evaluate(()=>window.__gameProbe());
 await page.locator('canvas').dispatchEvent('touchstart',{changedTouches:[{identifier:1,clientX:100,clientY:600}]});
 await page.locator('canvas').dispatchEvent('touchmove',{changedTouches:[{identifier:1,clientX:160,clientY:600}]});
 await page.waitForTimeout(500);
 await page.locator('canvas').dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:160,clientY:600}]});
 assert((await page.evaluate(()=>window.__gameProbe())).x>before.x);pass('touch movement');
 assert.deepEqual(errors,[]);pass('zero uncaught browser errors');
 // Unsupported graphics must produce readable feedback rather than a blank screen.
 const noGL=await context.newPage();await noGL.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(String(kind).startsWith('webgl'))return null;return original.call(this,kind,...args)}});
 await noGL.goto(url);await noGL.waitForFunction(()=>window.__GAME_READY__===true);assert.equal(await noGL.evaluate(()=>window.__gameTest.state().rendererMode),'software');assert(await noGL.locator('svg path').count()>10);pass('WebGL failure switches to rendered software 3D');await noGL.close();
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally {await browser.close();server.close()}
