# Supabase Setup Guide

## Prerequisites

1. Create a Supabase project at https://supabase.com
2. Get your project URL and anon key from Settings > API

## Environment Variables

Create a `.env.local` file in the root directory with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration file: `supabase/migrations/001_create_subscriptions_table.sql`

This will create:
- `public.subscriptions` table with all required columns
- Row Level Security (RLS) policies to ensure users can only access their own data
- Indexes for performance

## Testing

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to http://localhost:3000/login
3. Enter your email address
4. Check your email for the magic link
5. Click the magic link to sign in
6. You should be redirected to `/app`

## Features

- ✅ Email magic link authentication
- ✅ Protected routes (`/app` and `/app/map`)
- ✅ CRUD operations on subscriptions stored in Supabase
- ✅ Row Level Security ensures data isolation per user
- ✅ Sign out functionality
- ✅ All existing UI features preserved

## Database Schema

The `subscriptions` table has the following columns:
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to auth.users)
- `service` (TEXT) - Service name from catalog
- `plan` (TEXT, nullable) - Selected plan name
- `price_cents` (INTEGER) - Price in cents (e.g., 999 for $9.99)
- `period` (TEXT) - 'monthly' or 'yearly'
- `category` (TEXT) - User-defined category
- `cancelled` (BOOLEAN) - Cancellation status
- `cancel_url` (TEXT, nullable) - URL to cancel subscription
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp

