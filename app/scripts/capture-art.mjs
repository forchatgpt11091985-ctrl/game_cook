import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
 await page.goto('http://127.0.0.1:3020/');await page.waitForFunction(()=>window.__GAME_READY__,null,{timeout:60000});
 await page.keyboard.press('Space');await page.waitForTimeout(4500);
 await page.screenshot({path:'/workspace/tuscany-gameplay.png'});
 // A scene-review camera, using the game's existing diagnostic hook; no image editing.
 await page.keyboard.press('KeyP');await page.waitForTimeout(200);
 await page.evaluate(()=>{window.__gameTest.camera(-17,6,14,0,1,-2);document.querySelector('.modal-wrap').style.visibility='hidden'});
 await page.waitForTimeout(300);await page.screenshot({path:'/workspace/tuscany-overview.png'});
 console.log(JSON.stringify({errors,state:await page.evaluate(()=>window.__gameTest.state())}));
} finally {await browser.close()}
