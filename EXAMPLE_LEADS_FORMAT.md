# Excel File Format for Meta Ads CRM Leads Import

## Required Columns

Your Excel file should contain the following columns (column names are case-insensitive and flexible):

### Column Names (Any of these will work):

1. **Name** (Required)
   - Column names accepted: `Name`, `name`, `Full Name`
   - Example: "John Doe"

2. **Email** (Optional)
   - Column names accepted: `Email`, `email`, `Email Address`
   - Example: "john.doe@example.com"

3. **Phone** (Optional)
   - Column names accepted: `Phone`, `phone`, `Phone Number`, `Mobile`
   - Example: "+923001234567" or "03001234567"

4. **Date** (Optional)
   - Column names accepted: `Date`, `date`, `Lead Date`, `Created Time`
   - Example: "2024-01-15" or Excel date format

5. **Campaign Name** (Optional)
   - Column names accepted: `Campaign Name`, `campaign_name`, `Campaign`
   - Example: "Summer Property Campaign"

## Example Excel File Structure

| Name | Email | Phone | Date | Campaign Name |
|------|-------|-------|------|---------------|
| John Doe | john.doe@example.com | +1234567890 | 2024-01-15 | Summer Property Campaign |
| Jane Smith | jane.smith@example.com | +1234567891 | 2024-01-16 | Summer Property Campaign |
| Ahmed Khan | ahmed.khan@example.com | +923001234567 | 2024-01-17 | Residential Plots Campaign |
| Fatima Ali | fatima.ali@example.com | +923001234568 | 2024-01-18 | Commercial Properties Campaign |

## Notes

- **Name is the only required field** - all other fields are optional
- The system will skip duplicate leads (based on email or phone number)
- Date can be in various formats - Excel dates, ISO format (YYYY-MM-DD), or text dates
- Empty rows will be skipped
- The file should be saved as `.xlsx` or `.xls` format

## Sample File

A sample CSV file (`example-leads.csv`) is provided that you can:
1. Open in Excel
2. Save as `.xlsx` format
3. Use for testing

## How to Use

1. Download your leads from Meta Ads CRM as Excel
2. Ensure the columns match the expected names (or rename them)
3. Go to Leads page in the CRM
4. Click "Upload Excel" button
5. Select your file
6. Wait for import confirmation

