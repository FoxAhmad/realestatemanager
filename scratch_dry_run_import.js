const xlsx = require('xlsx');
const path = require('path');

function dryRun() {
    const wb = xlsx.readFile(path.join(__dirname, 'For Software (Certificates).xlsx'));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

    // Find the header row index
    let headerRowIdx = -1;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row && row.includes('Estate/Office')) {
            headerRowIdx = i;
            break;
        }
    }

    if (headerRowIdx === -1) {
        console.log('Could not find header row with "Estate/Office"');
        return;
    }

    const headers = data[headerRowIdx];
    console.log('Found Headers:', headers);

    const staffList = ['Azam', 'Umar Khan', 'Murtaza', 'Hafiz Shah', 'Adil Siraj', 'Zain'];
    
    let customersToCreate = new Set();
    let staffEntries = [];
    let customerEntries = [];

    // Process data rows
    for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        // Map row to headers
        let rowObj = {};
        for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
                rowObj[headers[j]] = row[j];
            }
        }

        const name = rowObj['Estate/Office'];
        if (!name) continue;

        const amount = rowObj['Total Amount']; // Assuming this is the amount column
        const qty = rowObj['Qty'];

        if (staffList.includes(name)) {
            staffEntries.push({ name, qty, amount });
        } else {
            customersToCreate.add(name);
            customerEntries.push({ name, qty, amount });
        }
    }

    console.log('\n--- DRY RUN SUMMARY ---');
    console.log(`Staff entries found: ${staffEntries.length}`);
    console.log(`Customer entries found: ${customerEntries.length}`);
    console.log(`Unique Customers to create: ${customersToCreate.size}`);
    
    console.log('\nCustomers to be created in DB:');
    Array.from(customersToCreate).forEach(c => console.log(' - ' + c));

    console.log('\nSample Customer Entries (First 5):');
    console.log(customerEntries.slice(0, 5));
}

dryRun();
