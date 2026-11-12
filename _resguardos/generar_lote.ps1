# Genera en un solo Excel el resguardo PDF de cada persona de salida\lote.json (lo arma enriquecer.py).
# PDF -> Descargas\Resguardos Nuevo Edificio\<Área>\RESGUARDO - <Nombre>.pdf. Registra en salida\lote.log y salta los que ya existen (se puede reanudar).
param([string]$Salida = "$PSScriptRoot\salida", [string]$Plantilla = "C:\Users\jgome\Downloads\RESGUARDO  compus  2026.xlsx",
      [string]$Raiz = "C:\Users\jgome\Downloads\Resguardos Nuevo Edificio", [string]$Fecha = "12/11/2026", [int]$Solo = 0, [int]$Margen = 60)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$lote = Get-Content "$Salida\lote.json" -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force $Raiz | Out-Null
$log = "$Salida\lote.log"
$limpio = { param($t) ((($t -replace '[\\/:*?"<>|]', ' ') -replace '\s+', ' ').Trim()) }
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
# plantilla sin la hoja "admin" (más ligera de abrir)
$tpl = "$Salida\plantilla_base.xlsx"
Copy-Item $Plantilla $tpl -Force
$wb0 = $xl.Workbooks.Open($tpl); $wb0.Worksheets.Item("admin").Delete(); $wb0.Save(); $wb0.Close($true)

function Generar($d, $pdf) {
  $n = @($d.bienes).Count
  $wb = $xl.Workbooks.Open($tpl)
  try {
    $ws = $wb.Worksheets.Item("Hoja1")
    $PRIMERA = 9; $ULTIMA = 31; $hay = $ULTIMA - $PRIMERA + 1; $SP = 16
    if ($n -lt $hay) { $ws.Range("A$($PRIMERA + $n):A$ULTIMA").EntireRow.Delete() | Out-Null }
    elseif ($n -gt $hay) {
      $ws.Rows($ULTIMA).Copy() | Out-Null
      $ws.Range("A$($ULTIMA + 1):A$($ULTIMA + $n - $hay)").EntireRow.Insert() | Out-Null
      try { $xl.CutCopyMode = $false } catch {}
    }
    $fin = $PRIMERA + $n - 1
    $ws.Range("A$($fin + 1):A$($fin + $SP)").EntireRow.Insert() | Out-Null
    $ws.Range("A$($fin + 1):I$($fin + $SP)").Borders.LineStyle = -4142
    $delta = $n - $hay + $SP
    $ws.Columns("G").ColumnWidth = 70            # las características son largas
    $ws.Range("B6").Value2 = $d.area
    $ws.Range("G6").NumberFormat = "@"; $ws.Range("G6").Value2 = $Fecha
    $ws.Range("B6:E6").HorizontalAlignment = -4131; $ws.Range("G6:I6").HorizontalAlignment = -4131
    for ($i = 0; $i -lt $n; $i++) {
      $r = $PRIMERA + $i; $b = $d.bienes[$i]
      $ws.Cells.Item($r, 1).Value2 = [string]($i + 1)
      foreach ($par in @(@(2, "inv"), @(3, "desc"), @(4, "marca"), @(5, "modelo"), @(6, "serie"), @(7, "carac"), @(9, "obs"))) {
        $c = $ws.Cells.Item($r, $par[0]); $c.NumberFormat = "@"; $c.Value2 = [string]$b.($par[1])
      }
      $ws.Cells.Item($r, 8).Value2 = $d.persona_titulo
    }
    $rt = $ws.Range("A${PRIMERA}:I$fin")
    $rt.VerticalAlignment = -4108
    $ws.Range("C${PRIMERA}:G$fin").WrapText = $true
    $ws.Range("C${PRIMERA}:F$fin").HorizontalAlignment = -4108
    $ws.Range("G${PRIMERA}:G$fin").Font.Size = 7
    $ws.Range("G${PRIMERA}:G$fin").HorizontalAlignment = -4131
    $ws.Range("A${PRIMERA}:B$fin").HorizontalAlignment = -4108
    $ws.Range("H${PRIMERA}:I$fin").HorizontalAlignment = -4108
    $ws.Range("H${PRIMERA}:H$fin").ShrinkToFit = $true
    $ws.Range("I${PRIMERA}:I$fin").WrapText = $true
    $ws.Rows("${PRIMERA}:$fin").AutoFit() | Out-Null
    foreach ($r in $PRIMERA..$fin) { if ($ws.Rows($r).RowHeight -lt 22) { $ws.Rows($r).RowHeight = 22 } }

    $f1 = 33 + $delta; $fl = 36 + $delta; $f2 = 38 + $delta
    $ws.Rows($fl - 1).RowHeight = 30
    $bloques = @(@("A", "D"), @("E", "G"), @("H", "I"))
    foreach ($bl in $bloques) {
      $rg = $ws.Range("$($bl[0])${f1}:$($bl[1])${f2}")
      $rg.Borders.Item(11).LineStyle = -4142; $rg.Borders.Item(12).LineStyle = -4142
      foreach ($e in 7, 8, 9, 10) { $rg.Borders.Item($e).LineStyle = 1; $rg.Borders.Item($e).Weight = -4138 }
    }
    foreach ($par in @(@("A", "D", "A"), @("E", "G", "E"), @("H", "I", "H"))) {
      $ws.Range("$($par[2])$fl").Value2 = ("_" * 32)
      $ws.Range("$($par[0])${fl}:$($par[1])${fl}").HorizontalAlignment = 7
      $ws.Range("$($par[0])${fl}:$($par[1])${fl}").VerticalAlignment = -4107
    }
    $ws.Range("A$($fl + 1)").Value2 = $d.persona
    $ws.Range("A$($fl + 2)").Value2 = $d.cargo
    $ws.Range("E$($fl + 1)").Value2 = $d.jefe
    $ws.Range("E$($fl + 2)").Value2 = $d.cargo_jefe
    $fuente = $ws.Range("E$($fl + 1)").Font
    foreach ($par in @(@("A", "D"), @("E", "G"))) {
      $rg = $ws.Range("$($par[0])$($fl + 1):$($par[1])$($fl + 2)")
      $rg.HorizontalAlignment = 7; $rg.Font.Name = $fuente.Name; $rg.Font.Size = $fuente.Size; $rg.Font.Bold = $true
    }
    $ws.Range("A${fl}:I${fl}").Font.Name = $fuente.Name; $ws.Range("A${fl}:I${fl}").Font.Size = $fuente.Size
    $ws.Range("A${f1}:I${f1}").HorizontalAlignment = -4108

    $ps = $ws.PageSetup
    $ps.Orientation = 2; $ps.PrintTitleRows = '$7:$8'
    $ult = 38 + $delta
    $ps.PrintArea = "A1:I$ult"
    $dim = @(841.9, 595.3)
    $anchoCols = $ws.Range("A1:I1").Width
    $poner = { param($h) foreach ($k in 1..$SP) { $ws.Rows($fin + $k).RowHeight = [Math]::Max(0.5, [Math]::Min(40, $h - 40 * ($k - 1))) } }
    & $poner 0.5
    $imprimible = $dim[1] - $ps.TopMargin - $ps.BottomMargin
    $titulo = $ws.Range("A7:A8").Height
    $contenido = $ws.Range("A1:A$ult").Height
    $zoom = [int][Math]::Floor(100 * [Math]::Min([double]1, ($dim[0] - $ps.LeftMargin - $ps.RightMargin) / ($anchoCols * 1.05)))
    $zAlto = [int][Math]::Floor(100 * $imprimible / (($contenido + 3) * 1.05))
    if ($zAlto -ge $zoom - 12 -and $zAlto -ge 50) { $zoom = [Math]::Min($zoom, $zAlto) }   # si casi cabe en una hoja, se reduce un poco más
    $ps.Zoom = $zoom
    $altoPag = $imprimible / ($zoom / 100 * 1.05)
    $margen = $Margen   # filas altas: se pierde parte de cada hoja al no partirse las filas
    $paginas = 1; while ($contenido + 3 + ($paginas - 1) * $margen -gt ($altoPag * $paginas - ($paginas - 1) * $titulo)) { $paginas++ }
    $libre = $altoPag * $paginas - ($paginas - 1) * $titulo - $contenido - 3 - ($paginas - 1) * $margen + 10
    & $poner ([Math]::Max(0.5, $libre))
    New-Item -ItemType Directory -Force (Split-Path $pdf) | Out-Null
    $ws.ExportAsFixedFormat(0, $pdf)
    return "zoom=$zoom hojas~$paginas"
  } finally { $wb.Close($false) }
}

$hechos = 0; $fallos = 0
try {
  foreach ($d in $lote) {
    if ($Solo -gt 0 -and $d.n -ne $Solo) { continue }
    $carpeta = Join-Path $Raiz (& $limpio $d.area)
    $pdf = Join-Path $carpeta ("RESGUARDO - " + (& $limpio $d.persona_titulo) + " (" + $d.n + ").pdf")
    if ((Test-Path $pdf) -and $Solo -eq 0) { continue }
    try { $info = Generar $d $pdf; $hechos++; Add-Content $log "$($d.n)`tOK`t$pdf`t$info" -Encoding UTF8 }
    catch { $fallos++; Add-Content $log "$($d.n)`tERROR`t$($_.Exception.Message)" -Encoding UTF8 }
  }
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
Write-Output "hechos=$hechos fallos=$fallos"
