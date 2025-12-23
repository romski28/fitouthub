# Setting Default Passwords for Professional Accounts

Your professional authentication system is set up, but the existing contractor/reseller accounts need default passwords to log in. You have two options:

## Option 1: Run the TypeScript Script (when database is available)

```bash
cd apps/api
pnpm set:default-passwords
```

This will:
- Set password to: `"password"` for all professionals without passwords
- Hash with bcrypt (cost factor 10)
- List all professionals ready to test

**Error handling:** If the database is unavailable (connection issue), try again later.

## Option 2: Run SQL Directly in Supabase Dashboard (Recommended if database is slow)

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Click on **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `SET_DEFAULT_PASSWORDS.sql`
5. Click **Run**

This will instantly set all professionals' passwords to: `"password"`

## Testing

Once passwords are set, contractors can log in at:
- **URL:** `http://localhost:3000/professional-login` (or your production URL)
- **Email:** Use any professional's email from your database
- **Password:** `password`

After login, they'll see their assigned projects and can submit quotes.

## The Hash

The bcrypt hash used is:
```
$2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i
```

This is the bcrypt hash of the plain password `"password"` with cost factor 10. It's safe to commit to version control since bcrypt hashes are one-way.

## Changing Passwords Later

- **Professionals can change their password** after logging in by using the `/professional/auth/set-password` endpoint (not yet exposed in UI)
- **You can change their password** by updating the `passwordHash` field directly in the database with a new bcrypt hash
