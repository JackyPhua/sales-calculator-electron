#!/usr/bin/env node
/**
 * CommissionPro License Key Generator
 * 
 * Usage:
 *   node license-generator.js              → Generate 1 key
 *   node license-generator.js 5            → Generate 5 keys
 *   node license-generator.js 10 keys.txt  → Generate 10 keys and save to file
 * 
 * IMPORTANT: Keep this file PRIVATE. Never distribute it.
 * The LICENSE_SECRET must match the one in main.js.
 */

const crypto = require('crypto');

// ⚠️ This MUST match the LICENSE_SECRET in main.js
const LICENSE_SECRET = 'CP2026-xK9mQ4vR7nB2pL5w';

function randomSegment() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
    let seg = '';
    for (let i = 0; i < 4; i++) {
        seg += chars[crypto.randomInt(chars.length)];
    }
    return seg;
}

function generateKeySignature(keyBody) {
    return crypto.createHmac('sha256', LICENSE_SECRET)
        .update(keyBody)
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();
}

function generateLicenseKey() {
    const seg1 = 'CPRO';
    const seg2 = randomSegment();
    const seg3 = randomSegment();
    const seg4 = randomSegment();
    
    const keyBody = `${seg1}-${seg2}-${seg3}-${seg4}`;
    const checksum = generateKeySignature(keyBody);
    
    // Take first 4 chars of checksum as the 5th segment
    const seg5 = checksum.substring(0, 4);
    
    return `${keyBody}-${seg5}`;
}

function validateKey(key) {
    const parts = key.split('-');
    if (parts.length !== 5 || parts[0] !== 'CPRO') return false;
    
    const keyBody = parts.slice(0, 4).join('-');
    const expectedCheck = generateKeySignature(keyBody);
    return parts[4] === expectedCheck.substring(0, 4);
}

// ── Main ──
const count = parseInt(process.argv[2]) || 1;
const outputFile = process.argv[3] || null;

console.log('╔══════════════════════════════════════════╗');
console.log('║   CommissionPro License Key Generator    ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

const keys = [];
for (let i = 0; i < count; i++) {
    const key = generateLicenseKey();
    const valid = validateKey(key);
    keys.push(key);
    console.log(`  ${i + 1}. ${key}  ${valid ? '✅' : '❌'}`);
}

if (outputFile) {
    const fs = require('fs');
    const content = keys.map((k, i) => `${i + 1}. ${k}`).join('\n');
    fs.writeFileSync(outputFile, content + '\n');
    console.log(`\n📁 Saved ${count} key(s) to ${outputFile}`);
}

console.log(`\n✅ Generated ${count} license key(s)`);
console.log('⚠️  Keep this tool private!\n');
