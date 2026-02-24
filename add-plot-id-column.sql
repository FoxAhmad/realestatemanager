-- SQL script to add plot_id column to inventory_payments table
-- Run this if the migration script fails with "column plot_id does not exist"

ALTER TABLE inventory_payments 
ADD COLUMN IF NOT EXISTS plot_id INTEGER REFERENCES inventory_plots(id) ON DELETE SET NULL;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory_payments' AND column_name = 'plot_id';

