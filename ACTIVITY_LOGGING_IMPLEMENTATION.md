# Activity Logging Implementation Guide

## Overview
This implementation adds comprehensive activity logging to track user actions like account creation, login, and logout across the platform.

## Database Setup

### 1. Create ActivityLog Table in Supabase
Run the SQL file: `apps/api/prisma/CREATE_ACTIVITY_LOG_TABLE.sql`

This creates:
- ActivityLog table with fields for tracking user/professional actions
- Foreign key constraints to User and Professional tables
- Indexes for performance on userId, professionalId, action, createdAt, actorType, and status
- Common action types documented in comments

### 2. Update Prisma Schema
The Prisma schema has been updated to include the ActivityLog model with relations to User and Professional models.

**Run these commands to sync:**
```bash
cd apps/api
npx prisma generate
npx prisma db pull  # If needed to sync with Supabase
```

## Backend Implementation

### Files Created:
1. **apps/api/src/activity-log/activity-log.service.ts**
   - Core service for creating and querying activity logs
   - Helper methods: `logAccountCreated()`, `logLogin()`, `logLogout()`, `logLoginFailed()`, `logPasswordChanged()`
   - Supports pagination and filtering

2. **apps/api/src/activity-log/activity-log.controller.ts**
   - GET /activity-log endpoint with pagination and filters
   - Query params: page, limit, action, actorType, status
   - Protected by JWT authentication

3. **apps/api/src/activity-log/activity-log.module.ts**
   - Module configuration exporting ActivityLogService

### Files Modified:
1. **apps/api/src/auth/auth.service.ts**
   - Added ActivityLogService injection
   - Logs account creation on registration
   - Logs successful logins and failed attempts

2. **apps/api/src/professional-auth/professional-auth.service.ts**
   - Added ActivityLogService injection
   - Logs professional account creation
   - Logs professional logins and failed attempts

3. **apps/api/src/auth/auth.module.ts**
   - Imports ActivityLogModule

4. **apps/api/src/professional-auth/professional-auth.module.ts**
   - Imports ActivityLogModule

5. **apps/api/src/app.module.ts**
   - Added ActivityLogModule to imports

6. **apps/api/prisma/schema.prisma**
   - Added ActivityLog model with relations
   - Updated User and Professional models with activityLogs relation

## Frontend Implementation

### Files Modified:
1. **apps/web/src/app/admin/activity-log/page.tsx**
   - Converted from static placeholder to dynamic API-connected page
   - Fetches logs from /activity-log endpoint
   - Real-time timestamp formatting (e.g., "2h ago", "Yesterday")
   - Shows actor name, action, status badge, and details
   - Supports pagination (50 logs per page)

## Activity Log Actions

### Currently Implemented:
- `account_created` - New user or professional registration
- `login` - Successful login (user, professional, or admin)
- `logout` - User logout
- `login_failed` - Failed login attempt
- `password_changed` - Password update

### Ready for Future Use:
- `profile_updated` - Profile changes
- `project_created` / `project_updated` / `project_deleted` - Project lifecycle
- `quote_submitted` / `quote_approved` - Quote workflow
- `payment_requested` / `payment_released` / `escrow_confirmed` - Financial events
- `user_suspended` / `user_approved` - Admin actions
- `bulk_action` / `data_exported` - Bulk operations
- `migration_run` / `backup_created` / `email_sent` - System events

## Status Types
- `success` - Successful operations (green badge)
- `info` - Informational events (blue badge)
- `warning` - Warning events like failed logins (amber badge)
- `danger` - Critical events like deletions (red badge)

## Actor Types
- `user` - Regular client users
- `professional` - Contractors/professionals
- `admin` - Admin users
- `system` - Automated system events

## Usage Examples

### Log a Custom Action:
```typescript
// In any service with ActivityLogService injected
await this.activityLogService.create({
  userId: user.id,
  actorName: `${user.firstName} ${user.surname}`,
  actorType: 'user',
  action: 'project_created',
  resource: 'Project',
  resourceId: project.id,
  details: `Created project: ${project.title}`,
  status: 'success',
});
```

### Query Activity Logs:
```typescript
// From frontend
const response = await fetch(
  `${API_BASE_URL}/activity-log?page=1&limit=50&action=login&status=warning`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
const { logs, pagination } = await response.json();
```

## Next Steps

1. **Run Prisma Commands:**
   ```bash
   cd apps/api
   npx prisma generate
   ```

2. **Run SQL Migration:**
   - Open Supabase SQL Editor
   - Execute `apps/api/prisma/CREATE_ACTIVITY_LOG_TABLE.sql`

3. **Test the Implementation:**
   - Register a new account → Check activity log for "Account Created"
   - Login → Check for "Logged In" entry
   - Try wrong password → Check for "Login Failed" warning

4. **Future Enhancements:**
   - Add IP address and user agent tracking (pass from request headers)
   - Add filters to activity log page UI (action type, date range, actor)
   - Add export functionality (CSV/JSON)
   - Log more actions (profile updates, project changes, financial events)
   - Add drill-through links to view the referenced resource

## API Endpoints

### GET /activity-log
Fetch activity logs with pagination and filtering.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50)
- `action` (string, optional) - Filter by action type
- `actorType` (string, optional) - Filter by actor type
- `status` (string, optional) - Filter by status

**Response:**
```json
{
  "logs": [
    {
      "id": "...",
      "actorName": "John Doe",
      "action": "login",
      "resource": null,
      "resourceId": null,
      "details": "User logged in",
      "status": "info",
      "createdAt": "2026-01-12T10:30:00Z",
      "user": { "firstName": "John", "surname": "Doe", "email": "john@example.com" }
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "pages": 3
  }
}
```

## Security Notes
- Activity log endpoint is protected by JWT authentication
- Only authenticated users can view logs (consider restricting to admin-only)
- Failed login attempts are logged for security monitoring
- Sensitive data (passwords) is never logged
