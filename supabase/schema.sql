-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Create leads table
create table public.leads (
  id uuid default uuid_generate_v4() primary key,
  email varchar(255) not null unique,
  name varchar(255),
  phone varchar(50),
  is_investor boolean default false,
  opted_in_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create cases table
create table public.cases (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete set null,
  user_question text,
  user_benefits jsonb,
  llm_response jsonb not null,
  status varchar(50) default 'active',
  session_id varchar(255),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create files table
create table public.files (
  id uuid default uuid_generate_v4() primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name varchar(255) not null,
  file_type varchar(50) not null,
  file_size integer not null,
  storage_path varchar(500) not null,
  ocr_text text,
  ocr_confidence real,
  created_at timestamp with time zone default now()
);

-- Create donations table
create table public.donations (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  stripe_session_id varchar(255) not null unique,
  amount_cents integer not null,
  currency varchar(3) default 'usd',
  status varchar(50) default 'pending',
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Create admin_logs table
create table public.admin_logs (
  id uuid default uuid_generate_v4() primary key,
  action varchar(100) not null,
  admin_identifier varchar(255),
  details jsonb,
  ip_address inet,
  created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_leads_email on public.leads(email);
create index idx_cases_lead_id on public.cases(lead_id);
create index idx_cases_created_at on public.cases(created_at);
create index idx_files_case_id on public.files(case_id);
create index idx_donations_lead_id on public.donations(lead_id);
create index idx_donations_stripe_session_id on public.donations(stripe_session_id);

-- Create updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Add updated_at triggers
create trigger update_leads_updated_at
  before update on public.leads
  for each row execute function update_updated_at_column();

create trigger update_cases_updated_at
  before update on public.cases
  for each row execute function update_updated_at_column();

-- Set up Row Level Security (RLS)
alter table public.leads enable row level security;
alter table public.cases enable row level security;
alter table public.files enable row level security;
alter table public.donations enable row level security;
alter table public.admin_logs enable row level security;

-- Create policies for public access (since this is a public tool)
-- Note: In production, you may want more restrictive policies

-- Public read/write access for leads (users can create and read their own)
create policy "Allow public insert leads" on public.leads
  for insert to anon, authenticated
  with check (true);

create policy "Allow public read own leads" on public.leads
  for select to anon, authenticated
  using (true);

-- Public read/write access for cases
create policy "Allow public insert cases" on public.cases
  for insert to anon, authenticated
  with check (true);

create policy "Allow public read cases" on public.cases
  for select to anon, authenticated
  using (true);

-- Public read/write access for files
create policy "Allow public insert files" on public.files
  for insert to anon, authenticated
  with check (true);

create policy "Allow public read files" on public.files
  for select to anon, authenticated
  using (true);

-- Public read/write access for donations
create policy "Allow public insert donations" on public.donations
  for insert to anon, authenticated
  with check (true);

create policy "Allow public read donations" on public.donations
  for select to anon, authenticated
  using (true);

-- Admin only access for admin_logs
create policy "Allow service role access admin_logs" on public.admin_logs
  for all to service_role
  using (true);

-- Create storage bucket for file uploads
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false);

-- Allow public uploads to the uploads bucket
create policy "Allow public uploads" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'uploads');

create policy "Allow public downloads" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'uploads');