-- Prevent two simultaneously-active bookings from owning the same itinerary item.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_itinerary_item_unique
  ON bookings(itinerary_item_id)
  WHERE itinerary_item_id IS NOT NULL
    AND status IN ('draft', 'pending', 'awaiting_payment', 'confirmed');
