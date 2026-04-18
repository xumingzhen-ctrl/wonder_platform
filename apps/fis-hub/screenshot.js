import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({headless: "new"});
    const page = await browser.newPage();
    await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'}).catch(e => console.log('GOTO_ERROR', e));
    await page.screenshot({path: '/Users/derek/.gemini/antigravity/brain/c2440ca9-a661-4e69-bc26-cf4351b39dd8/debug_blank.png'});
    await browser.close();
})();
