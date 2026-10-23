#!/usr/bin/env sh
set -eu
export TAVOLOFLOW_INIT_APP_PASSWORD=$(cat /run/secrets/app_password)
# psql variables are SQL-quoted rather than interpolated into SQL source.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password TAVOLOFLOW_INIT_APP_PASSWORD
CREATE ROLE tavoloflow_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE tavoloflow TO tavoloflow_app;
GRANT USAGE ON SCHEMA public TO tavoloflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tavoloflow_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tavoloflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tavoloflow_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tavoloflow_app;
SQL
