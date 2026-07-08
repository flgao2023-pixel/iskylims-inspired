import csv
import os
import ssl
from urllib.request import urlopen, Request

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
SAMPLE_URL = 'https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/integrated_call_samples_v3.20130502.ALL.panel'
CSV_PATH = os.path.join(DATA_DIR, 'samples.csv')

os.makedirs(DATA_DIR, exist_ok=True)

print('Downloading sample metadata...')
context = ssl.create_default_context()
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

request = Request(SAMPLE_URL, headers={'User-Agent': 'Mozilla/5.0'})
with urlopen(request, context=context) as response:
    lines = [line.decode('utf-8').strip() for line in response if line.strip()]

header = ['sample_id', 'population', 'superpopulation', 'gender']
rows = []
for line in lines:
    if line.startswith('#'):
        continue
    parts = line.split('\t')
    if len(parts) >= 4:
        sample_id, population, superpopulation, gender = parts[0], parts[1], parts[2], parts[3]
        rows.append([sample_id, population, superpopulation, gender])

print(f'Writing {len(rows)} rows to {CSV_PATH}')
with open(CSV_PATH, 'w', newline='') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(header)
    writer.writerows(rows)

print('Download complete. Restart the server to seed the SQLite database.')
