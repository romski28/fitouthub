# Unified Login Portal Guide

## Overview
The platform now features a unified login portal that serves both clients and professionals. Users can toggle between "Client" and "Professional" modes on a single login page.

## Features

### Single Login Page
- **Location**: `/login`
- **Toggle**: Switch between "Client" and "Professional" modes
- **Seamless Flow**: Both authentication methods on one page

### Client Login
- Uses the standard client authentication system
- Redirects to client dashboard at `/`
- Stores client auth in `clientAccessToken` and `clientRefreshToken`

### Professional Login
- Uses professional authentication system with JWT
- Redirects to professional dashboard at `/professional-projects`
- Stores professional auth in `professionalAccessToken` and `professionalRefreshToken`
- Default password: `password` (for testing, bcrypt hash: `$2b$10$MEF.3I6GeAKPDmM4uqTCbeC4Gu7RZqjdP94e/p63wI5PhPv4wsKoi`)

## Navigation

### From Navbar
- Unauthenticated users see "Login" button → links to `/login`
- Client users see profile menu with "Logout" option
- Professional users see profile menu with:
  - "My Projects" link to `/professional-projects`
  - "Logout" option

### Professional Workflow
1. User lands on site
2. Clicks "Login" in navbar
3. Toggle to "Professional" mode
4. Enter professional email and password
5. Redirected to `/professional-projects` dashboard
6. View assigned projects and submit quotes

## Testing with Demo Professional Accounts

All professional accounts in the database have the default password: `password`

Available test emails:
- `company70@romski.me.uk`
- `company71@romski.me.uk`
- `company72@romski.me.uk`
- And others (check database for full list)

## Implementation Details

### Frontend
- [Login Page](apps/web/src/app/login/page.tsx) - Unified UI with toggle
- [Navbar](apps/web/src/components/navbar.tsx) - Professional auth support
- [Professional Auth Context](apps/web/src/context/professional-auth-context.tsx) - JWT management

### Backend
- [Professional Auth Controller](apps/api/src/professional-auth/professional-auth.controller.ts)
- [Professional Auth Service](apps/api/src/professional-auth/professional-auth.service.ts)
- [JWT Strategy](apps/api/src/professional-auth/jwt-professional.strategy.ts)

### Database
- `Professional` model includes `passwordHash` field (bcrypt hashed)
- Password set via [SET_DEFAULT_PASSWORDS.sql](apps/api/SET_DEFAULT_PASSWORDS.sql)

## Removed Features
- `/professional-login` page is still available but deprecated
- Use `/login` with Professional toggle instead

## Future Enhancements
- Single unified user model (if needed)
- Same authentication for both client and professional roles
- Role-based access control within main auth system
