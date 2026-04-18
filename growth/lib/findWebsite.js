/**
 * Website Finder - Try common domain patterns for Saudi clinics
 */

const axios = require('axios');

async function findWebsite(clinicName, city) {
  const patterns = generateDomainPatterns(clinicName, city);
  
  for (const url of patterns) {
    try {
      const result = await tryWebsite(url);
      if (result.found) {
        return result;
      }
    } catch (e) {
      continue;
    }
  }
  
  return { found: false, tried: patterns.length };
}

function generateDomainPatterns(name, city) {
  const cleanName = name
    .toLowerCase()
    .replace(/عيادة|مستشفى|دكتور|د\.|clinic|dental|medical|hospital/g, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, '');
  
  const cleanCity = city.toLowerCase().replace(/\s+/g, '');
  
  const tlds = ['.com.sa', '.sa', '.com', '.net', '.org'];
  const separators = ['', '-', '_', 'dental', 'clinic'];
  
  const patterns = [];
  
  // Primary patterns
  for (const tld of tlds.slice(0, 2)) { // .com.sa, .sa first
    patterns.push(`https://www.${cleanName}${tld}`);
    patterns.push(`https://${cleanName}${tld}`);
  }
  
  // Secondary patterns with separators
  for (const sep of separators.slice(1)) {
    patterns.push(`https://www.${cleanName}${sep}dental.com.sa`);
    patterns.push(`https://${cleanName}${sep}dental.com`);
  }
  
  // City-specific
  if (cleanCity && cleanCity !== 'unknown') {
    patterns.push(`https://www.${cleanName}-${cleanCity}.com.sa`);
  }
  
  return [...new Set(patterns)].slice(0, 8); // Max 8 attempts
}

async function tryWebsite(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  
  try {
    const response = await axios.get(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 3,
      validateStatus: (status) => status < 400 || status === 403 // Allow 403 (protected)
    });
    
    clearTimeout(timeout);
    
    // Extract owner name from page content
    const ownerName = extractOwnerName(response.data);
    const phones = extractPhones(response.data);
    const emails = extractEmails(response.data);
    
    return {
      found: true,
      url,
      status: response.status,
      title: extractTitle(response.data),
      ownerName,
      phones,
      emails,
      hasAboutPage: /about|من نحن|فريق|team|doctors|أطباء/i.test(response.data),
      language: detectLanguage(response.data)
    };
    
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function extractOwnerName(html) {
  // Pattern: Dr. Name / د. Name / Doctor Name
  const patterns = [
    /(?:Dr\.|Doctor|د\.|الدكتور|دكتور)\s*([A-Z][a-zA-Z\s]{2,25}|[\u0600-\u06FF\s]{3,30})/i,
    /(?:Founder|Owner|Founder & CEO|مؤسس|صاحب)\s*[:-]?\s*([^<,]{3,30})/i,
    /(?:الطبيب|الدكتور)\s*الأساسي\s*[:-]?\s*([\u0600-\u06FF\s]{3,25})/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim().length > 2) {
      return match[1].trim().replace(/<[^>]+>/g, '');
    }
  }
  
  return null;
}

function extractPhones(html) {
  const matches = html.match(/(\+?966[0-9\s-]{9,14}|05[0-9\s-]{8,10})/g) || [];
  return [...new Set(matches.map(p => p.replace(/[\s-]/g, '')))].filter(p => p.length >= 9);
}

function extractEmails(html) {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(matches)];
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

function detectLanguage(html) {
  const arabic = /[\u0600-\u06FF]/.test(html);
  const english = /[a-zA-Z]{10,}/.test(html);
  if (arabic && english) return 'bilingual';
  if (arabic) return 'arabic';
  if (english) return 'english';
  return 'unknown';
}

module.exports = { findWebsite, generateDomainPatterns };
