$ErrorActionPreference = 'Stop'
$prototypeRoot = $PSScriptRoot
$prototypeUrl = 'http://127.0.0.1:4173/'
if (-not (Test-Path -LiteralPath (Join-Path $prototypeRoot 'node_modules\vite\bin\vite.js'))) {
    throw '请先在 desktop-app 目录执行 npm install。'
}
try {
    $prototypeResponse = Invoke-WebRequest -Uri $prototypeUrl -TimeoutSec 2 -UseBasicParsing
    if ($prototypeResponse.Content -notmatch '科学革命') { throw '4173 端口被其他服务占用。' }
} catch {
    $prototypeNode = (Get-Command node).Source
    Start-Process -FilePath $prototypeNode -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort' -WorkingDirectory $prototypeRoot -WindowStyle Hidden
    $prototypeReady = $false
    for ($prototypeAttempt = 0; $prototypeAttempt -lt 30; $prototypeAttempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $prototypeResponse = Invoke-WebRequest -Uri $prototypeUrl -TimeoutSec 1 -UseBasicParsing
            if ($prototypeResponse.Content -match '科学革命') { $prototypeReady = $true; break }
        } catch { }
    }
    if (-not $prototypeReady) { throw '原型没有成功启动，请检查 4173 端口是否被占用。' }
}
Start-Process $prototypeUrl
