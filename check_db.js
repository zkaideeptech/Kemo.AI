const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envs = fs.readFileSync('.env.local', 'utf8').split('\n');
const supabaseUrl = envs.find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const supabaseKey = envs.find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))?.split('=')[1].trim() || envs.find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')).split('=')[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true });
    const { count: audioCount } = await supabase.from('audio_assets').select('*', { count: 'exact', head: true });
    const { count: transcriptCount } = await supabase.from('transcripts').select('*', { count: 'exact', head: true });
    
    console.log(`Jobs: ${jobCount}, Audio Assets: ${audioCount}, Transcripts: ${transcriptCount}`);
}

check();
