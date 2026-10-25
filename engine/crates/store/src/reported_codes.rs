pub const REPORTED_CODES: &str = "(
      SELECT code AS reported_code, operator_id FROM public.plmns
      UNION ALL
      SELECT other_length.code, other_length.operator_id
      FROM (
        SELECT mcc || CASE WHEN length(mnc) = 2 THEN '0' || mnc WHEN mnc LIKE '0%' THEN substr(mnc, 2) END AS code, operator_id FROM public.plmns
      ) other_length
      WHERE other_length.code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plmns taken WHERE taken.code = other_length.code)
    )";
