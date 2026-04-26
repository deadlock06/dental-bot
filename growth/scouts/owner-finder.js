const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../../db.js'); // Use db instead of { db } based on existing codebase structure

class OwnerFinder {
  async enrich(clinicName, city, existingPhone) {
    const results = {
      clinic_name: clinicName,
      city: city,
      owner_name: null,
      direct_phone: null,
      source: null,
      confidence: 0,
      flagged_for_manual: false
    };

    // Strategy 1: Google Places / Business Profile meta
    const googleData = await this.searchGoogle(`${clinicName} dentist owner ${city}`);
    if (googleData.name && googleData.name !== clinicName) {
      results.owner_name = googleData.name;
      results.confidence += 30;
      results.source = 'google_meta';
    }

    // Strategy 2: Clinic website "About Us" / "Team" page
    if (googleData.website) {
      const siteData = await this.scrapeWebsite(googleData.website);
      if (siteData.owner) {
        results.owner_name = siteData.owner;
        results.confidence += 40;
        results.source = results.source ? results.source + '+website' : 'website';
      }
      if (siteData.phone && siteData.phone !== existingPhone) {
        results.direct_phone = siteData.phone;
        results.confidence += 20;
      }
    }

    // Strategy 3: LinkedIn public search (fallback)
    const linkedInName = await this.searchLinkedIn(`${clinicName} owner dentist ${city}`);
    if (linkedInName && !results.owner_name) {
      results.owner_name = linkedInName;
      results.confidence += 25;
      results.source = 'linkedin';
    }

    // Confidence gate
    if (results.confidence < 60) {
      results.flagged_for_manual = true;
      await this.flagForJake(results);
    }

    // Save to Supabase
    // Assuming a generic update method or we can just return it for the caller to handle
    // For now, we return it. The caller should save it.
    // await db.updateLeadEnrichment(clinicName, results); 
    return results;
  }

  async searchGoogle(query) {
    try {
      // Use SerpAPI or similar. Fallback to simple axios if no API key.
      const apiKey = process.env.SERP_API_KEY;
      if (!apiKey) return { name: null, website: null };

      const res = await axios.get('https://serpapi.com/search', {
        params: { q: query, api_key: apiKey, num: 3 }
      });

      const organic = res.data.organic_results?.[0];
      return {
        name: res.data.knowledge_graph?.title || null,
        website: organic?.link || null
      };
    } catch (e) {
      return { name: null, website: null };
    }
  }

  async scrapeWebsite(url) {
    try {
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      
      // Heuristic: Look for "Dr." or "Doctor" near names
      const text = $('body').text();
      const drMatch = text.match(/(Dr\.?\s+[A-Z][a-zA-Z\s]{2,20})/);
      const owner = drMatch ? drMatch[1].trim() : null;

      // Look for phone
      const phoneMatch = text.match(/(\+966\s?5\d{8}|05\d{8})/);
      const phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;

      return { owner, phone };
    } catch (e) {
      return { owner: null, phone: null };
    }
  }

  async searchLinkedIn(query) {
    // Placeholder: LinkedIn scraping is risky. 
    // For now, return null and rely on Google + Website.
    // Future: Use Proxycurl API or similar.
    return null;
  }

  async flagForJake(data) {
    const msg = `🔍 OWNER FINDER: Low confidence for ${data.clinic_name}\nCity: ${data.city}\nBest guess: ${data.owner_name || 'None'}\nNeeds manual lookup.`;
    const { sendMessage } = require('../../whatsapp.js');
    await sendMessage(process.env.ADMIN_PHONE || '+966570733834', msg);
  }
}

module.exports = new OwnerFinder();
