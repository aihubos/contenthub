"""Accumulate public channel feeds. Never delete history when feeds rotate."""
import json, subprocess, xml.etree.ElementTree as ET, datetime, pathlib, re, tempfile, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/data/published.json'
CHANNEL = 'UC1QVLqr4m0yIavqjARigMow'
FEEDS = {'youtube': f'https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL}', 'blog': 'https://rss.blog.naver.com/jeremylee0213.xml'}
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
old = json.loads(DEST.read_text()) if DEST.exists() else {'items': []}
items = {i['id']: i for i in old['items']}
ns = {'a':'http://www.w3.org/2005/Atom','yt':'http://www.youtube.com/xml/schemas/2015','m':'http://search.yahoo.com/mrss/'}
counts = {}
for platform, url in FEEDS.items():
    result = subprocess.run(['curl','--fail','--location','--max-time','30','--silent','--show-error',url],capture_output=True,text=True,check=True)
    root = ET.fromstring(result.stdout)
    entries = root.findall('a:entry',ns) if platform == 'youtube' else root.findall('./channel/item')
    if not entries: raise RuntimeError(f'Empty {platform} feed; retaining previous data')
    counts[platform] = len(entries)
    for entry in entries:
        if platform == 'youtube':
            ident = entry.findtext('yt:videoId',namespaces=ns)
            link = entry.find('a:link',ns).get('href')
            stats = entry.find('.//m:statistics',ns)
            row = {'id':'youtube:'+ident,'platform':platform,'title':entry.findtext('a:title',namespaces=ns),'url':link,'publishedAt':entry.findtext('a:published',namespaces=ns),'views':int(stats.get('views')) if stats is not None else None}
        else:
            link = entry.findtext('link').split('?')[0]
            row = {'id':'blog:'+link.rsplit('/',1)[-1],'platform':platform,'title':entry.findtext('title'),'url':link,'publishedAt':entry.findtext('pubDate'),'excerpt':re.sub('<[^>]+>',' ',entry.findtext('description') or '')[:400]}
        row['checkedAt'] = now
        items[row['id']] = row
payload = {'checkedAt':now,'feeds':FEEDS,'latestFeedCounts':counts,'items':list(items.values())}
with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=DEST.parent,delete=False) as tmp:
    json.dump(payload,tmp,ensure_ascii=False,indent=2); name=tmp.name
os.replace(name,DEST)
print(json.dumps({'feedCounts':counts,'total':len(items),'saved':str(DEST)},ensure_ascii=False))
