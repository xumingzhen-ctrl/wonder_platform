import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({headless: "new"});
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('PAGEERROR:', error.message));
    
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
})();
