-- Convert collateral_detail from TEXT to JSONB for storing dynamic attributes
-- Since there's no existing data, we can directly change the column type

-- Drop the old column and recreate as JSONB
ALTER TABLE pawns DROP COLUMN IF EXISTS collateral_detail;
ALTER TABLE pawns ADD COLUMN collateral_detail JSONB;

-- Add comment to explain the new structure
COMMENT ON COLUMN pawns.collateral_detail IS 'Chi tiết tài sản thế chấp dưới dạng JSON. Cấu trúc: {"name": "tên tài sản", "attributes": {"attr_01": "giá trị 1", "attr_02": "giá trị 2"}}';

-- Create GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_pawns_collateral_detail_gin ON pawns USING GIN (collateral_detail);

-- Example of the new JSON structure:
-- {
--   "name": "Xe máy Honda Wave màu đỏ",
--   "attributes": {
--     "attr_01": "29A-12345",     -- Biển số xe
--     "attr_02": "Honda",         -- Hãng xe  
--     "attr_03": "Đỏ",           -- Màu sắc
--     "attr_04": "2020",         -- Năm sản xuất
--     "attr_05": "Tốt"           -- Tình trạng
--   }
-- } 