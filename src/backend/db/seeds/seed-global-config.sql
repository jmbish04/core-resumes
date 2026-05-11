INSERT INTO `global_config` (`key`, `value`, `updated_at`) VALUES
('compensation_baseline', '{"totalCompensation":260672,"equityTotal":750000,"perks":"Google standard perks (free meals, transit, 401k match, etc)","w2Verified":true,"context":"Historical Google compensation used as benchmark."}', 1714521600000)
ON CONFLICT(`key`) DO UPDATE SET `value`=excluded.`value`, `updated_at`=excluded.`updated_at`;
