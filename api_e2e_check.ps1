$ErrorActionPreference = 'Stop'

function Add-Result {
  param([string]$Name,[string]$Status,[string]$Details)
  [PSCustomObject]@{ Test=$Name; Status=$Status; Details=$Details }
}

function Err-Text {
  param($Primary, $Fallback)
  if ($Primary -and $Primary.ToString().Trim().Length -gt 0) { return $Primary }
  return $Fallback
}

$results = @()
$base = 'http://localhost:5000/api'

try {
  $h = Invoke-RestMethod -Uri "$base/health" -Method Get
  $results += Add-Result 'health' 'PASS' "$($h.status)"
} catch {
  $results += Add-Result 'health' 'FAIL' $_.Exception.Message
}

try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"","password":""}' | Out-Null
  $results += Add-Result 'auth/login missing fields' 'FAIL' 'Expected 400 but got success'
} catch {
  $msg = ''
  if ($_.Exception.Response) { $r = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg = $r.ReadToEnd() }
  if ($msg -match 'Please provide email and password') {
    $results += Add-Result 'auth/login missing fields' 'PASS' 'Returned validation error'
  } else {
    $results += Add-Result 'auth/login missing fields' 'FAIL' (Err-Text $msg $_.Exception.Message)
  }
}

try {
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"lohithg_aiml@ksit.edu.in","password":"lohith123"}'
  $doctorId = $login.user.id
  $results += Add-Result 'auth/login valid' 'PASS' "user_id=$doctorId"
} catch {
  $results += Add-Result 'auth/login valid' 'FAIL' $_.Exception.Message
  $doctorId = 1
}

# Register disposable user
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$tempEmail = "apitest_$stamp@example.com"
$tempName = "API Test $stamp"
$tempUserId = $null
try {
  $regBody = @{ name=$tempName; email=$tempEmail; password='TempPass123!'; specialization='QA' } | ConvertTo-Json
  $reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body $regBody
  $tempUserId = $reg.user.id
  $results += Add-Result 'auth/register' 'PASS' "user_id=$tempUserId"
} catch {
  $results += Add-Result 'auth/register' 'FAIL' $_.Exception.Message
}

# Patients
$createdPatientId = $null
try {
  $p = Invoke-RestMethod -Uri "$base/patients?limit=5" -Method Get
  $results += Add-Result 'patients/list' 'PASS' "count=$($p.count)"
} catch {
  $results += Add-Result 'patients/list' 'FAIL' $_.Exception.Message
}

try {
  $body = @{ patient_name = "E2E Patient $stamp"; age = 31; gender = 'Male'; phone='9000001234'; email="p_$stamp@example.com"; address='Test Street'; medical_history='None'; allergies='None'; blood_group='O+' } | ConvertTo-Json
  $cp = Invoke-RestMethod -Uri "$base/patients" -Method Post -ContentType 'application/json' -Body $body
  $createdPatientId = $cp.patient_id
  $results += Add-Result 'patients/create' 'PASS' "patient_id=$createdPatientId"
} catch {
  $results += Add-Result 'patients/create' 'FAIL' $_.Exception.Message
}

if ($createdPatientId) {
  try {
    $gp = Invoke-RestMethod -Uri "$base/patients/$createdPatientId" -Method Get
    $results += Add-Result 'patients/get-by-id' 'PASS' "name=$($gp.patient.patient_name)"
  } catch {
    $results += Add-Result 'patients/get-by-id' 'FAIL' $_.Exception.Message
  }

  try {
    $q = [System.Web.HttpUtility]::UrlEncode("E2E Patient $stamp")
    $sp = Invoke-RestMethod -Uri "$base/patients/search/$q" -Method Get
    $results += Add-Result 'patients/search' 'PASS' "count=$($sp.count)"
  } catch {
    $results += Add-Result 'patients/search' 'FAIL' $_.Exception.Message
  }

  try {
    $rp = Invoke-RestMethod -Uri "$base/patients/resolve?patient_id=$createdPatientId" -Method Get
    $results += Add-Result 'patients/resolve' 'PASS' "matchedBy=$($rp.matchedBy)"
  } catch {
    $results += Add-Result 'patients/resolve' 'FAIL' $_.Exception.Message
  }

  try {
    $upBody = @{ address='Updated Test Address' } | ConvertTo-Json
    $up = Invoke-RestMethod -Uri "$base/patients/$createdPatientId" -Method Put -ContentType 'application/json' -Body $upBody
    $results += Add-Result 'patients/update' 'PASS' $up.message
  } catch {
    $results += Add-Result 'patients/update' 'FAIL' $_.Exception.Message
  }
}

# Consultations
$consultationId = $null
if ($createdPatientId) {
  try {
    $cBody = @{ patient_id=$createdPatientId; doctor_id=$doctorId; visit_date=(Get-Date -Format 'yyyy-MM-dd'); transcript='Doctor: What brings you in today? Patient: Fever and throat pain for two days.'; subjective='Fever and throat pain'; objective='Mild throat congestion'; assessment='Likely viral pharyngitis'; plan='Hydration and paracetamol'; diagnosis='Viral pharyngitis'; medications='Paracetamol'; follow_up='3 days'; status='completed'; duration=12 } | ConvertTo-Json
    $cc = Invoke-RestMethod -Uri "$base/consultations" -Method Post -ContentType 'application/json' -Body $cBody
    $consultationId = $cc.consultation_id
    $results += Add-Result 'consultations/create' 'PASS' "consultation_id=$consultationId"
  } catch {
    $results += Add-Result 'consultations/create' 'FAIL' $_.Exception.Message
  }
}

try {
  $cl = Invoke-RestMethod -Uri "$base/consultations?limit=5" -Method Get
  $results += Add-Result 'consultations/list' 'PASS' "count=$($cl.count)"
} catch {
  $results += Add-Result 'consultations/list' 'FAIL' $_.Exception.Message
}

if ($consultationId) {
  try {
    $cg = Invoke-RestMethod -Uri "$base/consultations/$consultationId" -Method Get
    $results += Add-Result 'consultations/get-by-id' 'PASS' "diagnosis=$($cg.consultation.diagnosis)"
  } catch {
    $results += Add-Result 'consultations/get-by-id' 'FAIL' $_.Exception.Message
  }

  try {
    $cuBody = @{ diagnosis='Updated diagnosis for E2E' } | ConvertTo-Json
    $cu = Invoke-RestMethod -Uri "$base/consultations/$consultationId" -Method Put -ContentType 'application/json' -Body $cuBody
    $results += Add-Result 'consultations/update' 'PASS' $cu.message
  } catch {
    $results += Add-Result 'consultations/update' 'FAIL' $_.Exception.Message
  }

  try {
    $ch = Invoke-RestMethod -Uri "$base/consultations/patient/$createdPatientId/history" -Method Get
    $results += Add-Result 'consultations/patient-history' 'PASS' "count=$($ch.count)"
  } catch {
    $results += Add-Result 'consultations/patient-history' 'FAIL' $_.Exception.Message
  }
}

# Users
if ($tempUserId) {
  try {
    $u = Invoke-RestMethod -Uri "$base/users/$tempUserId" -Method Get
    $results += Add-Result 'users/get-by-id' 'PASS' "email=$($u.user.email)"
  } catch {
    $results += Add-Result 'users/get-by-id' 'FAIL' $_.Exception.Message
  }

  try {
    $ub = @{ name = "$tempName Updated"; email = $tempEmail; specialization='General Medicine' } | ConvertTo-Json
    $uu = Invoke-RestMethod -Uri "$base/users/$tempUserId" -Method Put -ContentType 'application/json' -Body $ub
    $results += Add-Result 'users/update-profile' 'PASS' $uu.message
  } catch {
    $results += Add-Result 'users/update-profile' 'FAIL' $_.Exception.Message
  }

  try {
    $sb = @{ theme='light'; notifications=$true; language='en' } | ConvertTo-Json
    $us = Invoke-RestMethod -Uri "$base/users/$tempUserId/settings" -Method Put -ContentType 'application/json' -Body $sb
    $results += Add-Result 'users/update-settings' 'PASS' $us.message
  } catch {
    $results += Add-Result 'users/update-settings' 'FAIL' $_.Exception.Message
  }
}

# Groq notes
try {
  $nb = @{ transcript='Patient reports fever, sore throat, and mild fatigue for two days. Doctor suspects viral pharyngitis and advises hydration and paracetamol.'; patientInfo=@{ patientName='E2E Patient'; age=31; gender='Male' } } | ConvertTo-Json -Depth 5
  $nr = Invoke-RestMethod -Uri "$base/notes/generate" -Method Post -ContentType 'application/json' -Body $nb
  $ok = ($nr.source -eq 'groq' -and $nr.soap_notes.chief_complaint)
  if ($ok) { $results += Add-Result 'notes/generate (Groq)' 'PASS' "source=$($nr.source)" } else { $results += Add-Result 'notes/generate (Groq)' 'FAIL' 'Missing SOAP fields or wrong source' }
} catch {
  $msg = ''
  if ($_.Exception.Response) { $r = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg = $r.ReadToEnd() }
  $results += Add-Result 'notes/generate (Groq)' 'FAIL' (Err-Text $msg $_.Exception.Message)
}

# Generate tiny speech WAV for transcribe/diarize
$wavPath = "d:\Medical-Scribe\e2e_voice.wav"
try {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SetOutputToWaveFile($wavPath)
  $synth.Speak('Doctor: What is the problem? Patient: I have fever and throat pain for two days.')
  $synth.Dispose()

  $audioBytes = [System.IO.File]::ReadAllBytes($wavPath)
  $audioBase64 = [Convert]::ToBase64String($audioBytes)

  try {
    $tb = @{ audioBase64=$audioBase64; mimeType='audio/wav' } | ConvertTo-Json -Depth 4
    $tr = Invoke-RestMethod -Uri "$base/transcribe" -Method Post -ContentType 'application/json' -Body $tb
    if ($tr.transcript -and $tr.transcript.Length -gt 0) {
      $results += Add-Result 'transcribe (Groq Whisper)' 'PASS' ("chars=" + $tr.transcript.Length)
    } else {
      $results += Add-Result 'transcribe (Groq Whisper)' 'FAIL' 'Empty transcript'
    }
  } catch {
    $msg = ''
    if ($_.Exception.Response) { $r = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg = $r.ReadToEnd() }
    $results += Add-Result 'transcribe (Groq Whisper)' 'FAIL' (Err-Text $msg $_.Exception.Message)
  }

  try {
    $db = @{ audioBase64=$audioBase64; mimeType='audio/wav'; lang='en' } | ConvertTo-Json -Depth 4
    $dr = Invoke-RestMethod -Uri "$base/diarize" -Method Post -ContentType 'application/json' -Body $db
    $results += Add-Result 'diarize (AssemblyAI)' 'PASS' ("speakerCount=" + $dr.speakerCount + '; utterances=' + $dr.utterances.Count)
  } catch {
    $msg = ''
    if ($_.Exception.Response) { $r = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg = $r.ReadToEnd() }
    $results += Add-Result 'diarize (AssemblyAI)' 'FAIL' (Err-Text $msg $_.Exception.Message)
  }
} catch {
  $results += Add-Result 'voice sample generation' 'FAIL' $_.Exception.Message
}

# Cleanup disposable entities
if ($consultationId) {
  try { Invoke-RestMethod -Uri "$base/consultations/$consultationId" -Method Delete | Out-Null; $results += Add-Result 'cleanup/consultation-delete' 'PASS' "deleted=$consultationId" } catch { $results += Add-Result 'cleanup/consultation-delete' 'FAIL' $_.Exception.Message }
}
if ($createdPatientId) {
  try { Invoke-RestMethod -Uri "$base/patients/$createdPatientId" -Method Delete | Out-Null; $results += Add-Result 'cleanup/patient-delete' 'PASS' "deleted=$createdPatientId" } catch { $results += Add-Result 'cleanup/patient-delete' 'FAIL' $_.Exception.Message }
}

$results | Format-Table -AutoSize
$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Host "`nSUMMARY: PASS=$pass FAIL=$fail"
