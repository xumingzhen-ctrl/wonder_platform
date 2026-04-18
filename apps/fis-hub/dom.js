import puppeteer from 'puppeteer';
(async () => {
    console.log('starting browser');
    const browser = await puppeteer.launch({headless: true});
    console.log('browser started');
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
    await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
    console.log('DOM PREVIEW:', await page.evaluate(() => document.body.innerHTML.substring(0, 1000)));
    await browser.close();
})();
