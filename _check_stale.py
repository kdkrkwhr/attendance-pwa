import json
from datetime import datetime, timezone, timedelta

kst = timezone(timedelta(hours=9))
now = datetime.now(kst)

with open('data/weather/latest.json') as f:
    w = json.load(f)
with open('data/news/latest.json') as f:
    n = json.load(f)

w_ts = datetime.fromisoformat(w.get('generatedAt','2000-01-01T00:00:00+09:00'))
n_ts = datetime.fromisoformat(n.get('generatedAt','2000-01-01T00:00:00+09:00'))

print('Now:', now.isoformat())
print('Weather generatedAt:', w.get('generatedAt','N/A'), 'age_hours:', round((now-w_ts).total_seconds()/3600, 1))
print('News generatedAt:', n.get('generatedAt','N/A'), 'age_hours:', round((now-n_ts).total_seconds()/3600, 1))
print('Weather stale:', (now-w_ts).total_seconds()/3600 > 6)
print('News stale:', (now-n_ts).total_seconds()/3600 > 6)