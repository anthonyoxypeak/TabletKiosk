# Azure App Settings

Set these on the Azure Web App that serves the kiosk, currently `oxypeak-to-tablets`.

## Required For Production

```text
KIOSK_TIME_ZONE=America/New_York
KIOSK_DIVE_DURATION_MINUTES=120
KIOSK_CHAMBER_PREFIX=HBOT
KIOSK_API_KEY=<long random value>
KIOSK_ALLOWED_ORIGINS=https://oxypeak-to-tablets-grc7htdehuhea4b5.centralus-01.azurewebsites.net,https://anthonyoxypeak.github.io
NODE_ENV=production
```

## Required Database Connection

Use either `DATABASE_URL`:

```text
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<database>?sslmode=require
```

Or individual variables:

```text
PGHOST=<postgres host>
PGDATABASE=<database name>
PGUSER=<database user>
PGPASSWORD=<database password>
PGPORT=5432
```

From Dion's downloaded tablet guide, likely values are:

```text
PGHOST=psql-hbot-prod.postgres.database.azure.com
PGDATABASE=hbot_scheduling
PGUSER=hbotadmin
PGPORT=5432
```

The password must come from Dion/Azure Key Vault, and the App Service must be able to reach the PostgreSQL private network.

## Azure CLI Version

If Azure CLI is installed and logged in:

```bash
az webapp config appsettings set \
  --resource-group rg-hbot-prod \
  --name oxypeak-to-tablets \
  --settings \
    KIOSK_TIME_ZONE=America/New_York \
    KIOSK_DIVE_DURATION_MINUTES=120 \
    KIOSK_CHAMBER_PREFIX=HBOT \
    KIOSK_API_KEY="<long random value>" \
    KIOSK_ALLOWED_ORIGINS="https://oxypeak-to-tablets-grc7htdehuhea4b5.centralus-01.azurewebsites.net,https://anthonyoxypeak.github.io" \
    NODE_ENV=production \
    PGHOST="psql-hbot-prod.postgres.database.azure.com" \
    PGDATABASE="hbot_scheduling" \
    PGUSER="hbotadmin" \
    PGPASSWORD="<database password>" \
    PGPORT="5432"
```

Then restart:

```bash
az webapp restart --resource-group rg-hbot-prod --name oxypeak-to-tablets
```

## Smoke Tests

```bash
curl https://oxypeak-to-tablets-grc7htdehuhea4b5.centralus-01.azurewebsites.net/health
curl "https://oxypeak-to-tablets-grc7htdehuhea4b5.centralus-01.azurewebsites.net/api/tablet/session?chamber=1&seat=1&key=<KIOSK_API_KEY>"
```

Expected `health` response:

```json
{
  "status": "ok",
  "provider": "postgres",
  "demoMode": false,
  "apiKeyEnabled": true
}
```
