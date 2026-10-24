# Development status and compatibility policy

**This project is not in production.** It is under active development, and there are no existing installations or production databases that need to be preserved.

Until this note is explicitly changed by the project owner:

- Treat the database schema and stored data as disposable development state.
- Make direct schema changes as needed; do not add migration frameworks, migration histories, upgrade paths, or backwards-compatibility work solely to support hypothetical existing installations.
- Tests and local setup may assume a fresh database.
- Resetting or recreating the local development database is acceptable when schema changes require it.
- Continue to use repeatable setup SQL where convenient, but do not confuse that with a requirement to support upgrades from older deployed schemas.

When the project owner updates this policy to indicate that an installation or production data must be preserved, revisit schema evolution, migrations, backup/restore, and upgrade procedures before relying on the system operationally.
