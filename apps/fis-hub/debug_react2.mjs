import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({headless: "new"});
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER_ERROR:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.log('PAGE_ERROR:', error.message);
    });

    try {
        await page.goto('http://localhost:5173', {waitUntil: 'domcontentloaded'});
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log('GOTO_ERROR', e.message);
    }
    await browser.close();
})();
