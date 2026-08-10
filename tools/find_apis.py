import sys, re
sys.stdout.reconfigure(encoding='utf-8')
with open(r'D:\opencode\tianX\decrypted_inner.html', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# find all API endpoint strings
apis = re.findall(r'(?:authApi|fetch|axios|ajax|\bget|\bpost)\s*\(\s*["\'](/[^"\']+)["\']', content, re.IGNORECASE)
unique = sorted(set(apis))
print('API endpoints found:')
for api in unique:
    print(f'  {api}')
