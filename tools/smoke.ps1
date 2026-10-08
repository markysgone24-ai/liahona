$Routes = @(
  '#/','#/read','#/read/1-ne/3','#/read/2-ne/2/15','#/read/moro/10/4','#/read/1-ne/1?autoplay=1',
  '#/search','#/search?q=faith','#/search?q=%22none+other%22&book=2-ne',
  '#/library','#/library/alma','#/ask','#/ask?prompt=What+does+Alma+37+teach+about+hope?',
  '#/saved','#/saved?tab=highlights','#/saved?tab=notes','#/saved?tab=history','#/settings'
)

$chrome = if ($env:CHROME_PATH) { $env:CHROME_PATH } else { "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$temp = Join-Path $root '.smoke-tmp'
$base = 'file:///' + ((Join-Path $root 'index.html') -replace '\\','/')

New-Item -ItemType Directory -Path $temp -Force | Out-Null

$fail = 0
$i = 0
foreach ($route in $Routes) {
  $i++
  $tag = "r{0:d2}" -f $i
  $dom = Join-Path $temp "dom_$tag.html"
  $log = Join-Path $temp "log_$tag.txt"
  $prof = Join-Path $temp "p_$tag"
  $url = $base + $route

  & $chrome --headless=new --disable-gpu --no-sandbox --virtual-time-budget=6000 `
    --user-data-dir="$prof" --enable-logging --log-level=0 --log-file="$log" `
    --dump-dom $url 2>$null | Out-File -Encoding utf8 $dom

  $html = Get-Content $dom -Raw
  $errors = @()
  if (Get-Content $log -ErrorAction SilentlyContinue) {
    $errors = Get-Content $log | Select-String -Pattern "view failed|Something broke|Uncaught|TypeError" | ForEach-Object { $_.Line -replace '.*: ','' }
  }

  $broke = $html -match 'Something broke'
  $notfound = $html -match 'That page does not exist'
  $missing = $html -match 'Scripture text missing'
  $len = $html.Length

  $status = if ($errors.Count -gt 0 -or $broke -or $notfound -or $missing) { 'FAIL' } else { ' ok ' }
  if ($status -eq 'FAIL') { $fail++ }

  "{0} {1,-46} dom={2,7}  {3}" -f $status, $route, $len, (($errors -join ' | ') -replace '\s+',' ')
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
}

""
"failures: $fail / $($Routes.Count)"
Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
exit $(if ($fail -gt 0) { 1 } else { 0 })
