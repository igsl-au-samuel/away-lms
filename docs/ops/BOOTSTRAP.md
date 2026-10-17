# Bootstrap: the first admin on the hosted project

Sign-ups are off, and the app has no screen to create the very first user. The first
admin is made by hand in the Supabase dashboard. After that, admins invite everyone
else from `/admin/users`.

Do this once per hosted project. Never put the password or a real email in the repo.

## Before you start

The hosted database needs its schema. The **Deploy DB** workflow
(`.github/workflows/deploy-db.yml`) pushes migrations on every merge to `main`.
Check the latest run under GitHub Actions is green. If the SQL below says
`relation "public.profiles" does not exist`, the schema is not there yet.

## 1. Create the auth user

Supabase dashboard > Authentication > Users > Add user > Create new user.

- Email: the admin's address.
- Password: a temporary one (min length 10, as set in Auth > Providers > Email).
- Tick **Auto Confirm User**.

## 2. Create the profile row

The profile row is what gives the user a role. Without it, sign-in bounces back to
the sign-in page. Run this in the SQL Editor, replacing the placeholders:

```sql
insert into public.profiles (id, full_name, email, role, region_code)
select id, '<Full name>', '<admin email, lower case>', 'admin', '<QLD | NSW | HK>'
from auth.users
where email = '<admin email, lower case>';
```

Expect `1 row inserted`. `0 rows` means step 1 did not create the user. The timezone
is filled in from the region.

## 3. Sign in and change the password

Open `/sign-in` on the deployed site, then `/admin/users`. Change the temporary
password straight away (forgot-password flow).

## Notes

- `email` must be lower case (the table has a check constraint).
- `is_demo` stays false for real people. Demo users are only created by the
  `/admin/demo` loader.
