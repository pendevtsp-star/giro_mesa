CREATE OR REPLACE FUNCTION "prevent_staff_finance_ledger_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'staff finance financial events are append-only';
END;
$$;--> statement-breakpoint

CREATE TRIGGER "operational_occurrence_events_append_only"
BEFORE UPDATE OR DELETE ON "operational_occurrence_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_staff_finance_ledger_mutation"();--> statement-breakpoint

CREATE TRIGGER "commission_payment_records_append_only"
BEFORE UPDATE OR DELETE ON "commission_payment_records"
FOR EACH ROW EXECUTE FUNCTION "prevent_staff_finance_ledger_mutation"();
