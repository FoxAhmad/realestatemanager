-- SQL script to add requested_plot_ids column to inventory_requests table
-- Run this if you get errors about requested_plot_ids column

ALTER TABLE inventory_requests 
ADD COLUMN IF NOT EXISTS requested_plot_ids INTEGER[];

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory_requests' AND column_name = 'requested_plot_ids';

