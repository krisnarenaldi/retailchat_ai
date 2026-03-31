-- Create a table to track chat usage for each user
create table if not exists chat_usage (
  user_id uuid references auth.users not null primary key,
  chat_count int default 0 not null,
  last_chat_date timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS for the table
alter table chat_usage enable row level security;

-- Create policy to allow users to read only their own usage
create policy "Users can view own usage" on chat_usage
  for select using (auth.uid() = user_id);

-- Create a trigger function to initialize chat_usage when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.chat_usage (user_id, chat_count)
  values (new.id, 0);
  return new;
end;
$$ language plpgsql security definer;

-- Attach the trigger to auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
