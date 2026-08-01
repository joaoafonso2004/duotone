Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Utilizador\.gemini\antigravity\brain\28e50351-2db4-45d4-8263-aefb1e00a7a5\media__1783978694994.jpg"
$destPath = "c:\Users\Utilizador\Desktop\duotone-main\assets\auth-logo.png"

$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$newBmp = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height)

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $pixel = $bmp.GetPixel($x, $y)
        # Calculate brightness/intensity of the pixel
        $brightness = ($pixel.R + $pixel.G + $pixel.B) / 3.0
        
        # If it is dark background (under threshold), make it transparent
        # Otherwise, keep it. We can also smoothly fade the alpha for anti-aliasing near edges.
        if ($brightness -lt 30) {
            $newBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($brightness -lt 65) {
            # Smooth transition for edge anti-aliasing
            $alpha = [int](($brightness - 30) / (65 - 30) * 255)
            if ($alpha -lt 0) { $alpha = 0 }
            if ($alpha -gt 255) { $alpha = 255 }
            $newBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
        } else {
            $newBmp.SetPixel($x, $y, $pixel)
        }
    }
}

$newBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$newBmp.Dispose()
Write-Host "Processed transparent PNG successfully saved to $destPath"
