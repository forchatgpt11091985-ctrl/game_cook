$ErrorActionPreference = 'Stop'
$listener = $null
try {
    $page = [System.IO.File]::ReadAllBytes((Join-Path $env:GAME_COOK_ROOT 'index.html'))
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8765)
    $listener.Start()
    $url = 'http://127.0.0.1:8765/'
    Write-Host "Kitchen World: $url"
    Write-Host 'Keep this window open while playing. Close it to stop.'
    Start-Process $url
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 3000
            $reader = [System.IO.StreamReader]::new($stream)
            $request = $reader.ReadLine()
            if ($null -eq $request) { continue }
            while ($reader.ReadLine()) {}
            $path = ($request.Split(' ')[1]).Split('?')[0]
            if ($path -eq '/' -or $path -eq '/index.html') {
                $status = '200 OK'; $content = $page
            } else {
                $status = '404 Not Found'; $content = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            }
            $header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($content.Length)`r`nConnection: close`r`n`r`n")
            $stream.Write($header, 0, $header.Length)
            $stream.Write($content, 0, $content.Length)
            $stream.Flush()
        } catch { Write-Host $_.Exception.Message }
        finally { $client.Close() }
    }
} catch {
    Write-Host $_.Exception.Message
    Write-Host 'If port 8765 is busy, close the previous game window first.'
    Read-Host 'Press Enter to close'
} finally {
    if ($null -ne $listener) { $listener.Stop() }
}
