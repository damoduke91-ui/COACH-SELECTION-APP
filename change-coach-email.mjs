import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lhimpwrkbugbdoovcwax.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoaW1wd3JrYnVnYmRvb3Zjd2F4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM2Mjg1NCwiZXhwIjoyMDkwOTM4ODU0fQ.ZvHbvQheshRaMiGilrFZ-k7mKn_PLo82c8UVw3WyHhI";

const userId = "89d976ad-8873-4349-931e-0808fbb3b9d1";
const newEmail = "cdoumanis@adica.com.au";

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data, error } = await supabase.auth.admin.updateUserById(userId, {
  email: newEmail,
  email_confirm: true,
});

if (error) {
  console.error("Failed:", error);
} else {
  console.log("Updated user:", data.user?.id, data.user?.email);
}