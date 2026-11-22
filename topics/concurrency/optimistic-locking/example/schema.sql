-- Toy table for the optimistic-locking topic.
-- `version` is the compare-and-swap token: every successful write bumps it,
-- and a write only lands if the client's baseVersion still equals it.
CREATE TABLE IF NOT EXISTS documents (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),  -- built in since Postgres 13
  title      text        NOT NULL,
  body       text        NOT NULL DEFAULT '',
  version    integer     NOT NULL DEFAULT 1,
  updated_by text        NOT NULL,                               -- JWT `sub` of the last writer
  updated_at timestamptz NOT NULL DEFAULT now()
);
