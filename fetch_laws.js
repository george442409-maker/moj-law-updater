const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const BASE_URL = 'https://law.moj.gov.tw';
const NEWS_LIST_URL = `${BASE_URL}/News/NewsList.aspx`;
const SCRIPT_DIR = __dirname;
const REPORTS_DIR = path.join(SCRIPT_DIR, 'reports');
const HISTORY_FILE = path.join(SCRIPT_DIR, 'processed_links.txt');
function getBrowserPath() {
    if (process.platform === 'win32') {
        return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    }
    // On Linux/GitHub Actions runner, google-chrome is in the PATH
    return 'google-chrome';
}

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return new Set();
    }
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return new Set(content.split('\n').map(line => line.trim()).filter(Boolean));
}

function saveHistory(links) {
    const stream = fs.createWriteStream(HISTORY_FILE, { flags: 'a', encoding: 'utf-8' });
    for (const link of links) {
        stream.write(`${link}\n`);
    }
    stream.end();
}

function parseRocDate(rocDateStr) {
    const parts = rocDateStr.trim().split('-');
    if (parts.length === 3) {
        const rocYear = parseInt(parts[0], 10);
        if (!isNaN(rocYear)) {
            const gregorianYear = rocYear + 1911;
            return `${gregorianYear}-${parts[1]}-${parts[2]}`;
        }
    }
    return rocDateStr;
}

async function fetchUpdates() {
    console.log(`Connecting to ${NEWS_LIST_URL}...`);
    
    const response = await fetch(NEWS_LIST_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Parse the table rows
    const trs = html.split(/<tr[^>]*>/i);
    const updates = [];
    
    for (let i = 1; i < trs.length; i++) {
        const tr = trs[i].split(/<\/tr>/i)[0];
        
        // Check if this row is part of the tbody and not the thead
        if (!tr.includes('</td>')) continue;
        
        const tds = tr.split(/<td[^>]*>/i)
                      .slice(1)
                      .map(td => td.split(/<\/td>/i)[0].trim());
                      
        if (tds.length >= 4) {
            const index = tds[0].replace(/\.$/, '');
            const rocDate = tds[1];
            const category = tds[2];
            const content = tds[3];
            
            const aMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            if (aMatch) {
                let href = aMatch[1].trim();
                let title = aMatch[2].replace(/<[^>]+>/g, '').trim();
                
                // Decode common HTML entities
                title = title.replace(/&amp;/g, '&')
                             .replace(/&lt;/g, '<')
                             .replace(/&gt;/g, '>')
                             .replace(/&quot;/g, '"')
                             .replace(/&#39;/g, "'");
                             
                // Resolve relative URLs
                let absoluteUrl = href;
                if (href.startsWith('NewsDetail.aspx')) {
                    absoluteUrl = `${BASE_URL}/News/${href}`;
                } else if (href.startsWith('/')) {
                    absoluteUrl = `${BASE_URL}${href}`;
                } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
                    // fall back to resolving relative to news page
                    absoluteUrl = new URL(href, NEWS_LIST_URL).href;
                }
                
                const gregorianDate = parseRocDate(rocDate);
                
                updates.push({
                    index,
                    rocDate,
                    gregorianDate,
                    category,
                    title,
                    url: absoluteUrl
                });
            }
        }
    }
    
    return updates;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

function formatDateTimeString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * Converts the generated Markdown content into a styled HTML string.
 */
function markdownToHtml(mdContent) {
    const lines = mdContent.split('\n');
    let html = '';
    let inTable = false;
    
    for (let line of lines) {
        line = line.trim();
        
        if (line.startsWith('# ')) {
            html += `<h1>${line.substring(2)}</h1>\n`;
            continue;
        }
        if (line.startsWith('### ')) {
            html += `<h3>${line.substring(4)}</h3>\n`;
            continue;
        }
        if (line === '---') {
            html += `<hr>\n`;
            continue;
        }
        
        if (line.startsWith('|')) {
            if (line.includes('---')) {
                continue; // Skip separator line
            }
            
            const cells = line.split('|').slice(1, -1).map(c => c.trim());
            
            if (!inTable) {
                inTable = true;
                html += `<table>\n<thead>\n<tr>\n`;
                for (const cell of cells) {
                    html += `<th>${cell}</th>\n`;
                }
                html += `</tr>\n</thead>\n<tbody>\n`;
            } else {
                html += `<tr>\n`;
                for (const cell of cells) {
                    html += `<td>${cell}</td>\n`;
                }
                html += `</tr>\n`;
            }
            continue;
        } else {
            if (inTable) {
                inTable = false;
                html += `</tbody>\n</table>\n`;
            }
        }
        
        if (line.length > 0) {
            html += `<p>${line}</p>\n`;
        }
    }
    
    if (inTable) {
        html += `</tbody>\n</table>\n`;
    }
    
    // Replace markdown links: [text](url) -> <a href="url">text</a>
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Wrap in full HTML template with custom CSS styling for premium look when printed
    const styledHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>全國法規資料庫 - 更新報告</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        body {
            font-family: "Microsoft JhengHei", "PMingLiU", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #2d3748;
            line-height: 1.6;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: #1a365d;
            font-size: 24px;
            border-bottom: 3px solid #3182ce;
            padding-bottom: 8px;
            margin-top: 0;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #718096;
            font-size: 14px;
            margin-bottom: 30px;
        }
        h3 {
            color: #2b6cb0;
            font-size: 16px;
            border-left: 4px solid #3182ce;
            padding-left: 10px;
            margin-top: 25px;
            margin-bottom: 15px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 13px;
        }
        th {
            background-color: #ebf8ff;
            color: #2b6cb0;
            font-weight: bold;
            border-bottom: 2px solid #bee3f8;
            padding: 10px 8px;
            text-align: left;
        }
        td {
            padding: 10px 8px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
        }
        tr:nth-child(even) {
            background-color: #f7fafc;
        }
        a {
            color: #3182ce;
            text-decoration: none;
            word-break: break-all;
        }
        a:hover {
            text-decoration: underline;
        }
        hr {
            border: 0;
            border-top: 1px solid #e2e8f0;
            margin: 25px 0;
        }
        p {
            font-size: 13px;
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        ${html}
    </div>
</body>
</html>`;

    return styledHtml;
}

/**
 * Converts a Markdown file to PDF using Microsoft Edge headless print-to-pdf.
 */
function convertMdToPdf(mdFilePath, pdfOutputPath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Converting ${path.basename(mdFilePath)} to PDF...`);
            
            // 1. Read markdown content
            const mdContent = fs.readFileSync(mdFilePath, 'utf-8');
            
            // 2. Generate HTML
            const htmlContent = markdownToHtml(mdContent);
            const tempHtmlPath = path.join(REPORTS_DIR, `temp_${Date.now()}.html`);
            
            // 3. Write HTML to temporary file
            fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
            
            // 4. Verify browser executable exists on Windows
            const browserPath = getBrowserPath();
            if (process.platform === 'win32' && !fs.existsSync(browserPath)) {
                fs.unlinkSync(tempHtmlPath); // Cleanup
                return reject(new Error(`Browser executable not found at: ${browserPath}`));
            }
            
            // 5. Run browser in headless mode to print to PDF
            const args = [
                '--headless',
                `--print-to-pdf=${pdfOutputPath}`,
                '--no-pdf-header-footer',
                '--disable-gpu',
                '--no-sandbox',
                tempHtmlPath
            ];
            
            execFile(browserPath, args, (error) => {
                // Always clean up the temporary HTML file
                try {
                    fs.unlinkSync(tempHtmlPath);
                } catch (err) {
                    console.error('Failed to delete temp HTML file:', err);
                }
                
                if (error) {
                    return reject(error);
                }
                
                console.log(`Successfully generated PDF: ${pdfOutputPath}`);
                resolve(pdfOutputPath);
            });
        } catch (err) {
            reject(err);
        }
    });
}

function sendEmail(pdfPath, mdPath) {
    return new Promise((resolve, reject) => {
        const psScript = path.join(SCRIPT_DIR, 'send_email.ps1');
        console.log(`Running email sender: ${psScript}`);
        
        execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psScript, '-PdfPath', pdfPath, '-MdPath', mdPath], (error, stdout, stderr) => {
            if (stdout) console.log(stdout.trim());
            if (stderr) console.error(stderr.trim());
            if (error) {
                return reject(error);
            }
            resolve();
        });
    });
}

async function main() {
    // If command line arguments are provided, check if we want to manually convert a file
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const cmd = args[0];
        if (cmd === 'convert' && args[1]) {
            const targetMd = path.resolve(args[1]);
            const targetPdf = targetMd.replace(/\.md$/i, '.pdf');
            try {
                await convertMdToPdf(targetMd, targetPdf);
                console.log('Conversion completed successfully.');
            } catch (err) {
                console.error('Conversion failed:', err);
                process.exit(1);
            }
            return;
        }
    }

    try {
        const updates = await fetchUpdates();
        if (updates.length === 0) {
            console.log('No updates found on the website.');
            return;
        }
        
        const processedLinks = loadHistory();
        const newUpdates = updates.filter(up => !processedLinks.has(up.url));
        
        if (newUpdates.length === 0) {
            console.log('All online updates have already been processed. No new items.');
            return;
        }
        
        // Ensure reports directory exists
        if (!fs.existsSync(REPORTS_DIR)) {
            fs.mkdirSync(REPORTS_DIR, { recursive: true });
        }
        
        // Group updates by date
        const updatesByDate = {};
        for (const up of newUpdates) {
            if (!updatesByDate[up.gregorianDate]) {
                updatesByDate[up.gregorianDate] = [];
            }
            updatesByDate[up.gregorianDate].push(up);
        }
        
        const now = new Date();
        const todayStr = formatDate(now);
        const reportFile = path.join(REPORTS_DIR, `law_updates_${todayStr}.md`);
        const fileExists = fs.existsSync(reportFile);
        
        let fileContent = '';
        if (!fileExists) {
            fileContent += `# 全國法規資料庫 - 法規更新報告 (${formatDateTimeString(now)})\n\n`;
            fileContent += '此報告由自動排程爬蟲於每日早上 10 點執行並整理產生。\n\n';
        } else {
            fileContent += `\n---\n## 額外更新偵測 (${formatDateTimeString(now).split(' ')[1]})\n\n`;
        }
        
        const sortedDates = Object.keys(updatesByDate).sort((a, b) => b.localeCompare(a));
        for (const dateKey of sortedDates) {
            fileContent += `### 📅 法規異動日期: {date_key}\n\n`.replace('{date_key}', dateKey); // avoid template literals in string template parsing issues
            fileContent += '| 類別 | 法規訊息摘要與連結 |\n';
            fileContent += '| --- | --- |\n';
            for (const up of updatesByDate[dateKey]) {
                fileContent += `| ${up.category} | [${up.title}](${up.url}) |\n`;
            }
            fileContent += '\n';
        }
        
        fs.writeFileSync(reportFile, fileContent, { flag: 'a', encoding: 'utf-8' });
        console.log(`Successfully wrote ${newUpdates.length} new updates to ${reportFile}`);
        
        // Save new links to history
        saveHistory(newUpdates.map(up => up.url));
        
        // Generate PDF version
        const pdfFile = reportFile.replace(/\.md$/i, '.pdf');
        try {
            await convertMdToPdf(reportFile, pdfFile);
            
            // Send email (skip if running in GitHub Actions, as the workflow handles it)
            if (process.env.GITHUB_ACTIONS === 'true') {
                console.log('Running in GitHub Actions environment. Local email sending step skipped.');
            } else {
                await sendEmail(pdfFile, reportFile);
            }
        } catch (err) {
            console.error('Failed to generate PDF or send email:', err);
        }
        
    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);
    }
}

main();
