import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({headless: "new"});
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERR:', err.message));
    await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
    console.log("WAIT 1");
    // Click the active portfolio
    await page.evaluate(() => {
        let items = document.querySelectorAll('.portfolio-item');
        if (items.length > 0) items[0].click();
    });
    console.log("WAIT 2");
    await new Promise(r => setTimeout(r, 2000));
    
    const body = await page.evaluate(() => document.body.innerHTML);
    if (!body.includes('class="dashboard-container"')) console.log("Missing dashboard container");
    if (body.includes('Analyzing Data')) console.log("Still loading Data");
    if (!body.includes("glass-card")) console.log("No glass cards rendered");
    
    console.log("Done checking.");
    await browser.close();
})();
