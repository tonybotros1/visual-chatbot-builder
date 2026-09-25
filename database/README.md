# Database

PostgreSQL stores ownership and version metadata relationally while graph documents live in `bot_versions.flow_json` as JSONB.

The development app keeps one mutable draft row (`version_number = 0`, `published = false`). Published versions will be immutable numbered snapshots.

