-- Step B: Create partial unique index
-- Using the exact column names from schema.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appointment 
ON appointments (clinic_id, doctor_name, preferred_date_iso, time_slot) 
WHERE status != 'cancelled';

-- Step C: Create atomic booking RPC function
CREATE OR REPLACE FUNCTION book_slot_atomic(
  p_clinic_id UUID,
  p_doctor_name TEXT,
  p_preferred_date_iso DATE,
  p_time_slot TEXT,
  p_phone TEXT,
  p_name TEXT,
  p_treatment TEXT
) RETURNS json AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  BEGIN
    INSERT INTO appointments (
      clinic_id, phone, name, doctor_name, 
      preferred_date_iso, time_slot, treatment, status
    ) VALUES (
      p_clinic_id, p_phone, p_name, p_doctor_name,
      p_preferred_date_iso, p_time_slot, p_treatment, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', true, 'appointment_id', v_appointment_id);
    
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'message', 'Slot already taken');
  END;
END;
$$ LANGUAGE plpgsql;
