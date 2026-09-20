-- My Sindbad baseline schema.
-- Creates the complete database from an empty PostgreSQL database.
-- Later numbered hardening migrations remain intentionally applicable.

CREATE TYPE user_role AS ENUM ('traveler', 'provider', 'admin');
CREATE TYPE source_type AS ENUM ('seed', 'community', 'provider', 'verified');
CREATE TYPE content_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');
CREATE TYPE contribution_type AS ENUM ('new_place', 'place_correction', 'photo', 'info_update');
CREATE TYPE review_status AS ENUM ('published', 'flagged', 'removed');
CREATE TYPE report_status AS ENUM ('open', 'reviewed', 'dismissed', 'actioned');
CREATE TYPE provider_verification AS ENUM ('unverified', 'pending', 'verified', 'suspended');
CREATE TYPE trip_status AS ENUM ('draft', 'planned', 'active', 'completed', 'cancelled');
CREATE TYPE itinerary_status AS ENUM ('suggested', 'confirmed', 'booked', 'skipped');
CREATE TYPE booking_category AS ENUM ('hotel', 'restaurant', 'activity', 'tour', 'vehicle', 'boat', 'transfer', 'other');
CREATE TYPE booking_status AS ENUM ('draft', 'pending', 'awaiting_payment', 'confirmed', 'cancelled', 'completed', 'refunded');
CREATE TYPE payment_provider AS ENUM ('stripe', 'paypal', 'cashplus', 'demo');
CREATE TYPE payment_status AS ENUM ('requires_payment', 'processing', 'succeeded', 'failed', 'refunded');
CREATE TYPE ai_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE media_kind AS ENUM ('image', 'video');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash text,
  name varchar(120) NOT NULL,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'traveler',
  locale varchar(8) NOT NULL DEFAULT 'en',
  home_city varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL,
  provider_account_id varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_accounts_provider_account_unique ON auth_accounts(provider, provider_account_id);
CREATE UNIQUE INDEX auth_accounts_user_provider_unique ON auth_accounts(user_id, provider);
CREATE INDEX auth_accounts_user_idx ON auth_accounts(user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address varchar(64),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE rate_limit_buckets (
  key_hash varchar(64) PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE place_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(60) NOT NULL UNIQUE,
  label_key varchar(120) NOT NULL,
  icon varchar(40) NOT NULL DEFAULT 'map-pin',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  description text,
  category_id uuid REFERENCES place_categories(id) ON DELETE SET NULL,
  city varchar(120) NOT NULL,
  country varchar(120) NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  price_level integer NOT NULL DEFAULT 0,
  cover_image_url text,
  rating_average double precision NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  source_type source_type NOT NULL DEFAULT 'seed',
  status content_status NOT NULL DEFAULT 'approved',
  confirmations_count integer NOT NULL DEFAULT 0,
  provider_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX places_city_idx ON places(city);
CREATE INDEX places_category_idx ON places(category_id);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  category_id uuid REFERENCES place_categories(id) ON DELETE SET NULL,
  description text,
  city varchar(120) NOT NULL,
  country varchar(120) NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  phone varchar(40),
  email varchar(255),
  website text,
  cover_image_url text,
  verification_status provider_verification NOT NULL DEFAULT 'unverified',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_coordinate_pair_check CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL))
);
CREATE UNIQUE INDEX providers_owner_user_unique ON providers(owner_user_id);

CREATE TABLE provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category booking_category NOT NULL DEFAULT 'other',
  name varchar(200) NOT NULL,
  description text,
  price_amount numeric(10,2),
  price_currency varchar(3) NOT NULL DEFAULT 'USD',
  duration_minutes integer,
  capacity integer,
  is_active boolean NOT NULL DEFAULT true,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_services_price_amount_check CHECK (price_amount IS NULL OR (price_amount >= 0 AND price_amount <= 1000000)),
  CONSTRAINT provider_services_currency_check CHECK (price_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT provider_services_duration_check CHECK (duration_minutes IS NULL OR (duration_minutes >= 1 AND duration_minutes <= 100000)),
  CONSTRAINT provider_services_capacity_check CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 10000))
);

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type varchar(40) NOT NULL,
  owner_id uuid NOT NULL,
  url text NOT NULL,
  kind media_kind NOT NULL DEFAULT 'image',
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  comment text,
  status review_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_exactly_one_target_check CHECK ((place_id IS NOT NULL) <> (provider_id IS NOT NULL)),
  CONSTRAINT reviews_rating_range_check CHECK (rating BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX reviews_user_place_unique ON reviews(user_id, place_id) WHERE place_id IS NOT NULL;
CREATE UNIQUE INDEX reviews_user_provider_unique ON reviews(user_id, provider_id) WHERE provider_id IS NOT NULL;

CREATE TABLE contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type contribution_type NOT NULL,
  place_id uuid REFERENCES places(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  submitted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status content_status NOT NULL DEFAULT 'pending',
  confirmations_count integer NOT NULL DEFAULT 0,
  source source_type NOT NULL DEFAULT 'community',
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contribution_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contribution_confirmation_unique UNIQUE (contribution_id, user_id)
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type varchar(40) NOT NULL,
  target_id uuid NOT NULL,
  reason varchar(80) NOT NULL,
  details text,
  reported_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_user_target_unique UNIQUE (reported_by_user_id, target_type, target_id)
);

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  guest_id varchar(64),
  title varchar(200) NOT NULL,
  destination_city varchar(120) NOT NULL,
  destination_country varchar(120) NOT NULL,
  start_date varchar(10) NOT NULL,
  end_date varchar(10) NOT NULL,
  travelers integer NOT NULL DEFAULT 1,
  budget_amount numeric(10,2),
  budget_currency varchar(3) NOT NULL DEFAULT 'USD',
  travel_style varchar(40),
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  generated_by varchar(20) NOT NULL DEFAULT 'manual',
  status trip_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_exactly_one_owner_check CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL))
);
CREATE INDEX trips_user_idx ON trips(user_id);
CREATE INDEX trips_guest_idx ON trips(guest_id);

CREATE TABLE trip_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_index integer NOT NULL,
  date varchar(10) NOT NULL,
  notes text,
  CONSTRAINT trip_days_trip_day_unique UNIQUE (trip_id, day_index)
);

CREATE TABLE itinerary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_day_id uuid NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  title varchar(200) NOT NULL,
  category varchar(40) NOT NULL DEFAULT 'activity',
  start_time varchar(5),
  end_time varchar(5),
  estimated_cost numeric(10,2),
  currency varchar(3) NOT NULL DEFAULT 'USD',
  notes text,
  status itinerary_status NOT NULL DEFAULT 'suggested',
  booking_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX itinerary_items_trip_day_idx ON itinerary_items(trip_day_id);

CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type varchar(20) NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorites_user_target_unique UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_id varchar(64),
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES provider_services(id) ON DELETE SET NULL,
  itinerary_item_id uuid REFERENCES itinerary_items(id) ON DELETE SET NULL,
  category booking_category NOT NULL,
  status booking_status NOT NULL DEFAULT 'draft',
  start_date varchar(10),
  end_date varchar(10),
  guests_count integer NOT NULL DEFAULT 1,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  idempotency_key varchar(100) NOT NULL UNIQUE,
  contact_name varchar(120),
  contact_email varchar(255),
  contact_phone varchar(40),
  notes text,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_owner_exclusive_check CHECK (NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)),
  CONSTRAINT bookings_guests_count_check CHECK (guests_count BETWEEN 1 AND 50),
  CONSTRAINT bookings_total_amount_check CHECK (total_amount >= 0 AND total_amount <= 99999999.99),
  CONSTRAINT bookings_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX bookings_user_idx ON bookings(user_id);
CREATE INDEX bookings_provider_idx ON bookings(provider_id);
CREATE UNIQUE INDEX bookings_active_itinerary_item_unique
  ON bookings(itinerary_item_id)
  WHERE itinerary_item_id IS NOT NULL AND status IN ('draft', 'pending', 'awaiting_payment', 'confirmed');

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  provider_ref varchar(200),
  status payment_status NOT NULL DEFAULT 'requires_payment',
  amount numeric(10,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  is_test_mode boolean NOT NULL DEFAULT true,
  idempotency_key varchar(100) NOT NULL UNIQUE,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_check CHECK (amount > 0 AND amount <= 99999999.99),
  CONSTRAINT payments_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX payments_booking_idx ON payments(booking_id);
CREATE UNIQUE INDEX payments_provider_ref_unique
  ON payments(provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
CREATE UNIQUE INDEX payments_active_booking_unique
  ON payments(booking_id)
  WHERE status IN ('requires_payment', 'processing', 'succeeded');

CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  guest_id varchar(64),
  title varchar(200) NOT NULL DEFAULT 'New conversation',
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversations_exactly_one_owner_check CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL))
);

CREATE TABLE ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role ai_role NOT NULL,
  content text NOT NULL,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages(conversation_id);

CREATE TABLE sponsored_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type varchar(20) NOT NULL,
  target_id uuid NOT NULL,
  label varchar(60) NOT NULL DEFAULT 'Sponsored',
  placement varchar(40) NOT NULL DEFAULT 'home_feed',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
