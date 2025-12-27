# Trades & Services System

## Overview

Hybrid database approach for managing professional trades and service keyword mappings.

- **Database**: PostgreSQL via Prisma (Trade + ServiceMapping tables)
- **Cache**: 5-minute in-memory cache for fast lookups
- **Admin UI**: Integrated into existing admin portal at `/admin/trades`

## Setup & Migration

### 1. Generate Migration

Since the schema has been updated, generate and run the migration on your database:

```powershell
cd apps/api
pnpm prisma migrate deploy
```

Or to create a new migration locally:

```powershell
pnpm prisma migrate dev --name add_trades_and_service_mappings
```

### 2. Seed Initial Data

Populate the database with existing SERVICE_TO_PROFESSION data:

```powershell
cd apps/api
npx tsx prisma/seed-trades.ts
```

This will create:
- 10 core trades (Plumber, Electrician, Carpenter, etc.)
- 150+ service keyword mappings

### 3. Verify API Endpoints

Once the API is running, test the endpoints:

```powershell
# Get all trades
Invoke-RestMethod -Uri "https://fitouthub.onrender.com/trades"

# Match a service keyword
Invoke-RestMethod -Uri "https://fitouthub.onrender.com/trades/match?keyword=leaky pipe"

# Get legacy mappings (backward compatible)
Invoke-RestMethod -Uri "https://fitouthub.onrender.com/trades/legacy-mappings"
```

## Admin UI Features

Navigate to **`/admin/trades`** in the admin portal.

### Trades Management
- **Create**: Add new trades with category, profession type, aliases
- **Edit**: Toggle enabled/disabled, featured status
- **Delete**: Remove trades (cascades to service mappings)
- **Usage Tracking**: See how often each trade is matched

### Service Mappings
- **Add Keywords**: Map user queries like "fix leaky pipe" to "Plumber"
- **Bulk Management**: View all mappings per trade
- **Remove**: Delete outdated or incorrect mappings
- **Usage Analytics**: Track popular search terms

## API Endpoints

### Trades
- `GET /trades` - List all enabled trades (cached)
- `GET /trades/:id` - Get trade detail with mappings
- `POST /trades` - Create new trade (admin)
- `PUT /trades/:id` - Update trade (admin)
- `DELETE /trades/:id` - Delete trade (admin)

### Service Mappings
- `GET /trades/match?keyword={query}` - Match keyword to profession type
- `POST /trades/:tradeId/mappings` - Add keyword mapping (admin)
- `PUT /trades/mappings/:id` - Update mapping (admin)
- `DELETE /trades/mappings/:id` - Delete mapping (admin)

### Backward Compatibility
- `GET /trades/legacy-mappings` - Returns Record<string, string> format like old SERVICE_TO_PROFESSION

## Caching Strategy

- **In-Memory Cache**: Trades and mappings loaded on API startup
- **TTL**: 5 minutes before auto-refresh
- **Invalidation**: Cache refreshes immediately on any create/update/delete
- **Performance**: Sub-millisecond lookups for service matching

## Schema

### Trade Model
```typescript
{
  id: string;
  name: string;              // "Plumber", "Electrician"
  category: string;          // "contractor", "company", "reseller"
  professionType?: string;   // Maps to Professional.professionType
  aliases: string[];         // ["Plumbing", "Drainage Specialist"]
  description?: string;
  enabled: boolean;
  featured: boolean;
  sortOrder: number;
  usageCount: number;        // Incremented on each match
}
```

### ServiceMapping Model
```typescript
{
  id: string;
  keyword: string;           // "leaky pipe", "fix toilet"
  tradeId: string;           // Foreign key to Trade
  confidence: number;        // 0-100 for fuzzy matching
  enabled: boolean;
  usageCount: number;
}
```

## Future Enhancements

- [ ] Client-side caching (localStorage) for faster page loads
- [ ] Fuzzy matching with confidence scores
- [ ] Auto-suggest in admin UI based on existing keywords
- [ ] Analytics dashboard showing popular searches
- [ ] Bulk import/export CSV for keyword mappings
- [ ] Machine learning suggestions based on usage patterns

## Migration Notes

The old `SERVICE_TO_PROFESSION` constant in `service-matcher.ts` is still in use by the client. Next step: update client components to fetch from `/trades` API instead of using the hardcoded map.

This allows gradual migration:
1. ✅ Database and API ready
2. ✅ Admin UI functional
3. ⏳ Update client to use API
4. ⏳ Remove hardcoded SERVICE_TO_PROFESSION
