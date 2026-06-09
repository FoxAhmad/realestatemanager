const xlsx = require('xlsx');
const path = require('path');

function inspectExcel(filename) {
    console.log(`\n--- Inspecting ${filename} ---`);
    const filePath = path.join(__dirname, '..', filename);
    const workbook = xlsx.readFile(filePath);
    
    for (const sheetName of workbook.SheetNames) {
        console.log(`\nSheet: ${sheetName}`);
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
        
        console.log(`Total Rows: ${data.length}`);
        const rowsToPrint = Math.min(data.length, 15);
        for (let i = 0; i < rowsToPrint; i++) {
            console.log(`Row ${i + 1}:`, JSON.stringify(data[i]));
        }
    }
}

inspectExcel('For Software (Advances for New deal).xlsx');
inspectExcel('For Software (Certificates).xlsx');
