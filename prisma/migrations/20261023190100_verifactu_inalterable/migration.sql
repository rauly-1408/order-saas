-- VeriFactu: el registro de facturación es inalterable (RD 1007/2023, art. 8).
-- No se puede borrar ningún registro, y de uno existente solo puede cambiar su
-- estado de envío a la AEAT (aeatStatus, aeatResponse).
CREATE OR REPLACE FUNCTION invoice_inalterable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VeriFactu: los registros de facturación no se pueden borrar';
  END IF;
  IF (to_jsonb(NEW) - 'aeatStatus' - 'aeatResponse') IS DISTINCT FROM (to_jsonb(OLD) - 'aeatStatus' - 'aeatResponse') THEN
    RAISE EXCEPTION 'VeriFactu: los registros de facturación no se pueden modificar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_inalterable
BEFORE UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION invoice_inalterable();
