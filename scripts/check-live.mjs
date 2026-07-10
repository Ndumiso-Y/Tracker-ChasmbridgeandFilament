import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('tracker_items').select('id, record_type, entity').limit(1);
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success, data:', data);
  }
}
run();
