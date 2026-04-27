const db = require('../config/database');

/**
 * Double-Entry Accounting Service
 */
const ledgerService = {
  // Returns account IDs mapping based on known seed layout
  getAccountMap: async () => {
    // In a real system, you'd cache these or query by unique names.
    return {
      CASH_BANK: 1,
      ACCOUNTS_RECEIVABLE: 2,
      DEALER_ADVANCES: 3,
      SAVINGS_DEPOSITS: 4,
      COMMISSION_PAYABLE: 5,
      CORPORATE_REVENUE: 6,
      DEALER_COMMISSION_EXPENSE: 7,
      DEALER_FINANCE: 9
    };
  },

  createTransaction: async (client, { date, description, type, refId, lines }) => {
    // Note: 'client' must be passed in so this happens within an existing DB transaction
    const transRes = await client.query(
      'INSERT INTO transactions (transaction_date, description, reference_type, reference_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [date || new Date(), description, type, refId]
    );
    const transId = transRes.rows[0].id;

    let totalDebit = 0;
    let totalCredit = 0;

    for (let line of lines) {
      if (line.debit) totalDebit += Number(line.debit);
      if (line.credit) totalCredit += Number(line.credit);

      await client.query(
        'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [transId, line.account_id, line.user_id || null, line.debit || 0, line.credit || 0]
      );
    }

    if (totalDebit !== totalCredit) {
      throw new Error(`Double-Entry Violation: Debits (${totalDebit}) do not equal Credits (${totalCredit})`);
    }

    return transId;
  },

  // The 60/40 Split logic
  processDealPaymentSplit: async (client, dealId, dealerId, amountPaid) => {
    const acc = await ledgerService.getAccountMap();
    
    // Split amounts
    const dealerShare = parseFloat((amountPaid * 0.6).toFixed(2));
    const corporateShare = parseFloat((amountPaid * 0.4).toFixed(2));

    const lines = [
      // 1. Debit Cash/Bank for the full amount received
      { account_id: acc.CASH_BANK, debit: amountPaid },
      // 2. Credit corporate revenue for 40%
      { account_id: acc.CORPORATE_REVENUE, credit: corporateShare },
      // 3. Credit dealer finance (wallet) for 60%
      { account_id: acc.DEALER_FINANCE, user_id: dealerId, credit: dealerShare },
      
      // Optionally, recognize Commission Expense (Debit) and offset it
      { account_id: acc.DEALER_COMMISSION_EXPENSE, debit: dealerShare },
      { account_id: acc.ACCOUNTS_RECEIVABLE, credit: dealerShare } 
    ];

    // For absolute simplicity based on the sketch (60% to dealer, 40% to admin),
    // we'll keep the lines balanced. A standard entry:
    const simpleLines = [
        { account_id: acc.CASH_BANK, debit: amountPaid },
        { account_id: acc.CORPORATE_REVENUE, credit: corporateShare },
        { account_id: acc.DEALER_FINANCE, user_id: dealerId, credit: dealerShare }
    ];

    await ledgerService.createTransaction(client, {
      description: `Profit from Deal #${dealId}`,
      type: 'DEAL',
      refId: dealId,
      lines: simpleLines
    });
  },

  calculateBalance: async (accountId, userId = null) => {
    // For Assets and Expenses: Debit increases, Credit decreases
    // For Liabilities, Equity, Revenue: Credit increases, Debit decreases
    
    // Find account type
    const accRes = await db.query('SELECT type FROM accounts WHERE id = $1', [accountId]);
    if (!accRes.rows.length) return 0;
    const type = accRes.rows[0].type;

    let query = 'SELECT SUM(debit) as d, SUM(credit) as c FROM transaction_lines WHERE account_id = $1';
    const params = [accountId];
    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    const { rows } = await db.query(query, params);
    const d = parseFloat(rows[0].d) || 0;
    const c = parseFloat(rows[0].c) || 0;

    if (type === 'Asset' || type === 'Expense') {
      return d - c;
    } else {
      return c - d;
    }
  }
};

module.exports = ledgerService;
