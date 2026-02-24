-- SQL script to add plot_numbers_input column to inventory table
-- Run this if you get "column plot_numbers_input does not exist" error

ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS plot_numbers_input TEXT;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory' AND column_name = 'plot_numbers_input';

