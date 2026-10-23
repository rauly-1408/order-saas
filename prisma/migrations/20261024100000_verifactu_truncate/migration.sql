-- VeriFactu: tampoco se puede vaciar el registro de golpe (TRUNCATE).
CREATE OR REPLACE FUNCTION invoice_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'VeriFactu: el registro de facturación no se puede vaciar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_no_truncate
BEFORE TRUNCATE ON "Invoice"
FOR EACH STATEMENT EXECUTE FUNCTION invoice_no_truncate();
