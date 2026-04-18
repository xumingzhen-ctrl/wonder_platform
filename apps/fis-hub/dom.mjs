import puppeteer from 'puppeteer';
(async () => {
    console.log('starting browser...');
    const browser = await puppeteer.launch({headless: "new"});
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
    await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
    console.log('DOM PREVIEW:', await page.evaluate(() => document.body.innerHTML.substring(0, 1000)));
    await browser.close();
})();
