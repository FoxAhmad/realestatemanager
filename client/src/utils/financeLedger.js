/**
 * Finance ledger row merging.
 *
 * GET /finance/entries returns one row per Dealer Finance (account 9) transaction line.
 * A wallet movement that was transferred into a balance account therefore comes back as
 * TWO rows in different transactions: the finance entry's credit, and the balance entry's
 * offsetting Dealer Finance debit. This collapses such a pair into a single display row.
 *
 * The merged row's identity (id, line_id) is ALWAYS taken from the credit side — the
 * finance entry itself — so Edit and Delete act on a predictable transaction. Taking it
 * from whichever row sorted first by date meant the action target changed depending on
 * the dates entered, and could hit the balance transaction instead.
 */
export function mergeFinanceEntries(entries) {
  const processedEntries = [];
  const usedIndices = new Set();

  entries.forEach((entry, idx) => {
    if (usedIndices.has(idx)) return;

    const isCredit = parseFloat(entry.credit) > 0;
    const isDebit = parseFloat(entry.debit) > 0;
    const amount = isCredit ? parseFloat(entry.credit) : parseFloat(entry.debit);

    // Look ahead for an equal, opposite-sign row belonging to the same dealer.
    let matchIdx = -1;
    if (amount > 0) {
      for (let j = idx + 1; j < entries.length; j++) {
        if (usedIndices.has(j)) continue;
        const other = entries[j];
        const otherDealer = other.user_name || 'System';
        const thisDealer = entry.user_name || 'System';

        if (otherDealer === thisDealer) {
          const otherCredit = parseFloat(other.credit) || 0;
          const otherDebit = parseFloat(other.debit) || 0;

          if (isCredit && otherDebit === amount) { matchIdx = j; break; }
          if (isDebit && otherCredit === amount) { matchIdx = j; break; }
        }
      }
    }

    if (matchIdx !== -1) {
      usedIndices.add(idx);
      usedIndices.add(matchIdx);
      const matchEntry = entries[matchIdx];

      // Identity comes from the credit (finance) side, regardless of sort order.
      const creditSide = isCredit ? entry : matchEntry;
      const debitSide = isCredit ? matchEntry : entry;

      processedEntries.push({
        ...creditSide,
        credit: amount,
        debit: amount,
        is_merged: true,
        credit_txn_id: creditSide.id,
        debit_txn_id: debitSide.id,
        descriptions: new Set([entry.description, matchEntry.description].filter(Boolean)),
        proof_files: [entry.proof_file, matchEntry.proof_file].filter(Boolean),
        instruments: new Set([
          `${entry.instrument || ''} ${entry.instrument_number || ''}`.trim(),
          `${matchEntry.instrument || ''} ${matchEntry.instrument_number || ''}`.trim()
        ].filter(Boolean)),
        vouchers: new Set([entry.voucher_no, matchEntry.voucher_no].filter(Boolean)),
        transaction_date: entry.transaction_date,
        other_date: new Date(matchEntry.transaction_date).toLocaleDateString() !== new Date(entry.transaction_date).toLocaleDateString()
          ? matchEntry.transaction_date
          : null
      });
    } else {
      usedIndices.add(idx);
      processedEntries.push({
        ...entry,
        credit: parseFloat(entry.credit) || 0,
        debit: parseFloat(entry.debit) || 0,
        is_merged: false,
        descriptions: new Set(entry.description ? [entry.description] : []),
        proof_files: entry.proof_file ? [entry.proof_file] : [],
        instruments: new Set([`${entry.instrument || ''} ${entry.instrument_number || ''}`.trim()].filter(Boolean)),
        vouchers: new Set(entry.voucher_no ? [entry.voucher_no] : [])
      });
    }
  });

  // Running balance, oldest row first (the list is newest-first).
  let currentBalance = 0;
  for (let i = processedEntries.length - 1; i >= 0; i--) {
    currentBalance += (processedEntries[i].credit - processedEntries[i].debit);
    processedEntries[i].runningBal = currentBalance;
  }

  return processedEntries;
}
