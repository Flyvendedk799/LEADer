ALTER TABLE "Deal" ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE FUNCTION leader_deal_closed_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('WON', 'LOST') THEN NEW."closedAt" := CURRENT_TIMESTAMP; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('WON', 'LOST') THEN NEW."closedAt" := CURRENT_TIMESTAMP;
    ELSE NEW."closedAt" := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER leader_deal_outcome BEFORE INSERT OR UPDATE ON "Deal"
FOR EACH ROW EXECUTE FUNCTION leader_deal_closed_at();
