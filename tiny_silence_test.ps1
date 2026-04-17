$sampleRate = 16000
$seconds = 1
$numSamples = $sampleRate * $seconds
$bytesPerSample = 2
$numChannels = 1
$byteRate = $sampleRate * $numChannels * $bytesPerSample
$blockAlign = $numChannels * $bytesPerSample
$dataSize = $numSamples * $bytesPerSample
$fileSize = 36 + $dataSize

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# RIFF header
$bw.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
$bw.Write([int]$fileSize)
$bw.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))

# fmt chunk
$bw.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
$bw.Write([int]16)                  # Subchunk1Size for PCM
$bw.Write([int16]1)                 # AudioFormat PCM
$bw.Write([int16]$numChannels)
$bw.Write([int]$sampleRate)
$bw.Write([int]$byteRate)
$bw.Write([int16]$blockAlign)
$bw.Write([int16]16)                # BitsPerSample

# data chunk
$bw.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
$bw.Write([int]$dataSize)

# silent samples
for ($i = 0; $i -lt $numSamples; $i++) {
  $bw.Write([int16]0)
}

$bw.Flush()
$audioBytes = $ms.ToArray()
$audioBase64 = [Convert]::ToBase64String($audioBytes)

$payload = @{ audioBase64 = $audioBase64; mimeType = 'audio/wav'; lang = 'en' } | ConvertTo-Json -Depth 4

try {
  $resp = Invoke-RestMethod -Uri 'http://localhost:5000/api/diarize' -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 120
  $resp | ConvertTo-Json -Depth 6
} catch {
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Output $body
  } else {
    Write-Output $_.Exception.Message
  }
}
