-- Drift calibration APPLY
-- Generated: 2026-04-24 21:28:21
-- Mục đích: chèn các record vào store_fund_history để RPC event-sourced
-- trả về đúng bằng stores.cash_fund hiện tại, tránh user thấy số nhảy
-- sau khi deploy PR2.
--
-- Tag để rollback: [DRIFT_CALIBRATION_2026_04_24]
-- Date: 2022-01-01 (trước khi store tạo → chart không hiện record này)
--
-- SỐ LƯỢNG STORE ĐƯỢC CALIBRATE: 15
--
-- LƯU Ý: CHẠY TRONG TRANSACTION để có thể ROLLBACK nếu sai.

BEGIN;

-- P: cash_fund=5,278,350,000, RPC=5,744,550,000, drift=+466,200,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('c376213e-3197-4980-a87a-d77a1dfe2a33', 'withdrawal', 466200000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] P: adjust +466,200,000 để RPC khớp cash_fund');

-- Nam sms: cash_fund=-438,340,000, RPC=-231,000,000, drift=+207,340,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('17bf2ffb-29ee-4e2e-8445-9b030417cf3b', 'withdrawal', 207340000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] Nam sms: adjust +207,340,000 để RPC khớp cash_fund');

-- H1168: cash_fund=3,515,329,999, RPC=3,667,579,999, drift=+152,250,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('e6e318a5-1470-441c-b677-8df6474d2d2f', 'withdrawal', 152250000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] H1168: adjust +152,250,000 để RPC khớp cash_fund');

-- 1: cash_fund=4,372,549,928, RPC=4,502,399,928, drift=+129,850,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('eeae2b68-16a0-49a2-9389-5cb5237d7fbe', 'withdrawal', 129850000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] 1: adjust +129,850,000 để RPC khớp cash_fund');

-- Điện thoại HĐ: cash_fund=350,070,500, RPC=402,940,507, drift=+52,870,007
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('ab21478a-951b-494f-9834-52ee097cebb7', 'withdrawal', 52870007, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] Điện thoại HĐ: adjust +52,870,007 để RPC khớp cash_fund');

-- Linh sms: cash_fund=132,700,000, RPC=177,700,000, drift=+45,000,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('ce1825b8-645b-4724-9dca-6f3a72a42cd9', 'withdrawal', 45000000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] Linh sms: adjust +45,000,000 để RPC khớp cash_fund');

-- Q: cash_fund=4,711,650,000, RPC=4,740,050,000, drift=+28,400,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('ebca76f5-c35b-4cf2-9c71-3fcce1265293', 'withdrawal', 28400000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] Q: adjust +28,400,000 để RPC khớp cash_fund');

-- 11: cash_fund=4,975,050,000, RPC=5,002,300,000, drift=+27,250,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('01e2eb77-a1a0-4894-b22e-9d6fc143b23b', 'withdrawal', 27250000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] 11: adjust +27,250,000 để RPC khớp cash_fund');

-- P45678: cash_fund=4,144,610,000, RPC=4,165,310,000, drift=+20,700,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('aaccfd1f-f0dc-4644-935a-aeb5cca50045', 'withdrawal', 20700000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] P45678: adjust +20,700,000 để RPC khớp cash_fund');

-- 10: cash_fund=4,754,950,000, RPC=4,768,000,000, drift=+13,050,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('f8ee9a79-a086-47d7-a9fb-41d9d9516b4c', 'withdrawal', 13050000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] 10: adjust +13,050,000 để RPC khớp cash_fund');

-- test_store_1: cash_fund=0, RPC=-6,200,000, drift=-6,200,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('f3dfd76f-5dc0-4178-ad57-b8fea8eb94c0', 'deposit', 6200000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] test_store_1: adjust -6,200,000 để RPC khớp cash_fund');

-- Abc6868: cash_fund=-21,900,000, RPC=-27,800,000, drift=-5,900,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('07914511-e9e1-471e-aa1f-fc4ab8dcc9e3', 'deposit', 5900000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] Abc6868: adjust -5,900,000 để RPC khớp cash_fund');

-- 100HD: cash_fund=655,706,013, RPC=657,066,015, drift=+1,360,002
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('02d88f43-17a1-478c-a6f3-2c5003d57563', 'withdrawal', 1360002, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] 100HD: adjust +1,360,002 để RPC khớp cash_fund');

-- T: cash_fund=4,941,325,000, RPC=4,941,825,000, drift=+500,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('76ebe948-b898-4dee-a086-8577c114d88e', 'withdrawal', 500000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] T: adjust +500,000 để RPC khớp cash_fund');

-- CH Q +++ (10%): cash_fund=7,751,750,000, RPC=7,752,200,000, drift=+450,000
INSERT INTO store_fund_history (store_id, transaction_type, fund_amount, created_at, note)
VALUES ('67d6f056-e284-4973-a3d4-cb20138be8be', 'withdrawal', 450000, '2022-01-01 00:00:00+07', '[DRIFT_CALIBRATION_2026_04_24] CH Q +++ (10%): adjust +450,000 để RPC khớp cash_fund');

-- Verify: chạy query này để kiểm tra số record đã insert
-- SELECT COUNT(*), SUM(CASE WHEN transaction_type='deposit' THEN fund_amount ELSE -fund_amount END)
-- FROM store_fund_history WHERE note LIKE '[DRIFT_CALIBRATION_2026_04_24]%';

-- Nếu kết quả OK → chạy:
COMMIT;

-- Nếu sai → chạy:
-- ROLLBACK;