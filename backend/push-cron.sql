select cron.schedule('radar-client-push-5min','*/5 * * * *',$job$
select net.http_post(
url := 'https://llgaeuvtrcpcvrcxkvpz.supabase.co/functions/v1/radar-client-push?action=dispatch',
headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select dispatch_token from public.radar_push_config where id=1)),
body := '{}'::jsonb, timeout_milliseconds := 120000);
$job$);
