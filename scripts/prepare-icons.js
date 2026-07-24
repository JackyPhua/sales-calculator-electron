/**
 * Generate app icons from assets/logo.png (run after replacing logo.png).
 * Outputs: assets/icon.png, assets/icon.ico
 */
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const logoPath = path.join(assetsDir, 'logo.png');

async function main() {
    if (!fs.existsSync(logoPath)) {
        console.error('Missing assets/logo.png');
        process.exit(1);
    }

    const sharp = require('sharp');
    const pngToIcoMod = require('png-to-ico');
    const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : pngToIcoMod.default;

    const meta = await sharp(logoPath).metadata();
    const w = meta.width || 512;
    const h = meta.height || 512;

    // Square crop around the circular emblem (top portion of master logo).
    const cropSize = Math.round(Math.min(w, h * 0.42));
    const left = Math.round((w - cropSize) / 2);
    const top = Math.round(h * 0.03);

    const emblem = sharp(logoPath).extract({ left, top, width: cropSize, height: cropSize });

    const iconPng = path.join(assetsDir, 'icon.png');
    await emblem.clone().resize(512, 512, { fit: 'contain', background: { r: 8, g: 15, b: 26, alpha: 1 } }).png().toFile(iconPng);

    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const pngBuffers = await Promise.all(
        sizes.map(function (size) {
            return emblem.clone().resize(size, size, { fit: 'contain', background: { r: 8, g: 15, b: 26, alpha: 1 } }).png().toBuffer();
        })
    );

    const iconIco = path.join(assetsDir, 'icon.ico');
    fs.writeFileSync(iconIco, await pngToIco(pngBuffers));

    const navCropH = Math.round(h * 0.62);
    const navLogo = path.join(assetsDir, 'nav-logo.png');
    await sharp(logoPath)
        .extract({ left: 0, top: 0, width: w, height: Math.min(navCropH, h) })
        .png()
        .toFile(navLogo);

    console.log('Generated', path.relative(process.cwd(), iconPng));
    console.log('Generated', path.relative(process.cwd(), iconIco));
    console.log('Generated', path.relative(process.cwd(), navLogo));
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
