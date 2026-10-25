pub const GROUND_TRUTH: &str = "
    st.is_confirmed AND st.status = 'published' AND st.location_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM observations.station_origins o JOIN public.locations moved ON moved.id = st.location_id
      WHERE o.station_id = st.id AND o.coordinates_from IN ('estimate', 'snapped') AND moved.\"updatedAt\" <= o.created_at
    )";
