-- Create public users table
CREATE TABLE public.users (
  id uuid references auth.users not null primary key,
  email text,
  username text
);

-- Create function to handle new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, username)
  values (new.id, new.email, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for new users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create function to handle user updates
create or replace function public.handle_user_update()
returns trigger as $$
begin
  update public.users
  set 
    email = new.email,
    username = new.raw_user_meta_data->>'username'
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for user updates
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute procedure public.handle_user_update();

-- Migrate existing users
insert into public.users (id, email, username)
select 
  id,
  email,
  raw_user_meta_data->>'username'
from auth.users
on conflict (id) do update
set 
  email = EXCLUDED.email,
  username = EXCLUDED.username;
